// Which email providers Toolkit accepts for email-and-password sign-ups.
//
// An address is accepted when its mailbox is run by an established provider:
//   1. a well-known mail service (Gmail, Outlook/Hotmail, Yahoo, iCloud, Proton, ...) or ISP,
//   2. an education or government domain (.edu, .gov, .ac.uk, .gc.ca, ...), or
//   3. a custom domain whose MX records point at an established mail host
//      (Google Workspace, Microsoft 365, Zoho, Fastmail, Proofpoint, ...).
// Disposable / temporary-inbox services are always refused, and common typos of the big
// providers ("gmial.com") are refused with a suggestion. The emailed confirmation code is
// still what proves the person owns the mailbox; this check keeps throwaway and mistyped
// addresses out before a code is ever sent.

// ---------- well-known mail services and ISPs ----------
const PROVIDER_DOMAINS = new Set([
  // Google, Microsoft, Apple, Yahoo/AOL
  'gmail.com', 'googlemail.com', 'msn.com', 'passport.com', 'icloud.com', 'me.com', 'mac.com',
  'ymail.com', 'rocketmail.com', 'aol.com', 'aim.com', 'verizon.net',
  // privacy-focused and independent providers
  'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me', 'tuta.com', 'tuta.io', 'tutanota.com',
  'tutanota.de', 'tutamail.com', 'keemail.me', 'fastmail.com', 'fastmail.fm', 'hey.com', 'mailbox.org',
  'posteo.de', 'posteo.net', 'runbox.com', 'startmail.com', 'hushmail.com', 'zoho.com', 'zohomail.com',
  'zoho.eu', 'zohomail.eu', 'zoho.in', 'mail.com', 'email.com', 'gmx.com', 'gmx.net', 'gmx.de', 'gmx.at',
  'gmx.ch', 'gmx.us', 'gmx.co.uk', 'gmx.fr', 'web.de', 'yandex.com', 'yandex.ru', 'ya.ru', 'mail.ru',
  'inbox.ru', 'list.ru', 'bk.ru',
  // North American ISPs
  'comcast.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net', 'spectrum.net',
  'earthlink.net', 'optonline.net', 'frontier.com', 'centurylink.net', 'windstream.net', 'juno.com',
  'netzero.net', 'shaw.ca', 'rogers.com', 'sympatico.ca', 'bell.net', 'videotron.ca', 'telus.net',
  'cogeco.ca', 'eastlink.ca', 'sasktel.net',
  // European ISPs and portals
  'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net', 'ntlworld.com', 'blueyonder.co.uk',
  'orange.fr', 'wanadoo.fr', 'free.fr', 'laposte.net', 'sfr.fr', 't-online.de', 'freenet.de', 'libero.it',
  'virgilio.it', 'tiscali.it', 'alice.it', 'telenet.be', 'skynet.be', 'ziggo.nl', 'kpnmail.nl', 'xs4all.nl',
  'bluewin.ch', 'seznam.cz', 'wp.pl', 'o2.pl', 'onet.pl', 'interia.pl',
  // Asia-Pacific and Latin America
  'qq.com', '163.com', '126.com', 'sina.com', 'naver.com', 'daum.net', 'hanmail.net', 'rediffmail.com',
  'bigpond.com', 'optusnet.com.au', 'xtra.co.nz', 'uol.com.br', 'bol.com.br', 'terra.com.br',
]);
// Country editions of the largest services: outlook.fr, hotmail.co.uk, yahoo.com.au, ...
const CC = '(?:com|[a-z]{2}|co\\.[a-z]{2}|com\\.[a-z]{2})';
const PROVIDER_FAMILIES = [
  new RegExp(`^(?:outlook|hotmail|live|windowslive)\\.${CC}$`),
  new RegExp(`^yahoo\\.${CC}$`),
  new RegExp(`^aol\\.${CC}$`),
];
// Domains only institutions can register.
const INSTITUTION = [/\.(?:edu|gov|mil)$/, /\.(?:ac|edu|gov|govt|mil)\.[a-z]{2}$/, /\.gc\.ca$/, /\.gouv\.[a-z]{2}$/];

// ---------- established mail hosts (MX record targets) ----------
// A custom domain whose MX points at one of these is run by an established provider.
const MAIL_HOSTS = [
  'google.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'outlook.cn', 'icloud.com', 'me.com',
  'yahoodns.net', 'yahoo.com', 'aol.com', 'zoho.com', 'zoho.eu', 'zoho.in', 'zoho.com.au', 'zohomail.com',
  'protonmail.ch', 'proton.me', 'messagingengine.com', 'tutanota.de', 'tuta.com', 'gmx.net', 'web.de',
  'mail.com', 'kundenserver.de', 'ionos.com', 'ionos.de', 'ionos.co.uk', 'perfora.net', 'yandex.net',
  'yandex.ru', 'mail.ru', 'mailbox.org', 'posteo.de', 'fastmail.com', 'hey.com', 'qq.com', '163.com',
  'mxhichina.com', 'naver.com',
  // enterprise mail security gateways (they front a company's real mailboxes)
  'pphosted.com', 'ppe-hosted.com', 'mimecast.com', 'mimecast.co.za', 'barracudanetworks.com', 'iphmx.com',
  'messagelabs.com', 'trendmicro.com', 'trendmicro.eu', 'sophos.com', 'mailcontrol.com', 'fireeyecloud.com',
  'hornetsecurity.com', 'spamh.com', 'mailanyone.net', 'arsmtp.com',
  // business email hosting
  'secureserver.net', 'emailsrvr.com', 'ovh.net', 'hostinger.com', 'titan.email', 'privateemail.com',
  'registrar-servers.com', 'migadu.com', 'inbound-smtp.us-east-1.amazonaws.com',
  'inbound-smtp.us-west-2.amazonaws.com', 'inbound-smtp.eu-west-1.amazonaws.com', 'mx.cloudflare.net',
  'improvmx.com', 'forwardemail.net', 'rackspace.com', 'one.com', 'strato.de', 'hostpoint.ch',
  // ISP mail exchangers
  'comcast.net', 'prodigy.net', 'att.net', 'cox.net', 'charter.net', 'shaw.ca', 'bell.net', 'telus.net',
  'videotron.ca', 'sky.com', 'virginmedia.com', 'btinternet.com', 'orange.fr', 'free.fr', 'sfr.fr',
  't-online.de', 'laposte.net',
];

// ---------- disposable / temporary inboxes ----------
const DISPOSABLE = [
  'mailinator.com', 'mailinator.net', 'mailinator2.com', 'guerrillamail.com', 'guerrillamail.net',
  'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de', 'guerrillamailblock.com', 'sharklasers.com',
  'grr.la', 'pokemail.net', 'spam4.me', '10minutemail.com', '10minutemail.net', '10minutemail.co.uk',
  '20minutemail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmail.dev',
  'tempmailo.com', 'tempmail.plus', 'tempr.email', 'tempinbox.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'throwawaymail.com', 'trashmail.com', 'trashmail.de', 'trashmail.net', 'trashmail.io', 'getnada.com',
  'nada.email', 'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'mintemail.com', 'mohmal.com',
  'emailondeck.com', 'fakeinbox.com', 'mytemp.email', 'spamgourmet.com', 'mailcatch.com', 'burnermail.io',
  'discard.email', 'moakt.com', 'mail.tm', 'inboxkitten.com', 'mailpoof.com', 'emailfake.com',
  'minuteinbox.com', 'fakemail.net', 'getairmail.com', 'mailsac.com', 'harakirimail.com', 'tmail.ws',
  'tmpmail.org', 'tmpmail.net', 'dropmail.me', 'emltmp.com', 'spambox.us', 'mvrht.net', 'byom.de',
  'trbvm.com', 'cuvox.de', 'dayrep.com', 'einrot.com', 'fleckens.hu', 'gustr.com', 'jourrapide.com',
  'rhyta.com', 'superrito.com', 'teleworm.us', 'armyspy.com', 'mailforspam.com', 'incognitomail.org',
  'anonbox.net', 'mailexpire.com', 'spamex.com', 'jetable.org', 'mytrashmail.com', 'wegwerfmail.de',
  'wegwerfemail.de', 'luxusmail.org', 'tempail.com', 'mailtemp.info', 'linshiyouxiang.net', 'bccto.me',
  'chacuo.net', '33mail.com', 'mailnull.com', 'e4ward.com', 'spamfree24.org', 'kasmail.com', 'owlymail.com',
];

// ---------- typos of the biggest providers ----------
const TYPOS = new Map(Object.entries({
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmali.com': 'gmail.com', 'gmaul.com': 'gmail.com',
  'gmil.com': 'gmail.com', 'gmeil.com': 'gmail.com', 'gimail.com': 'gmail.com', 'gemail.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com',
  'gmail.comm': 'gmail.com', 'gmail.cmo': 'gmail.com', 'gmail.vom': 'gmail.com', 'gmail.xom': 'gmail.com',
  'gmail.net': 'gmail.com', 'gmail.org': 'gmail.com', 'googlemail.co': 'googlemail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'hotamil.com': 'hotmail.com', 'homail.com': 'hotmail.com', 'hotmaill.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com', 'hotnail.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'hotmail.cm': 'hotmail.com', 'hotmail.om': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outllok.com': 'outlook.com', 'outloo.com': 'outlook.com',
  'outlool.com': 'outlook.com', 'otlook.com': 'outlook.com', 'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com', 'outlook.cm': 'outlook.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhoo.com': 'yahoo.com', 'yahho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahoo.cm': 'yahoo.com', 'yahoo.om': 'yahoo.com',
  'iclod.com': 'icloud.com', 'icoud.com': 'icloud.com', 'icluod.com': 'icloud.com', 'iclould.com': 'icloud.com',
  'icloud.co': 'icloud.com', 'icloud.con': 'icloud.com', 'icloud.cm': 'icloud.com',
  'protonmail.co': 'protonmail.com', 'protonmal.com': 'protonmail.com', 'protonmial.com': 'protonmail.com',
  'aol.co': 'aol.com', 'aol.con': 'aol.com',
}));

// True when `domain` equals `suffix` or is a subdomain of it.
const within = (domain, suffix) => domain === suffix || domain.endsWith('.' + suffix);

function isDisposable(domain) { return DISPOSABLE.some(d => within(domain, d)); }
function typoFor(domain) { return TYPOS.get(domain) || null; }
function isKnownProvider(domain) {
  return PROVIDER_DOMAINS.has(domain) || PROVIDER_FAMILIES.some(r => r.test(domain)) || INSTITUTION.some(r => r.test(domain));
}
function isEstablishedMailHost(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  return MAIL_HOSTS.some(s => within(h, s));
}
function isDisposableMailHost(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  return DISPOSABLE.some(s => within(h, s));
}

module.exports = { isDisposable, typoFor, isKnownProvider, isEstablishedMailHost, isDisposableMailHost };
