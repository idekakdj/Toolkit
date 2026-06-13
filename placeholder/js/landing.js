// Placeholder — landing page interactions

// Nav background on scroll
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 12);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Reveal-on-scroll
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// Hero demo card: cycle through example conversions in sync with the bar
const demos = [
  { icon: 'CSV', name: 'quarterly-report.csv', size: '248 KB', target: 'XLSX' },
  { icon: 'PNG', name: 'holiday-photo.png', size: '3.1 MB', target: 'WebP' },
  { icon: 'MP3', name: 'voice-memo.mp3', size: '5.4 MB', target: 'WAV' },
  { icon: 'MD', name: 'release-notes.md', size: '12 KB', target: 'HTML' },
  { icon: 'SVG', name: 'logo-final-v9.svg', size: '36 KB', target: 'PNG' },
];
const demoIcon = document.getElementById('demoIcon');
const demoName = document.getElementById('demoName');
const demoTarget = document.getElementById('demoTarget');
const demoBar = document.getElementById('demoBar');
const demoSize = document.querySelector('.demo-meta span');

let demoIdx = 0;
if (demoIcon && demoBar) {
  setInterval(() => {
    demoIdx = (demoIdx + 1) % demos.length;
    const d = demos[demoIdx];
    demoIcon.textContent = d.icon;
    demoName.textContent = d.name;
    demoTarget.textContent = d.target;
    if (demoSize) demoSize.textContent = `${d.size} · type detected automatically`;
    // restart the fill animation so it stays in step with the swap
    demoBar.style.animation = 'none';
    void demoBar.offsetWidth;
    demoBar.style.animation = '';
  }, 3200);
}

// Footer year
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
