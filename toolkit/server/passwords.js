// Password policy (NIST SP 800-63B aligned): length over composition rules,
// no forced rotation, and a refusal of well-known weak or context-derived values.
//
// bcrypt only reads the first 72 BYTES of its input; anything beyond that is
// silently ignored, so two different long passwords could authenticate as one.
// The policy therefore caps the encoded length at 72 bytes instead of accepting
// a longer value that would not actually be honoured.
const MIN_LENGTH = 12;
const MAX_BYTES = 72;

// Base words that make a password guessable when only digits/symbols/case are added.
const BASE_WORDS = new Set([
  'password', 'passw0rd', 'passwort', 'letmein', 'welcome', 'qwerty', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  'iloveyou', 'admin', 'administrator', 'login', 'monkey', 'dragon', 'master', 'shadow', 'sunshine',
  'princess', 'football', 'baseball', 'superman', 'batman', 'trustno', 'changeme', 'secret', 'toolkit',
  'sigma', 'pigment', 'imagevendor', 'placeholder', 'abc', 'abcdef', 'abcdefgh', 'default', 'guest',
  'hello', 'freedom', 'whatever', 'computer', 'internet', 'starwars', 'cheese', 'summer', 'winter',
]);
const COMMON_EXACT = new Set([
  '123456789012', '1234567890123', '12345678901234', '111111111111', '000000000000', '123123123123',
  'qwertyuiop12', 'qwertyuiopas', 'qwertyuiopasdf', 'asdfghjklqwe', '1q2w3e4r5t6y', '1qaz2wsx3edc',
  'zaq12wsxcde3', 'abcdefghijkl', 'abcdefghijklm', 'abc123abc123', 'iloveyou1234', 'letmein12345',
  'welcome12345', 'password1234', 'password12345', 'passwordpassword', 'p@ssw0rd1234', 'administrator',
]);

function normalizeForCompare(value) {
  return String(value).normalize('NFKC').toLowerCase();
}

function isSequential(s) {
  if (s.length < 6) return false;
  let up = true, down = true;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  return up || down;
}

// Returns null when acceptable, otherwise a user-facing reason.
function checkPassword(password, { email = '', name = '' } = {}) {
  if (typeof password !== 'string') return 'Enter a password.';
  if ([...password].length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
    return `Password is too long (maximum ${MAX_BYTES} bytes, roughly ${MAX_BYTES} plain characters).`;
  }
  if (password.includes('\u0000')) return 'Password contains an invalid character.';

  const lower = normalizeForCompare(password);
  const alnum = lower.replace(/[^\p{L}\p{N}]/gu, '');
  const letters = lower.replace(/[^\p{L}]/gu, '');
  if (new Set(lower).size < 5) return 'Password is too repetitive.';
  if (isSequential(alnum)) return 'Password is a simple sequence.';
  if (COMMON_EXACT.has(lower) || COMMON_EXACT.has(alnum)) return 'That password is too common.';
  // "Password1234!" style: a known base word, repeated or decorated only with digits/symbols.
  for (const word of BASE_WORDS) {
    if (letters === word || letters === word.repeat(Math.max(1, Math.floor(letters.length / word.length)))) {
      return 'That password is too common.';
    }
  }
  // Must not be derived from the account's own identifiers.
  const local = normalizeForCompare(String(email).split('@')[0] || '').replace(/[^\p{L}\p{N}]/gu, '');
  if (local.length >= 4 && alnum.includes(local)) return 'Password must not contain your email name.';
  for (const token of normalizeForCompare(name).split(/[^\p{L}\p{N}]+/u)) {
    if (token.length >= 4 && alnum.includes(token)) return 'Password must not contain your name.';
  }
  return null;
}

module.exports = { checkPassword, MIN_LENGTH, MAX_BYTES };
