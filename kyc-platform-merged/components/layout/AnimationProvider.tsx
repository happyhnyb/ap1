'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Lightweight client-side animation layer.
 * Renders null — all effects are side-effects on existing DOM.
 *
 *  1. Header shadow on scroll
 *  2. Scroll-reveal for .section and .grid-3 / .grid-2 children
 *  3. Stagger animation for grid children
 */
export function AnimationProvider() {
  const pathname = usePathname();

  // ── Header shadow on scroll ───────────────────────────
  useEffect(() => {
    const header = document.querySelector('.header') as HTMLElement | null;
    if (!header) return;
    const update = () => header.classList.toggle('header--scrolled', window.scrollY > 12);
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, []);

  // ── Scroll reveals ────────────────────────────────────
  useEffect(() => {
    // Mark html so CSS knows JS is active
    document.documentElement.classList.add('js-anim');

    const inViewport = (el: Element) =>
      el.getBoundingClientRect().top < window.innerHeight + 60;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (isIntersecting) {
            target.classList.add('anim-visible');
            observer.unobserve(target);
          }
        });
      },
      { threshold: 0.06, rootMargin: '0px 0px -28px 0px' },
    );

    // Sections: fade + slide up
    document.querySelectorAll('.section').forEach((el) => {
      el.classList.add('anim-reveal');
      if (inViewport(el)) {
        el.classList.add('anim-visible');
      } else {
        observer.observe(el);
      }
    });

    // Grid cards: stagger fade
    document.querySelectorAll('.grid-3, .grid-2').forEach((grid) => {
      grid.classList.add('anim-stagger');
      if (inViewport(grid)) {
        grid.classList.add('anim-visible');
      } else {
        observer.observe(grid);
      }
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
