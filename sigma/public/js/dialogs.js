// Shared modal keyboard/focus behavior; keeps existing modal styling.
const origins = new WeakMap();
export function showDialog(backdrop) {
  origins.set(backdrop, document.activeElement);
  backdrop.classList.add('show');
  const dialog = backdrop.querySelector('.modal');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;
  const heading = dialog.querySelector('h2, h3');
  if (heading) {
    heading.id ||= backdrop.id + '-title';
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  (dialog.querySelector('input:not([type="file"]), button, select') || dialog).focus();
}
export function hideDialog(backdrop) {
  backdrop.classList.remove('show');
  origins.get(backdrop)?.focus();
}
export function initDialogs() {
  for (const button of document.querySelectorAll('[data-close]')) {
    button.setAttribute('aria-label', 'Close dialog');
    button.addEventListener('click', () => hideDialog(document.getElementById(button.dataset.close)));
  }
  for (const backdrop of document.querySelectorAll('.modal-backdrop')) {
    backdrop.addEventListener('click', e => { if (e.target === backdrop) hideDialog(backdrop); });
  }
  document.addEventListener('keydown', e => {
    const backdrop = document.querySelector('.modal-backdrop.show');
    if (!backdrop) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideDialog(backdrop); }
    if (e.key === 'Tab') {
      const targets = [...backdrop.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
        .filter(el => !el.disabled && el.getClientRects().length);
      if (!targets.length) { e.preventDefault(); return; }
      const index = targets.indexOf(document.activeElement);
      if ((e.shiftKey && index <= 0) || (!e.shiftKey && (index < 0 || index === targets.length - 1))) {
        e.preventDefault(); targets[e.shiftKey ? targets.length - 1 : 0].focus();
      }
    }
  }, true);
}
