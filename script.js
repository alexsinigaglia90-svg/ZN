const revealElements = document.querySelectorAll('.reveal');
const heroComposition = document.querySelector('.hero-composition');
const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');
const scrollProgress = document.querySelector('.scroll-progress');
const sections = document.querySelectorAll('main section[id]');
const navLinks = siteNav ? siteNav.querySelectorAll('a[href^="#"]') : [];

revealElements.forEach((element, index) => {
  element.style.setProperty('--reveal-delay', `${Math.min(index * 45, 280)}ms`);
});

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

const updateScrollProgress = () => {
  if (!scrollProgress) {
    return;
  }

  const doc = document.documentElement;
  const scrollTop = doc.scrollTop || document.body.scrollTop;
  const scrollHeight = doc.scrollHeight - doc.clientHeight;
  const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
  scrollProgress.style.width = `${Math.min(progress, 100)}%`;
};

if (sections.length > 0 && navLinks.length > 0) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const id = entry.target.getAttribute('id');
        if (!id) {
          return;
        }

        const matchingLink = siteNav.querySelector(`a[href="#${id}"]`);

        if (entry.isIntersecting) {
          entry.target.classList.add('is-current');
          navLinks.forEach((link) => link.classList.remove('is-active'));
          if (matchingLink) {
            matchingLink.classList.add('is-active');
          }
        } else {
          entry.target.classList.remove('is-current');
        }
      });
    },
    {
      threshold: 0.45,
      rootMargin: '-10% 0px -35% 0px',
    }
  );

  sections.forEach((section) => sectionObserver.observe(section));
}

if (heroComposition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  heroComposition.classList.add('hero-parallax');

  const applyParallax = () => {
    const shift = Math.max(-14, window.scrollY * -0.03);
    heroComposition.style.setProperty('--hero-shift', `${shift}px`);
  };

  applyParallax();
  window.addEventListener('scroll', applyParallax, { passive: true });
}

updateScrollProgress();
window.addEventListener('scroll', updateScrollProgress, { passive: true });

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