// Email address validation: strict syntax first, then a DNS deliverability check.
//
// Syntax follows the practical subset of RFC 5321/5322 that real mail systems
// accept (dot-atom local part, LDH domain labels, alphabetic TLD). Quoted local
// parts, comments, IP literals and non-ASCII local parts are refused on purpose:
// they are almost never legitimate for a signup form and each is a known source
// of parser-differential bugs.
//
// The DNS check rejects domains that definitively cannot receive mail (NXDOMAIN,
// no MX/A/AAAA, or an RFC 7505 null MX). Transient resolver problems (offline,
// timeout, SERVFAIL) never block a signup, so the desktop app works offline.
// checkSignupAddress() adds the provider rules from email-providers.js.
const dns = require('node:dns').promises;
const { domainToASCII } = require('node:url');
const providers = require('./email-providers');

const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;
// Names that can never be public mailboxes (RFC 2606 / 6761 / 6762 and common private suffixes).
const RESERVED_TLDS = new Set([
  'invalid', 'localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home',
  'corp', 'test', 'example', 'onion', 'arpa',
]);

function normalizeEmail(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'Enter a valid email address.' };
  const value = raw.trim();
  if (!value || value.length > 254) return { ok: false, reason: 'Enter a valid email address.' };
  // Whitespace, control characters and bidi/format characters have no place in an address.
  if (/[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(value)) {
    return { ok: false, reason: 'Email addresses cannot contain spaces or hidden characters.' };
  }
  const at = value.lastIndexOf('@');
  if (at < 1 || at !== value.indexOf('@')) return { ok: false, reason: 'Enter a valid email address.' };
  const local = value.slice(0, at);
  const domainRaw = value.slice(at + 1);
  if (local.length > 64 || !LOCAL_PART.test(local)) {
    return { ok: false, reason: 'The part before the @ contains characters that are not allowed.' };
  }
  // Internationalised domains are converted to their ASCII (punycode) form so every
  // later comparison, DNS lookup and stored value uses one canonical spelling.
  const domain = domainToASCII(domainRaw.toLowerCase());
  if (!domain || domain.length > 253 || domain.endsWith('.')) return { ok: false, reason: 'Enter a valid email domain.' };
  const labels = domain.split('.');
  if (labels.length < 2 || !labels.every(l => DOMAIN_LABEL.test(l))) {
    return { ok: false, reason: 'Enter a valid email domain.' };
  }
  const tld = labels[labels.length - 1];
  if (!TLD.test(tld)) return { ok: false, reason: 'Enter a valid email domain.' };
  if (RESERVED_TLDS.has(tld)) return { ok: false, reason: 'That email domain cannot receive mail.' };
  return { ok: true, email: `${local.toLowerCase()}@${domain}`, local: local.toLowerCase(), domain };
}

const TRANSIENT = new Set(['ETIMEOUT', 'ECONNREFUSED', 'ESERVFAIL', 'EREFUSED', 'EAI_AGAIN', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECANCELLED', 'EBADRESP', 'ENOTINITIALIZED', 'ECONNABORTED', 'EOF']);
const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 2000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Returns { result: 'ok' | 'undeliverable' | 'unknown', hosts: [MX host names] }. Never throws.
async function lookupMail(domain, { resolver = dns, timeoutMs = 3000 } = {}) {
  const hit = cache.get(domain);
  if (hit && hit.until > Date.now()) return { result: hit.result, hosts: hit.hosts };
  let result = 'unknown';
  let hosts = [];
  try {
    try {
      const mx = await withTimeout(resolver.resolveMx(domain), timeoutMs);
      if (mx.length > 0) {
        // RFC 7505 null MX: the domain explicitly accepts no mail.
        const nullMx = mx.length === 1 && (mx[0].exchange === '' || mx[0].exchange === '.');
        result = nullMx ? 'undeliverable' : 'ok';
        if (!nullMx) hosts = mx.map(r => String(r.exchange || '').toLowerCase()).filter(Boolean);
      } else result = 'fallback';
    } catch (err) {
      if (TRANSIENT.has(err && err.code)) throw err;
      result = 'fallback'; // ENODATA / ENOTFOUND: try the implicit-MX rule below.
    }
    if (result === 'fallback') {
      // RFC 5321 5.1: a domain with an address record but no MX still receives mail.
      let found = false;
      for (const kind of ['resolve4', 'resolve6']) {
        try { if ((await withTimeout(resolver[kind](domain), timeoutMs)).length) { found = true; break; } }
        catch (err) { if (TRANSIENT.has(err && err.code)) throw err; }
      }
      result = found ? 'ok' : 'undeliverable';
    }
  } catch {
    result = 'unknown';
  }
  if (result !== 'unknown') {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(domain, { result, hosts, until: Date.now() + CACHE_MS });
  }
  return { result, hosts };
}

// Returns 'ok' | 'undeliverable' | 'unknown'. Never throws.
async function checkDomain(domain, options) {
  return (await lookupMail(domain, options)).result;
}

// 'on' (default) or 'off'. Tests and fully air-gapped installs may disable the lookup.
function dnsCheckEnabled() { return process.env.TOOLKIT_EMAIL_DNS_CHECK !== 'off'; }
// 'on' (default): only established providers. 'off': any deliverable domain (disposable
// inboxes and typos are still refused).
// TEMPORARY (2026-11-22): off unless set to 'on'. TODO: flip back to "!== 'off'".
function providerCheckEnabled() { return process.env.TOOLKIT_EMAIL_PROVIDER_CHECK === 'on'; }

const DISPOSABLE_REASON = 'Temporary or disposable email addresses cannot be used. Use your regular email address.';
const UNRECOGNISED_REASON = 'Use an address from an established email provider (such as Gmail, Outlook, iCloud, Yahoo or Proton), ' +
  'or a work or school address hosted by one.';

// Decides whether a syntactically valid address may be used for a new email/password
// account. Returns { ok: true } or { ok: false, code, reason }. Never throws.
//   undeliverable: the domain cannot receive mail at all (typo, made-up or null-MX domain)
//   disposable:    a temporary-inbox service
//   typo:          a misspelling of a major provider (reason suggests the fix)
//   unrecognised:  deliverable, but not run by an established provider
// A DNS outage never blocks a sign-up: the emailed code remains the real proof.
async function checkSignupAddress(parsed, { resolver = dns, timeoutMs = 3000, dnsEnabled = dnsCheckEnabled(), strict = providerCheckEnabled() } = {}) {
  const domain = parsed.domain;
  if (providers.isDisposable(domain)) return { ok: false, code: 'disposable', reason: DISPOSABLE_REASON };
  const fix = providers.typoFor(domain);
  if (fix) return { ok: false, code: 'typo', reason: `Check the address: did you mean ${parsed.local}@${fix}?`, suggestion: `${parsed.local}@${fix}` };
  if (!dnsEnabled) return { ok: true };
  const { result, hosts } = await lookupMail(domain, { resolver, timeoutMs });
  if (result === 'undeliverable') return { ok: false, code: 'undeliverable', reason: 'That email domain does not appear to accept mail. Check for typos.' };
  if (result === 'unknown') return { ok: true };
  if (hosts.some(providers.isDisposableMailHost)) return { ok: false, code: 'disposable', reason: DISPOSABLE_REASON };
  if (!strict || providers.isKnownProvider(domain) || hosts.some(providers.isEstablishedMailHost)) return { ok: true };
  return { ok: false, code: 'unrecognised', reason: UNRECOGNISED_REASON };
}

module.exports = { normalizeEmail, checkDomain, checkSignupAddress, dnsCheckEnabled, providerCheckEnabled, RESERVED_TLDS };
