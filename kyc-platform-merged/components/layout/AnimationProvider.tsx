'use client';

import { useEffect, useState } from 'react';
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
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);

  // ── Header shadow on scroll ───────────────────────────
  useEffect(() => {
    const header = document.querySelector('.header') as HTMLElement | null;
    if (!header) return;
    const update = () => {
      header.classList.toggle('header--scrolled', window.scrollY > 12);

      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      setScrollProgress(progress);
      setShowTop(window.scrollY > 540);
    };

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

    // Sections and key shells: fade + slide up
    document.querySelectorAll('.section, .blog-masthead, .feed-hero, .article-shell, .predictor-shell > *').forEach((el) => {
      el.classList.add('anim-reveal');
      if (inViewport(el)) {
        el.classList.add('anim-visible');
      } else {
        observer.observe(el);
      }
    });

    // Grid cards: stagger fade
    document.querySelectorAll('.grid-3, .grid-2, .feed-hero-side, .predictor-grid').forEach((grid) => {
      grid.classList.add('anim-stagger');
      if (inViewport(grid)) {
        grid.classList.add('anim-visible');
      } else {
        observer.observe(grid);
      }
    });

    document.querySelectorAll('.card, .card-elevated, .post-card, .post-card-lg, .metric-card, .table-wrap').forEach((el) => {
      el.classList.add('anim-reveal-soft');
      if (inViewport(el)) {
        el.classList.add('anim-visible');
      } else {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [pathname]);

  return (
    <>
      <div
        className="scroll-progress"
        aria-hidden="true"
        style={{ transform: `scaleX(${scrollProgress})` }}
      />
      <button
        type="button"
        className={`scroll-top${showTop ? ' visible' : ''}`}
        aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        ↑
      </button>
    </>
  );
}
