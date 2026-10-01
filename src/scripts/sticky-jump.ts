export function initStickyJump(): void {
  const nav = document.querySelector<HTMLElement>('.reference-sticky-jump');
  if (!nav || nav.dataset.ready === '1') return;
  nav.dataset.ready = '1';
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('[data-jump-link]')];
  const sections = links
    .map((link) => document.getElementById(link.dataset.jumpLink ?? ''))
    .filter((section): section is HTMLElement => section !== null);
  if (!('IntersectionObserver' in window)) return;
  const hero = document.querySelector('.reference-hero');
  if (hero) {
    new IntersectionObserver(
      ([entry]) => {
        const visible = !entry?.isIntersecting;
        nav.classList.toggle('is-visible', visible);
        nav.inert = !visible;
      },
      {
        rootMargin: `-${getComputedStyle(document.documentElement).getPropertyValue('--nav-height').trim()} 0px 0px 0px`,
      },
    ).observe(hero);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      const current = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!current) return;
      for (const link of links) {
        link.classList.toggle('is-active', link.dataset.jumpLink === current.target.id);
      }
    },
    { rootMargin: '-130px 0px -65% 0px' },
  );
  for (const section of sections) observer.observe(section);
}
