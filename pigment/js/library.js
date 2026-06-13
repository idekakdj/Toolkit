// Pigment – coloring-book library
// Each piece uses a 0 0 200 200 coordinate space.
// Consumers: fill tool keys off data-region; Sigma-export reads vb.

export const COLORING = [

  // ─── BUTTERFLY ────────────────────────────────────────────────────────────
  {
    id: 'butterfly',
    name: 'Butterfly',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,95 C85,70 40,45 20,60 C5,72 15,100 35,105 C55,110 85,105 100,95 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,95 C115,70 160,45 180,60 C195,72 185,100 165,105 C145,110 115,105 100,95 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,105 C82,115 45,125 30,115 C18,107 28,88 48,90 C68,92 88,100 100,105 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,105 C118,115 155,125 170,115 C182,107 172,88 152,90 C132,92 112,100 100,105 Z"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="55" cy="78" rx="10" ry="8"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="145" cy="78" rx="10" ry="8"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="55" cy="115" rx="8" ry="6"/>
<ellipse data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="145" cy="115" rx="8" ry="6"/>
<ellipse data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="100" rx="7" ry="18"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="96" y1="84" x2="78" y2="62"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="104" y1="84" x2="122" y2="62"/>
<circle fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="78" cy="60" r="3"/>
<circle fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="122" cy="60" r="3"/>
`
  },

  // ─── FISH ─────────────────────────────────────────────────────────────────
  {
    id: 'fish',
    name: 'Fish',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M155,100 C155,70 125,50 90,55 C60,60 35,80 35,100 C35,120 60,140 90,145 C125,150 155,130 155,100 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M155,100 C165,85 185,75 185,100 C185,125 165,115 155,100 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M95,55 C100,45 115,38 120,48 C118,56 108,58 95,55 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M95,145 C100,155 115,162 120,152 C118,144 108,142 95,145 Z"/>
<circle data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="68" cy="92" r="8"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="110" cy="85" rx="12" ry="10"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="110" cy="115" rx="12" ry="10"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M50,100 C55,93 60,100 55,107"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M38,97 C42,103 38,107"/>
`
  },

  // ─── FLOWER ───────────────────────────────────────────────────────────────
  {
    id: 'flower',
    name: 'Flower',
    vb: 200,
    markup: `
<rect data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="94" y="120" width="12" height="65" rx="4"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,148 C100,148 82,138 75,125 C68,112 80,103 90,112 C95,117 100,128 100,148 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,148 C100,148 118,138 125,125 C132,112 120,103 110,112 C105,117 100,128 100,148 Z"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="88" rx="14" ry="22"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="88" rx="22" ry="14"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="78" cy="78" rx="13" ry="20"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="122" cy="78" rx="13" ry="20"/>
<ellipse data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="78" cy="100" rx="13" ry="20"/>
<ellipse data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="122" cy="100" rx="13" ry="20"/>
<circle data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="89" r="18"/>
`
  },

  // ─── SAILBOAT ─────────────────────────────────────────────────────────────
  {
    id: 'sailboat',
    name: 'Sailboat',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M20,155 C25,165 175,165 180,155 C170,148 30,148 20,155 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M45,148 C50,130 55,120 60,148 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M50,148 C70,100 95,55 100,50 C100,50 100,148 50,148 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,50 C100,50 100,148 145,148 C130,110 115,70 100,50 Z"/>
<path data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,50 L112,50 L112,62 L100,58 Z"/>
<circle data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="168" cy="40" r="16"/>
<path data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M15,170 C30,160 55,172 70,163 C85,154 100,167 115,158 C130,149 155,163 185,170 Z"/>
<path data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M15,180 C35,170 60,182 80,172 C100,162 125,175 185,180 Z"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  x1="100" y1="148" x2="100" y2="50"/>
`
  },

  // ─── MUSHROOM ─────────────────────────────────────────────────────────────
  {
    id: 'mushroom',
    name: 'Mushroom',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M60,175 C60,162 80,155 100,155 C120,155 140,162 140,175 C138,183 62,183 60,175 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M30,175 C22,172 18,165 25,160 C35,154 55,158 60,175 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M170,175 C178,172 182,165 175,160 C165,154 145,158 140,175 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M75,155 C68,130 50,100 48,75 C46,48 72,20 100,20 C128,20 154,48 152,75 C150,100 132,130 125,155 Z"/>
<circle data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="78" cy="72" r="14"/>
<circle data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="125" cy="65" r="11"/>
<circle data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="110" r="10"/>
`
  },

  // ─── ROCKET ───────────────────────────────────────────────────────────────
  {
    id: 'rocket',
    name: 'Rocket',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M80,140 L80,75 C80,75 75,135 55,140 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M120,140 L120,75 C120,75 125,135 145,140 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M80,140 L80,75 L120,75 L120,140 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M80,75 C80,75 90,30 100,18 C110,30 120,75 120,75 Z"/>
<circle data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="105" r="14"/>
<path data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M87,145 C82,155 78,170 80,182 C87,175 93,160 100,155 C107,160 113,175 120,182 C122,170 118,155 113,145 Z"/>
<path data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M87,150 C80,158 76,172 80,182 C88,172 95,158 100,155 C95,160 88,165 87,150 Z"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="82" y1="88" x2="118" y2="88"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="82" y1="130" x2="118" y2="130"/>
`
  },

  // ─── HOUSE ────────────────────────────────────────────────────────────────
  {
    id: 'house',
    name: 'House',
    vb: 200,
    markup: `
<rect data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="20" y="130" width="160" height="55" rx="2"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M15,135 L100,60 L185,135 Z"/>
<rect data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="85" y="155" width="30" height="30" rx="3"/>
<rect data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="35" y="145" width="28" height="25" rx="3"/>
<rect data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="137" y="145" width="28" height="25" rx="3"/>
<rect data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="82" y="95" width="20" height="35" rx="2"/>
<circle data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="162" cy="38" r="18"/>
<rect data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="20" y="182" width="160" height="4" rx="2"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  x1="49" y1="145" x2="49" y2="170"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  x1="35" y1="158" x2="63" y2="158"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  x1="151" y1="145" x2="151" y2="170"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  x1="137" y1="158" x2="165" y2="158"/>
`
  },

  // ─── CAT ──────────────────────────────────────────────────────────────────
  {
    id: 'cat',
    name: 'Cat',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M65,185 C50,185 40,165 45,140 C50,115 65,108 100,108 C135,108 150,115 155,140 C160,165 150,185 135,185 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M155,155 C165,145 182,145 183,160 C184,175 170,180 155,175 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M65,90 L55,55 L82,75 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M135,90 L145,55 L118,75 Z"/>
<path data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M65,90 C68,55 80,30 100,28 C120,30 132,55 135,90 C120,98 80,98 65,90 Z"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="85" cy="72" rx="9" ry="11"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="115" cy="72" rx="9" ry="11"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="100" y1="90" x2="80" y2="100"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="100" y1="90" x2="120" y2="100"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="68" y1="83" x2="40" y2="78"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="68" y1="88" x2="40" y2="86"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="132" y1="83" x2="160" y2="78"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="132" y1="88" x2="160" y2="86"/>
<circle fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="85" cy="72" r="4"/>
<circle fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="115" cy="72" r="4"/>
`
  },

  // ─── ICE-CREAM ────────────────────────────────────────────────────────────
  {
    id: 'ice-cream',
    name: 'Ice Cream',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M78,130 L100,185 L122,130 Z"/>
<ellipse data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="118" rx="28" ry="18"/>
<ellipse data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="82" cy="96" rx="28" ry="22"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="118" cy="96" rx="28" ry="22"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="76" rx="25" ry="22"/>
<circle data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="58" r="9"/>
<path data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M78,130 C75,122 72,118 74,130 C72,138 74,143 78,130 Z"/>
<path data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M122,130 C125,122 128,118 126,130 C128,138 126,143 122,130 Z"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="85" y1="130" x2="115" y2="160"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="115" y1="130" x2="85" y2="160"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="78" y1="145" x2="122" y2="145"/>
`
  },

  // ─── HOT-AIR-BALLOON ──────────────────────────────────────────────────────
  {
    id: 'hot-air-balloon',
    name: 'Hot-Air Balloon',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,20 C78,20 58,38 52,65 C46,95 55,130 78,143 L100,148 L100,20 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,20 C122,20 142,38 148,65 C154,95 145,130 122,143 L100,148 L100,20 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M68,50 C80,32 100,20 100,20 L100,148 L78,143 C62,118 60,78 68,50 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M132,50 C120,32 100,20 100,20 L100,148 L122,143 C138,118 140,78 132,50 Z"/>
<rect data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="80" y="155" width="40" height="28" rx="4"/>
<path data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M20,50 C25,35 40,30 50,38 C55,25 68,22 75,32 C80,22 95,20 95,35 C80,38 60,42 20,50 Z"/>
<path data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M130,28 C135,18 148,16 154,24 C159,14 170,14 172,24 C168,30 150,32 130,28 Z"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="84" y1="148" x2="84" y2="155"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="116" y1="148" x2="116" y2="155"/>
`
  },

  // ─── TURTLE ───────────────────────────────────────────────────────────────
  {
    id: 'turtle',
    name: 'Turtle',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M30,140 C25,125 32,112 45,108 C42,118 42,130 30,140 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M170,140 C175,125 168,112 155,108 C158,118 158,130 170,140 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M45,160 C38,150 36,138 45,132 C52,140 55,152 45,160 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M155,160 C162,150 164,138 155,132 C148,140 145,152 155,160 Z"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="130" rx="62" ry="45"/>
<path data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,85 C110,78 120,82 122,92 C115,100 108,100 100,85 Z"/>
<path data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,85 C90,78 80,82 78,92 C85,100 92,100 100,85 Z"/>
<ellipse data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="108" rx="18" ry="24"/>
<ellipse data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="85" cy="128" rx="15" ry="18"/>
<ellipse data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="115" cy="128" rx="15" ry="18"/>
<ellipse data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="148" rx="16" ry="12"/>
<path data-region="r12" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M82,92 C80,80 88,72 100,72 C112,72 120,80 118,92 C112,86 88,86 82,92 Z"/>
`
  },

  // ─── ROBOT ────────────────────────────────────────────────────────────────
  {
    id: 'robot',
    name: 'Robot',
    vb: 200,
    markup: `
<rect data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="30" y="125" width="30" height="55" rx="5"/>
<rect data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="140" y="125" width="30" height="55" rx="5"/>
<rect data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="65" y="170" width="30" height="15" rx="4"/>
<rect data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="105" y="170" width="30" height="15" rx="4"/>
<rect data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="55" y="110" width="90" height="60" rx="6"/>
<rect data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="65" y="120" width="22" height="12" rx="3"/>
<rect data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="113" y="120" width="22" height="12" rx="3"/>
<rect data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="65" y="140" width="70" height="20" rx="4"/>
<rect data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="62" y="50" width="76" height="60" rx="10"/>
<circle data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="85" cy="72" r="10"/>
<circle data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="115" cy="72" r="10"/>
<circle data-region="r12" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="42" r="8"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="100" y1="50" x2="100" y2="34"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="72" y1="96" x2="128" y2="96"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="80" y1="96" x2="80" y2="103"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="100" y1="96" x2="100" y2="103"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="120" y1="96" x2="120" y2="103"/>
`
  },

];

export function getColoring(id) {
  return COLORING.find(c => c.id === id) || null;
}
