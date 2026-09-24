/* ---------- Toast ---------- */
const toastEl = document.querySelector('.toast');
window.showToast = (msg) => {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
};
document.querySelectorAll('.action').forEach((link) => {
  link.addEventListener('click', (e) => {
    if (link.getAttribute('href') === '#') {
      e.preventDefault();
      window.showToast('Link Live Stream belum diatur — ganti href="#" dengan link YouTube kamu.');
    }
  });
});

/* ---------- Router: hanya satu halaman tampil pada satu waktu ---------- */
const PAGES = ['home', 'member', 'live', 'gallery', 'history'];
const pageEls = Object.fromEntries(PAGES.map(id => [id, document.getElementById(id)]));
const navLinks = [...document.querySelectorAll('.nav a')];
const nav = document.getElementById('nav');
const menuBtn = document.getElementById('menu');

function setMenu(open) {
  nav.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
}
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));

function route() {
  const id = location.hash.slice(1);
  const page = PAGES.includes(id) ? id : 'home';
  PAGES.forEach(p => { pageEls[p].hidden = p !== page; });
  navLinks.forEach(a => a.classList.toggle('active', a.dataset.link === page));
  document.body.dataset.page = page;
  document.title = (page === 'home' ? '' : page.toUpperCase() + ' — ') + 'MAPENDOS FOR LIFE';
  setMenu(false);
  window.scrollTo(0, 0);
  fx.toggle(page === 'home');
}
window.addEventListener('hashchange', route);

/* ---------- Background: canvas ringan ----------
   ±30–55 partikel, sprite glow yang di-render sekali, 30 fps,
   berhenti otomatis saat tab tersembunyi / bukan halaman Home. */
const fx = (() => {
  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['170,110,255', '124,33,255', '200,160,255'];
  const sprites = COLORS.map(c => {
    const s = document.createElement('canvas');
    s.width = s.height = 64;
    const g = s.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${c},1)`);
    grad.addColorStop(.35, `rgba(${c},.35)`);
    grad.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return s;
  });

  let w = 0, h = 0, parts = [], raf = 0, last = 0, running = false;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = w < 760 ? 30 : 55;
    parts = Array.from({ length: n }, () => spawn(true));
    if (reduce) draw();
  }
  function spawn(anywhere) {
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 20,
      s: 6 + Math.random() * 22,          // ukuran glow
      v: 6 + Math.random() * 16,          // px/detik ke atas
      a: .25 + Math.random() * .55,
      ph: Math.random() * 6.28,
      sp: .3 + Math.random() * .6,
      c: sprites[(Math.random() * sprites.length) | 0]
    };
  }
  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      ctx.globalAlpha = p.a;
      ctx.drawImage(p.c, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
  }
  function tick(t) {
    raf = requestAnimationFrame(tick);
    if (t - last < 33) return;              // ~30 fps
    const dt = Math.min((t - last) / 1000, .1); last = t;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.y -= p.v * dt;
      p.ph += p.sp * dt;
      p.x += Math.sin(p.ph) * 10 * dt;
      if (p.y < -20) parts[i] = spawn(false);
    }
    draw();
  }
  function start() {
    if (running || reduce || document.hidden) return;
    running = true; last = performance.now(); raf = requestAnimationFrame(tick);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  let onHome = true, rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => onHome && resize(), 150); });
  document.addEventListener('visibilitychange', () => (document.hidden || !onHome) ? stop() : start());

  return {
    toggle(show) {
      onHome = show;
      if (show) { resize(); start(); } else stop();
    }
  };
})();

route();
