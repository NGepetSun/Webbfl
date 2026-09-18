const toast = document.querySelector('.toast');

document.querySelectorAll('.action').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (link.getAttribute('href') === '#') {
      event.preventDefault();
      const type = link.dataset.action === 'discord' ? 'Discord' : 'Live Stream';
      toast.textContent = `${type} link belum diatur — ganti href="#" dengan link tujuanmu.`;
      toast.classList.add('show');
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
    }
  });
});

// Active menu state while scrolling through the home sections.
const sections = [...document.querySelectorAll('main[id], section[id]')];
const navLinks = [...document.querySelectorAll('.nav a')];

const observer = new IntersectionObserver((entries) => {
  const visible = entries
    .filter(entry => entry.isIntersecting)
    .sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${visible.target.id}`));
}, { threshold: [0.25, 0.55, 0.8] });

sections.forEach(section => observer.observe(section));


// Subtle UI motion: compress the header after leaving the very top.
(() => {
  const header = document.querySelector('.topbar');
  if (!header) return;
  const updateHeader = () => header.classList.toggle('scrolled', window.scrollY > 24);
  updateHeader();
  window.addEventListener('scroll', updateHeader, {passive:true});
})();
