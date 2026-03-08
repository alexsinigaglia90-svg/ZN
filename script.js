const revealElements = document.querySelectorAll('.reveal');
const heroComposition = document.querySelector('.hero-composition');
const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.14,
    rootMargin: '0px 0px -10% 0px',
  }
);

revealElements.forEach((element) => revealObserver.observe(element));

if (heroComposition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  heroComposition.classList.add('hero-parallax');

  const applyParallax = () => {
    const shift = Math.max(-14, window.scrollY * -0.03);
    heroComposition.style.setProperty('--hero-shift', `${shift}px`);
  };

  applyParallax();
  window.addEventListener('scroll', applyParallax, { passive: true });
}

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!isExpanded));
    siteNav.classList.toggle('is-open', !isExpanded);
  });

  siteNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menuToggle.setAttribute('aria-expanded', 'false');
      siteNav.classList.remove('is-open');
    });
  });
}