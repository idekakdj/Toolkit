// Live password strength meter for the sign-up, password-reset and account pages.
// It mirrors the server's rules (server/passwords.js): the top level, "Strong", is
// at least 10 characters with a capital letter, a number and a symbol, and it is the
// minimum the server accepts. The server additionally refuses common or guessable
// passwords (for example "Password123!"), so it always has the final word.
export const MIN_LENGTH = 10;

const RULES = [
  { key: 'length', text: n => `At least ${n} characters`, test: (p, n) => [...p].length >= n },
  { key: 'capital', text: () => 'A capital letter', test: p => /\p{Lu}/u.test(p) },
  { key: 'number', text: () => 'A number', test: p => /\p{Nd}/u.test(p) },
  { key: 'symbol', text: () => 'A symbol, like ! ? # or -', test: p => /[^\p{L}\p{N}\s]/u.test(p) },
];
const LEVELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

export function assess(password, minLength = MIN_LENGTH) {
  const value = String(password || '');
  const met = {};
  let score = 0;
  for (const rule of RULES) {
    met[rule.key] = rule.test(value, minLength);
    if (met[rule.key]) score++;
  }
  return { score, met, label: LEVELS[score], strong: score === RULES.length };
}

// The first rule the password misses, worded like the server's message, or null.
export function weakReason(password, minLength = MIN_LENGTH) {
  const { met } = assess(password, minLength);
  if (!met.length) return `Password must be at least ${minLength} characters.`;
  if (!met.capital) return 'Password needs at least one capital letter.';
  if (!met.number) return 'Password needs at least one number.';
  if (!met.symbol) return 'Password needs at least one symbol, such as ! ? # $ or -.';
  return null;
}

// Builds the meter right after `input` and keeps it in step as the person types.
export function attachMeter(input, { minLength = MIN_LENGTH } = {}) {
  const box = document.createElement('div');
  box.className = 'pw-meter';
  box.dataset.score = '0';
  const bar = document.createElement('div');
  bar.className = 'pw-bar';
  bar.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < RULES.length; i++) bar.append(document.createElement('span'));
  const label = document.createElement('p');
  label.className = 'pw-label';
  label.setAttribute('aria-live', 'polite');
  const list = document.createElement('ul');
  list.className = 'pw-rules';
  const items = RULES.map(rule => {
    const li = document.createElement('li');
    li.dataset.rule = rule.key;
    list.append(li);
    return li;
  });
  box.append(bar, label, list);
  input.insertAdjacentElement('afterend', box);

  function update() {
    const result = assess(input.value, minLength);
    const typed = input.value.length > 0;
    box.dataset.score = typed ? String(result.score) : '0';
    label.textContent = typed ? 'Strength: ' + result.label : 'Password strength';
    RULES.forEach((rule, i) => {
      items[i].textContent = rule.text(minLength);
      items[i].dataset.met = String(result.met[rule.key]);
      items[i].setAttribute('aria-label', rule.text(minLength) + (result.met[rule.key] ? ' (done)' : ' (missing)'));
    });
    return result;
  }
  input.addEventListener('input', update);
  update();
  return {
    element: box,
    update,
    setMinLength(n) { if (Number.isInteger(n) && n > 0) { minLength = n; update(); } },
  };
}

// Live "passwords match" feedback for a confirm field.
export function attachMatch(first, second, hint) {
  function update() {
    if (!second.value) { hint.textContent = ''; hint.dataset.state = ''; return; }
    const same = first.value === second.value;
    hint.textContent = same ? 'Passwords match.' : 'Passwords do not match yet.';
    hint.dataset.state = same ? 'ok' : 'bad';
  }
  first.addEventListener('input', update);
  second.addEventListener('input', update);
  return { update };
}
