// Sigma's built-in clipart library. Every piece is original, hand-written SVG
// in a 100x100 viewBox. "tintable" art uses currentColor so the user can
// recolor it from the properties panel.
export const CLIPART = [
  {
    id: 'star', name: 'Star', tintable: true,
    markup: '<polygon fill="currentColor" points="50,2 61.8,33.8 95.7,35.2 69,56.2 78.2,88.8 50,70 21.8,88.8 31,56.2 4.3,35.2 38.2,33.8"/>',
  },
  {
    id: 'heart', name: 'Heart', tintable: true,
    markup: '<path fill="currentColor" d="M50 88 C20 64 6 46 6 30 C6 16 16 8 28 8 C37 8 45 13 50 22 C55 13 63 8 72 8 C84 8 94 16 94 30 C94 46 80 64 50 88 Z"/>',
  },
  {
    id: 'cloud', name: 'Cloud', tintable: true,
    markup: '<g fill="currentColor"><circle cx="34" cy="60" r="18"/><circle cx="57" cy="50" r="22"/><circle cx="77" cy="62" r="15"/><rect x="34" y="58" width="43" height="20" rx="10"/></g>',
  },
  {
    id: 'arrow', name: 'Arrow', tintable: true,
    markup: '<polygon fill="currentColor" points="5,38 58,38 58,18 95,50 58,82 58,62 5,62"/>',
  },
  {
    id: 'bolt', name: 'Lightning', tintable: true,
    markup: '<polygon fill="currentColor" points="58,4 18,56 42,56 36,96 82,40 55,40"/>',
  },
  {
    id: 'bubble', name: 'Speech bubble', tintable: true,
    markup: '<path fill="currentColor" d="M16 10 h68 a12 12 0 0 1 12 12 v36 a12 12 0 0 1 -12 12 H50 L27 90 32 70 H16 A12 12 0 0 1 4 58 V22 A12 12 0 0 1 16 10 Z"/>',
  },
  {
    id: 'moon', name: 'Moon', tintable: true,
    markup: '<path fill="currentColor" d="M62 6 A44 44 0 1 0 94 62 A36 36 0 0 1 62 6 Z"/>',
  },
  {
    id: 'note', name: 'Music note', tintable: true,
    markup: '<path fill="currentColor" d="M34 16 L86 6 V64 a12 12 0 1 1 -6 -10.4 V24 L40 33 V74 a12 12 0 1 1 -6 -10.4 Z"/>',
  },
  {
    id: 'cat', name: 'Cat', tintable: true,
    markup: '<g fill="currentColor"><path d="M22 18 L36 32 H22 Z"/><path d="M78 18 L64 32 H78 Z"/><circle cx="50" cy="42" r="24"/><ellipse cx="50" cy="80" rx="26" ry="16"/><path d="M76 80 q16 2 14 -14" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"/></g>',
  },
  {
    id: 'leaf', name: 'Leaf', tintable: true,
    markup: '<path fill="currentColor" d="M88 12 C50 12 16 36 14 78 C14 82 18 88 24 86 C66 84 88 50 88 12 Z M22 80 C40 56 58 40 80 24 C60 46 44 62 22 80 Z"/>',
  },
  {
    id: 'sun', name: 'Sun', tintable: false,
    markup: '<g><circle cx="50" cy="50" r="22" fill="#e8a468"/><circle cx="50" cy="50" r="15" fill="#c96f2e"/><g stroke="#e8a468" stroke-width="6" stroke-linecap="round"><line x1="50" y1="10" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="90"/><line x1="10" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="90" y2="50"/><line x1="22" y1="22" x2="29" y2="29"/><line x1="71" y1="71" x2="78" y2="78"/><line x1="22" y1="78" x2="29" y2="71"/><line x1="71" y1="29" x2="78" y2="22"/></g></g>',
  },
  {
    id: 'tree', name: 'Tree', tintable: false,
    markup: '<g><rect x="44" y="62" width="12" height="32" rx="3" fill="#8a5a33"/><circle cx="50" cy="34" r="24" fill="#3aa79c"/><circle cx="30" cy="48" r="16" fill="#2b7f77"/><circle cx="70" cy="48" r="16" fill="#2b7f77"/></g>',
  },
  {
    id: 'flower', name: 'Flower', tintable: false,
    markup: '<g><path d="M50 52 V92" stroke="#3aa79c" stroke-width="6" stroke-linecap="round"/><path d="M50 76 Q32 72 28 58 Q46 60 50 76" fill="#2b7f77"/><g fill="#e8a468"><circle cx="50" cy="22" r="12"/><circle cx="72" cy="36" r="12"/><circle cx="64" cy="60" r="12"/><circle cx="36" cy="60" r="12"/><circle cx="28" cy="36" r="12"/></g><circle cx="50" cy="42" r="11" fill="#c96f2e"/></g>',
  },
  {
    id: 'cactus', name: 'Cactus', tintable: false,
    markup: '<g><path d="M50 14 c-8 0 -11 6 -11 12 V66 h22 V26 c0 -6 -3 -12 -11 -12 Z" fill="#3aa79c"/><path d="M22 30 c-5 0 -7 4 -7 8 v10 c0 8 6 12 14 12 h10 V48 H30 c-1.5 0 -3 -1.5 -3 -3 v-7 c0 -4 -2 -8 -5 -8 Z" fill="#2b7f77"/><path d="M78 22 c5 0 7 4 7 8 v14 c0 8 -6 12 -14 12 H61 V44 h9 c1.5 0 3 -1.5 3 -3 V30 c0 -4 2 -8 5 -8 Z" fill="#2b7f77"/><path d="M30 66 h40 l-4 26 H34 Z" fill="#c96f2e"/><rect x="27" y="62" width="46" height="8" rx="3" fill="#a8541c"/></g>',
  },
  {
    id: 'house', name: 'House', tintable: false,
    markup: '<g><path d="M50 8 L94 44 H6 Z" fill="#c96f2e"/><rect x="16" y="44" width="68" height="48" fill="#f1e3c8"/><rect x="42" y="62" width="16" height="30" rx="2" fill="#3aa79c"/><rect x="24" y="54" width="13" height="13" rx="2" fill="#2b7f77"/><rect x="64" y="54" width="13" height="13" rx="2" fill="#2b7f77"/><rect x="66" y="14" width="9" height="16" fill="#a8541c"/></g>',
  },
  {
    id: 'mountain', name: 'Mountains', tintable: false,
    markup: '<g><circle cx="76" cy="26" r="12" fill="#e8a468"/><path d="M4 88 L36 30 L68 88 Z" fill="#8a5a33"/><path d="M36 30 L46 48 L41 48 L48 60 L24 60 L31 48 L26 48 Z" fill="#f6efe2"/><path d="M44 88 L72 44 L96 88 Z" fill="#6e5a47"/><path d="M72 44 L80 57 L76 57 L82 66 L62 66 L68 57 L64 57 Z" fill="#f6efe2"/></g>',
  },
  {
    id: 'rocket', name: 'Rocket', tintable: false,
    markup: '<g><path d="M50 4 C64 16 68 38 64 62 H36 C32 38 36 16 50 4 Z" fill="#f1e3c8"/><circle cx="50" cy="34" r="9" fill="#3aa79c"/><circle cx="50" cy="34" r="5" fill="#9fd6cf"/><path d="M36 50 L20 72 L36 68 Z" fill="#c96f2e"/><path d="M64 50 L80 72 L64 68 Z" fill="#c96f2e"/><path d="M36 62 h28 l-4 10 h-20 Z" fill="#a8541c"/><path d="M50 74 C56 80 54 88 50 96 C46 88 44 80 50 74 Z" fill="#e8a468"/></g>',
  },
  {
    id: 'coffee', name: 'Coffee', tintable: false,
    markup: '<g><path d="M20 38 H72 V74 a14 14 0 0 1 -14 14 H34 a14 14 0 0 1 -14 -14 Z" fill="#f6efe2"/><path d="M22 40 H70 V52 H22 Z" fill="#8a5a33"/><path d="M72 44 h6 a10 10 0 0 1 0 20 h-6 v-8 h5 a3 3 0 0 0 0 -6 h-5 Z" fill="#f6efe2"/><g stroke="#3aa79c" stroke-width="5" stroke-linecap="round" fill="none"><path d="M36 12 q4 8 0 16"/><path d="M52 8 q4 10 0 20"/></g></g>',
  },
  {
    id: 'smiley', name: 'Smiley', tintable: false,
    markup: '<g><circle cx="50" cy="50" r="44" fill="#e8a468"/><circle cx="35" cy="40" r="6" fill="#3b2c20"/><circle cx="65" cy="40" r="6" fill="#3b2c20"/><path d="M30 60 q20 18 40 0" stroke="#3b2c20" stroke-width="6" fill="none" stroke-linecap="round"/></g>',
  },
  {
    id: 'balloon', name: 'Balloon', tintable: false,
    markup: '<g><ellipse cx="50" cy="36" rx="26" ry="30" fill="#3aa79c"/><ellipse cx="42" cy="28" rx="8" ry="11" fill="#9fd6cf" opacity="0.7"/><path d="M50 66 l-6 8 h12 Z" fill="#2b7f77"/><path d="M50 74 q-8 12 2 22" stroke="#6e5a47" stroke-width="3" fill="none" stroke-linecap="round"/></g>',
  },
];

export function getClipart(id) {
  return CLIPART.find(c => c.id === id) || null;
}
