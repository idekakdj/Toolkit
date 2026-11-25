// Pigment - coloring-book library: Animals (20 pieces). Same format as library.js.
export const ANIMALS = [
  {
    id: 'dog',
    name: 'Dog',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M62,60 C40,55 28,80 32,110 C36,125 55,120 62,100 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M138,60 C160,55 172,80 168,110 C164,125 145,120 138,100 Z"/>
<ellipse data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="165" rx="40" ry="24"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="80" cy="181" rx="13" ry="8"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="120" cy="181" rx="13" ry="8"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="95" rx="42" ry="40"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="112" rx="22" ry="17"/>
<circle data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="82" cy="88" r="6"/>
<circle data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="118" cy="88" r="6"/>
<ellipse data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="104" rx="8" ry="6"/>
<path data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M91,122 C91,140 109,140 109,122 Z"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="100" y1="110" x2="100" y2="121"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,121 C95,127 89,126 87,121"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,121 C105,127 111,126 113,121"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,129 L100,134"/>
`
  },

  {
    id: 'rabbit',
    name: 'Rabbit',
    category: 'animals',
    vb: 200,
    markup: `
<circle data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="152" cy="160" r="10"/>
<ellipse data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="80" cy="40" rx="13" ry="30"/>
<ellipse data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="120" cy="40" rx="13" ry="30"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="80" cy="44" rx="6" ry="20"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="120" cy="44" rx="6" ry="20"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="158" rx="42" ry="30"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="75" cy="181" rx="16" ry="8"/>
<ellipse data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="125" cy="181" rx="16" ry="8"/>
<ellipse data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="100" rx="40" ry="36"/>
<circle data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="84" cy="94" r="5"/>
<circle data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="116" cy="94" r="5"/>
<ellipse data-region="r12" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="106" rx="6" ry="4.5"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,111 L100,116"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,116 C95,122 90,120 88,117"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,116 C105,122 110,120 112,117"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="72" y1="106" x2="52" y2="102"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="72" y1="111" x2="52" y2="113"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="128" y1="106" x2="148" y2="102"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="128" y1="111" x2="148" y2="113"/>
`
  },

  {
    id: 'owl',
    name: 'Owl',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M60,50 L58,26 L82,42 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M140,50 L142,26 L118,42 Z"/>
<ellipse data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="82" cy="183" rx="12" ry="6"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="118" cy="183" rx="12" ry="6"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="110" rx="52" ry="70"/>
<path data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M54,100 C30,115 32,160 55,170 C62,150 62,125 54,100 Z"/>
<path data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M146,100 C170,115 168,160 145,170 C138,150 138,125 146,100 Z"/>
<ellipse data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="135" rx="28" ry="34"/>
<circle data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="80" cy="82" r="19"/>
<circle data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="120" cy="82" r="19"/>
<circle data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="80" cy="82" r="8"/>
<circle data-region="r12" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="120" cy="82" r="8"/>
<path data-region="r13" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,92 L92,104 L100,114 L108,104 Z"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M88,126 C92,132 96,132 100,126"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,126 C104,132 108,132 112,126"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M88,146 C92,152 96,152 100,146"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,146 C104,152 108,152 112,146"/>
`
  },

  {
    id: 'elephant',
    name: 'Elephant',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M62,70 C20,50 12,110 40,140 C55,155 68,130 68,105 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M138,70 C180,50 188,110 160,140 C145,155 132,130 132,105 Z"/>
<ellipse data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="40" cy="100" rx="11" ry="22"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="160" cy="100" rx="11" ry="22"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="152" rx="54" ry="36"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="88" rx="44" ry="42"/>
<path data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M84,108 C82,140 80,165 68,176 C62,184 76,190 88,184 C104,176 112,150 116,108 Z"/>
<circle data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="80" cy="80" r="5"/>
<circle data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="120" cy="80" r="5"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="88" y1="132" x2="98" y2="132"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="87" y1="148" x2="97" y2="148"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M86,100 C94,106 106,106 114,100"/>
`
  },

  {
    id: 'lion',
    name: 'Lion',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M170,104 Q176.3,124.4 160.6,139 Q155.9,159.9 135,164.6 Q120.4,180.3 100,174 Q79.6,180.3 65,164.6 Q44.1,159.9 39.4,139 Q23.7,124.4 30,104 Q23.7,83.6 39.4,69 Q44.1,48.1 65,43.4 Q79.6,27.7 100,34 Q120.4,27.7 135,43.4 Q155.9,48.1 160.6,69 Q176.3,83.6 170,104 Z"/>
<circle data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="66" cy="56" r="12"/>
<circle data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="134" cy="56" r="12"/>
<circle data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="66" cy="56" r="6"/>
<circle data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="134" cy="56" r="6"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="104" rx="46" ry="44"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="122" rx="24" ry="18"/>
<circle data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="82" cy="96" r="6"/>
<circle data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="118" cy="96" r="6"/>
<path data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M92,112 L108,112 L100,122 Z"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="100" y1="122" x2="100" y2="128"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,128 C94,136 86,134 84,128"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,128 C106,136 114,134 116,128"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="80" y1="122" x2="66" y2="120"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="80" y1="126" x2="66" y2="128"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="120" y1="122" x2="134" y2="120"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="120" y1="126" x2="134" y2="128"/>
`
  },

  {
    id: 'giraffe',
    name: 'Giraffe',
    category: 'animals',
    vb: 200,
    markup: `
<rect data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="56" y="140" width="12" height="46" rx="5"/>
<rect data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="76" y="140" width="12" height="46" rx="5"/>
<rect data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="110" y="140" width="12" height="46" rx="5"/>
<rect data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="130" y="140" width="12" height="46" rx="5"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="92" cy="125" rx="52" ry="30"/>
<path data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M108,110 L124,50 L152,58 L142,120 Z"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="156" cy="46" rx="24" ry="13"/>
<ellipse data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="144" cy="30" rx="5" ry="8"/>
<ellipse data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="160" cy="32" rx="5" ry="8"/>
<ellipse data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="70" cy="118" rx="9" ry="8"/>
<ellipse data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="96" cy="110" rx="8" ry="7"/>
<ellipse data-region="r12" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="112" cy="134" rx="9" ry="8"/>
<ellipse data-region="r13" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="78" cy="138" rx="7" ry="6"/>
<ellipse data-region="r14" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="133" cy="82" rx="6" ry="7"/>
<ellipse data-region="r15" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="127" cy="102" rx="6" ry="6"/>
<circle fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="162" cy="42" r="2.5"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M168,52 C172,54 176,53 178,50"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M42,116 C30,124 28,140 32,156"/>
`
  },

  {
    id: 'penguin',
    name: 'Penguin',
    category: 'animals',
    vb: 200,
    markup: `
<ellipse data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="78" cy="182" rx="15" ry="7"/>
<ellipse data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="122" cy="182" rx="15" ry="7"/>
<ellipse data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="110" rx="48" ry="70"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M56,90 C30,110 30,140 40,150 C52,135 58,115 58,100 Z"/>
<path data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M144,90 C170,110 170,140 160,150 C148,135 142,115 142,100 Z"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="125" rx="32" ry="50"/>
<circle data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="86" cy="74" r="8"/>
<circle data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="114" cy="74" r="8"/>
<path data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M92,86 L108,86 L100,100 Z"/>
<circle fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="86" cy="74" r="3"/>
<circle fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="114" cy="74" r="3"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M90,156 C95,160 105,160 110,156"/>
`
  },

  {
    id: 'frog',
    name: 'Frog',
    category: 'animals',
    vb: 200,
    markup: `
<ellipse data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="38" cy="182" rx="16" ry="7"/>
<ellipse data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="162" cy="182" rx="16" ry="7"/>
<ellipse data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="52" cy="152" rx="22" ry="26"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="148" cy="152" rx="22" ry="26"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="130" rx="54" ry="50"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="152" rx="32" ry="26"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="92" rx="52" ry="36"/>
<circle data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="86" cy="92" r="5"/>
<circle data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="112" cy="84" r="6"/>
<circle data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="68" cy="58" r="18"/>
<circle data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="132" cy="58" r="18"/>
<circle data-region="r12" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="68" cy="58" r="7"/>
<circle data-region="r13" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="132" cy="58" r="7"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M62,102 C85,122 115,122 138,102"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="94" y1="98" x2="96" y2="98"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="104" y1="98" x2="106" y2="98"/>
`
  },

  {
    id: 'bear',
    name: 'Bear',
    category: 'animals',
    vb: 200,
    markup: `
<circle data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="62" cy="52" r="16"/>
<circle data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="138" cy="52" r="16"/>
<ellipse data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="54" cy="150" rx="12" ry="18"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="146" cy="150" rx="12" ry="18"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="160" rx="42" ry="30"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="72" cy="182" rx="14" ry="8"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="128" cy="182" rx="14" ry="8"/>
<ellipse data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="164" rx="24" ry="20"/>
<ellipse data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="88" rx="48" ry="42"/>
<circle data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="62" cy="52" r="8"/>
<circle data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="138" cy="52" r="8"/>
<ellipse data-region="r12" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="102" rx="20" ry="15"/>
<ellipse data-region="r13" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="96" rx="7" ry="5"/>
<circle data-region="r14" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="82" cy="80" r="5"/>
<circle data-region="r15" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="118" cy="80" r="5"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="100" y1="101" x2="100" y2="108"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,108 C95,113 90,112 88,108"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,108 C105,113 110,112 112,108"/>
`
  },

  {
    id: 'fox',
    name: 'Fox',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M128,180 C176,190 190,150 182,98 C170,122 150,150 120,160 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M176,162.3 C184.5,147 186,124 182,98 C176,110 168,123 157.8,134.3 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M44,80 L42,16 L94,56 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M156,80 L158,16 L106,56 Z"/>
<path data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M52,62 L51,36 L78,54 Z"/>
<path data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M148,62 L149,36 L122,54 Z"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="170" rx="36" ry="20"/>
<path data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,154 C86,150 62,140 46,120 C32,104 30,84 42,70 C54,58 80,52 100,52 C120,52 146,58 158,70 C170,84 168,104 154,120 C138,140 114,150 100,154 Z"/>
<path data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M80,112 L52,98 L56,110 L44,116 L56,124 L50,136 L68,132 L84,146 Z"/>
<path data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M120,112 L148,98 L144,110 L156,116 L144,124 L150,136 L132,132 L116,146 Z"/>
<path data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M68,92 C74,82 88,82 92,94 C84,102 72,102 68,92 Z"/>
<path data-region="r12" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M132,92 C126,82 112,82 108,94 C116,102 128,102 132,92 Z"/>
<ellipse data-region="r13" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="144" rx="6" ry="4.5"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M100,60 L100,72"/>
`
  },

  {
    id: 'pig',
    name: 'Pig',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M62,56 C48,40 36,52 38,76 C46,80 56,76 66,70 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M138,56 C152,40 164,52 162,76 C154,80 144,76 134,70 Z"/>
<ellipse data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="76" cy="184" rx="12" ry="6"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="124" cy="184" rx="12" ry="6"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="170" rx="44" ry="20"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="100" rx="54" ry="48"/>
<circle data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="66" cy="112" r="8"/>
<circle data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="134" cy="112" r="8"/>
<ellipse data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="112" rx="24" ry="18"/>
<circle data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="78" cy="90" r="5"/>
<circle data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="122" cy="90" r="5"/>
<ellipse fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="92" cy="112" rx="3.5" ry="6"/>
<ellipse fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="108" cy="112" rx="3.5" ry="6"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M88,138 C96,144 104,144 112,138"/>
`
  },

  {
    id: 'cow',
    name: 'Cow',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M72,56 C66,40 58,36 52,36 C54,48 62,58 72,62 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M128,56 C134,40 142,36 148,36 C146,48 138,58 128,62 Z"/>
<ellipse data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="46" cy="72" rx="18" ry="10"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="154" cy="72" rx="18" ry="10"/>
<ellipse data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="172" rx="50" ry="18"/>
<path data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M60,60 C60,40 80,38 100,38 C120,38 140,40 140,60 C142,85 130,105 128,130 C126,145 74,145 72,130 C70,105 58,85 60,60 Z"/>
<ellipse data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="128" rx="30" ry="22"/>
<path data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M86,46 C96,42 114,44 112,54 C108,62 94,64 88,58 Z"/>
<ellipse data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="78" cy="98" rx="9" ry="13"/>
<circle data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="82" cy="76" r="5"/>
<circle data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="118" cy="76" r="5"/>
<ellipse fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="90" cy="130" rx="4" ry="5"/>
<ellipse fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="110" cy="130" rx="4" ry="5"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M92,146 C98,150 102,150 108,146"/>
`
  },

  {
    id: 'duck',
    name: 'Duck',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M150,110 L184,90 C180,112 174,128 160,140 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M88,172 L90,184 C84,190 74,190 70,188 C76,184 80,180 82,172 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M118,172 L120,184 C114,190 104,190 100,188 C106,184 110,180 112,172 Z"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="105" cy="135" rx="62" ry="40"/>
<path data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M90,118 C110,108 140,115 146,135 C130,155 100,150 90,118 Z"/>
<circle data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="68" cy="80" r="26"/>
<path data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M46,78 C30,74 20,80 20,86 C24,94 38,94 48,92 Z"/>
<circle data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="66" cy="72" r="5"/>
<circle data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="80" cy="90" r="5"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M104,128 C116,124 128,128 134,136"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M24,88 C32,90 38,90 44,88"/>
`
  },

  {
    id: 'snail',
    name: 'Snail',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M20,176 C10,176 10,160 22,148 C28,138 28,124 26,108 C24,92 50,92 48,108 C46,124 54,140 70,150 L168,150 C188,150 188,176 166,176 Z"/>
<circle data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="112" cy="112" r="48"/>
<circle data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="112" cy="112" r="32"/>
<circle data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="112" cy="112" r="16"/>
<circle data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="112" cy="112" r="7"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="128" cy="164" rx="36" ry="6"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="31" y1="94" x2="24" y2="68"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="43" y1="94" x2="50" y2="68"/>
<circle data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="24" cy="62" r="6"/>
<circle data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="50" cy="62" r="6"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M30,106 C34,112 40,112 44,106"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M112,112 C120,112 120,100 110,100"/>
`
  },

  {
    id: 'bee',
    name: 'Bee',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M88,78 C70,40 38,40 40,64 C42,84 70,90 88,84 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M112,78 C130,40 162,40 160,64 C158,84 130,90 112,84 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M92,162 L100,184 L108,162 Z"/>
<ellipse data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="120" rx="38" ry="46"/>
<path data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M66.6,98 L133.4,98 A38,46 0 0 1 137.4,112 L62.6,112 A38,46 0 0 1 66.6,98 Z"/>
<path data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M62.6,128 L137.4,128 A38,46 0 0 1 133.4,142 L66.6,142 A38,46 0 0 1 62.6,128 Z"/>
<circle data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="62" r="26"/>
<circle data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="90" cy="60" r="5"/>
<circle data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="110" cy="60" r="5"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="92" y1="38" x2="84" y2="22"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="108" y1="38" x2="116" y2="22"/>
<circle fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="84" cy="19" r="3"/>
<circle fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="116" cy="19" r="3"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M92,72 C96,78 104,78 108,72"/>
`
  },

  {
    id: 'ladybug',
    name: 'Ladybug',
    category: 'animals',
    vb: 200,
    markup: `
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="48" y1="96" x2="26" y2="86"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="46" y1="118" x2="22" y2="118"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="50" y1="140" x2="28" y2="152"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="152" y1="96" x2="174" y2="86"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="154" y1="118" x2="178" y2="118"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="150" y1="140" x2="172" y2="152"/>
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M70,62 C68,34 132,34 130,62 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,62 A54,54 0 0 0 100,170 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M100,62 A54,54 0 0 1 100,170 Z"/>
<circle data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="72" cy="92" r="9"/>
<circle data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="68" cy="128" r="8"/>
<circle data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="86" cy="150" r="7"/>
<circle data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="128" cy="92" r="9"/>
<circle data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="132" cy="128" r="8"/>
<circle data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="114" cy="150" r="7"/>
<circle data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="86" cy="52" r="5"/>
<circle data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="114" cy="52" r="5"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="92" y1="40" x2="84" y2="24"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="108" y1="40" x2="116" y2="24"/>
`
  },

  {
    id: 'whale',
    name: 'Whale',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M154,130 C172,118 176,100 170,84 C162,86 156,80 156,70 C166,72 178,66 188,62 C190,82 188,100 178,116 C174,124 170,130 160,140 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M16,128 C16,96 56,84 100,84 C140,84 160,100 168,122 C150,150 110,166 70,162 C36,158 16,148 16,128 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M28,138 C46,152 90,156 142,134 C130,150 100,158 74,156 C48,154 34,148 28,138 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M84,150 C92,170 82,182 66,184 C70,172 74,160 72,150 Z"/>
<circle data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="40" cy="112" r="5"/>
<circle data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="54" cy="128" r="5"/>
<path data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M46,92 C42,80 30,72 26,56 C36,60 42,56 46,48 C50,56 56,60 66,56 C62,72 50,80 46,92 Z"/>
<path data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M12,176 C28,168 40,184 56,176 C72,168 84,184 100,176 C116,168 128,184 144,176 C160,168 172,184 188,176 L188,190 L12,190 Z"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M18,128 C28,136 40,136 50,132"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="36" y1="40" x2="34" y2="32"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="60" y1="42" x2="64" y2="34"/>
`
  },

  {
    id: 'octopus',
    name: 'Octopus',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M50,104 C30,120 18,150 28,168 C34,180 50,176 48,166 C46,156 52,146 66,126 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M150,104 C170,120 182,150 172,168 C166,180 150,176 152,166 C154,156 148,146 134,126 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M70,116 C56,140 54,164 64,178 C72,188 86,180 80,170 C76,158 84,142 90,126 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M130,116 C144,140 146,164 136,178 C128,188 114,180 120,170 C124,158 116,142 110,126 Z"/>
<path data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M86,120 C84,150 88,172 100,184 C112,172 116,150 114,120 Z"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="80" rx="52" ry="48"/>
<circle data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="80" cy="82" r="10"/>
<circle data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="120" cy="82" r="10"/>
<circle data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="84" cy="52" r="6"/>
<circle data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="116" cy="52" r="6"/>
<circle data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="66" cy="102" r="6"/>
<circle data-region="r12" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="134" cy="102" r="6"/>
<circle fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="80" cy="84" r="4"/>
<circle fill="none" class="detail" stroke="#1e1e1e" stroke-width="2"
  cx="120" cy="84" r="4"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M88,104 C95,112 105,112 112,104"/>
`
  },

  {
    id: 'dinosaur',
    name: 'Dinosaur',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M54,104 L66,74 L78,104 Z"/>
<path data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M72,98 L84,68 L96,98 Z"/>
<path data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M90,97 L102,67 L114,97 Z"/>
<path data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M108,99 L120,69 L132,99 Z"/>
<path data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M126,106 L138,76 L150,106 Z"/>
<path data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M150,108 C168,112 182,122 186,138 C170,138 156,146 146,148 Z"/>
<rect data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="54" y="140" width="18" height="44" rx="7"/>
<rect data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="78" y="140" width="18" height="44" rx="7"/>
<rect data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="108" y="140" width="18" height="44" rx="7"/>
<rect data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="132" y="140" width="18" height="44" rx="7"/>
<ellipse data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="125" rx="56" ry="34"/>
<ellipse data-region="r12" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="36" cy="100" rx="26" ry="20"/>
<circle data-region="r13" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="28" cy="94" r="4"/>
<ellipse data-region="r14" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="82" cy="118" rx="9" ry="8"/>
<ellipse data-region="r15" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="110" cy="134" rx="10" ry="8"/>
<ellipse data-region="r16" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="130" cy="112" rx="8" ry="8"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M12,106 C22,114 34,114 40,108"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="58" y1="168" x2="66" y2="168"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="82" y1="168" x2="90" y2="168"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="112" y1="168" x2="120" y2="168"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="136" y1="168" x2="144" y2="168"/>
`
  },

  {
    id: 'horse',
    name: 'Horse',
    category: 'animals',
    vb: 200,
    markup: `
<path data-region="r1" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M158,100 C182,108 188,140 176,170 C170,150 166,130 152,118 Z"/>
<rect data-region="r2" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="60" y="130" width="12" height="54" rx="5"/>
<rect data-region="r3" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="80" y="130" width="12" height="54" rx="5"/>
<rect data-region="r4" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="114" y="130" width="12" height="54" rx="5"/>
<rect data-region="r5" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="134" y="130" width="12" height="54" rx="5"/>
<ellipse data-region="r6" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="100" cy="118" rx="56" ry="30"/>
<path data-region="r7" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M48,108 C44,80 50,56 62,40 L88,50 C84,70 90,92 100,106 Z"/>
<path data-region="r8" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M70,32 L68,12 L82,28 Z"/>
<path data-region="r9" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M70,30 C56,26 40,40 28,66 C24,76 32,84 42,80 C60,72 80,60 90,46 C92,36 82,30 70,30 Z"/>
<path data-region="r10" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  d="M84,34 C98,38 102,62 100,80 C108,92 110,100 106,108 L92,102 C86,80 84,62 78,44 Z"/>
<rect data-region="r11" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  x="88" y="96" width="28" height="22" rx="6"/>
<circle data-region="r12" fill="#ffffff" stroke="#1e1e1e" stroke-width="3" stroke-linejoin="round"
  cx="54" cy="50" r="4"/>
<path fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  d="M28,78 C34,82 38,82 42,78"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="60" y1="176" x2="72" y2="176"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="80" y1="176" x2="92" y2="176"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="114" y1="176" x2="126" y2="176"/>
<line fill="none" class="detail" stroke="#1e1e1e" stroke-width="2" stroke-linecap="round"
  x1="134" y1="176" x2="146" y2="176"/>
`
  },

];
