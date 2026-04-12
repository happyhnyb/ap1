'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { SessionPayload } from '@/lib/auth/jwt';

export function BottomNav({ session }: { session: SessionPayload | null }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      <Link href="/" className={`bottom-nav-item${active('/') && pathname === '/' ? ' active' : ''}`}>
        <span className="bottom-nav-icon">🏠</span>
        <span>Home</span>
      </Link>
      <Link href="/feed" className={`bottom-nav-item${active('/feed') ? ' active' : ''}`}>
        <span className="bottom-nav-icon">📰</span>
        <span>Feed</span>
      </Link>
      <Link href="/search" className={`bottom-nav-item${active('/search') ? ' active' : ''}`}>
        <span className="bottom-nav-icon">🔍</span>
        <span>Search</span>
      </Link>
      {session ? (
        <Link href="/premium/predictor" className={`bottom-nav-item bottom-nav-item-gold${active('/premium/predictor') ? ' active' : ''}`}>
          <span className="bottom-nav-icon">⚡</span>
          <span>Predictor</span>
        </Link>
      ) : (
        <Link href="/subscribe" className="bottom-nav-item bottom-nav-item-gold">
          <span className="bottom-nav-icon">★</span>
          <span>Get Pro</span>
        </Link>
      )}
      {session ? (
        <Link href="/login" className="bottom-nav-item">
          <span className="bottom-nav-icon">👤</span>
          <span>{session.name.split(' ')[0]}</span>
        </Link>
      ) : (
        <Link href="/login" className="bottom-nav-item">
          <span className="bottom-nav-icon">👤</span>
          <span>Sign in</span>
        </Link>
      )}
    </nav>
  );
}
