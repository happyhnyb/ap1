'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { SessionPayload } from '@/lib/auth/jwt';
import { tierLabel, isEditor } from '@/lib/auth/entitlement';
import LogoutButton from './LogoutButton';

interface Props {
  session: SessionPayload | null;
  predictorPublic?: boolean;
  billingEnabled?: boolean;
}

export function Header({ session, predictorPublic = false, billingEnabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const tier = tierLabel(session);

  // Close menu on route change
  useEffect(() => { setOpen(false); }, [pathname]);
  // Prevent body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const navLinks = [
    { href: '/',                  icon: '🏠', label: 'Home' },
    { href: '/feed',              icon: '📰', label: 'Feed' },
    { href: '/search',            icon: '🔍', label: 'Search' },
    { href: '/about',             icon: 'ℹ️', label: 'About' },
    { href: '/contact',           icon: '✉️', label: 'Contact' },
    ...((session || predictorPublic) ? [{ href: '/premium/predictor', icon: '⚡', label: 'Predictor', gold: true }] : []),
    ...(isEditor(session) ? [{ href: '/admin', icon: '⚙️', label: 'CMS' }] : []),
  ];

  return (
    <>
      <header className="header">
        <div className="container">
          <div className="header-inner">
            {/* Logo */}
            <Link href="/" className="logo" onClick={() => setOpen(false)}>
              <Image src="/logo.png" alt="KYC" width={44} height={44} priority
                style={{ filter: 'drop-shadow(0 0 10px rgba(76,175,80,.45))', flexShrink: 0 }} />
              <div className="logo-text">
                <span>Know Your</span>
                <span>Commodity</span>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="nav-links" aria-label="Main navigation">
              {navLinks.map(({ href, label, gold }) => (
                <Link
                  key={href} href={href}
                  className={`nav-link${gold ? ' nav-link-gold' : ''}${pathname === href ? ' active' : ''}`}
                >
                  {gold && '⚡ '}{label}
                </Link>
              ))}
            </nav>

            {/* Auth + hamburger */}
            <div className="header-auth">
              {session ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {tier === 'Pro' && (
                    <span className="badge badge-gold desktop-auth-only" style={{ fontSize: 9 }}>★ PRO</span>
                  )}
                  <span
                    className="desktop-auth-only"
                    style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {session.name.split(' ')[0]}
                  </span>
                  <div className="desktop-auth-only"><LogoutButton /></div>
                </div>
              ) : (
                <>
                  <Link href="/login" className="btn btn-sm desktop-auth-only">Sign in</Link>
                  <Link href="/subscribe" className="btn btn-sm btn-gold" style={{ fontSize: 12 }}>
                    {billingEnabled ? 'Plans' : 'Access'}
                  </Link>
                </>
              )}

              {/* Hamburger */}
              <button
                className="hamburger"
                aria-label={open ? 'Close menu' : 'Open menu'}
                aria-expanded={open}
                onClick={() => setOpen(!open)}
              >
                <span style={{ transform: open ? 'translateY(6.5px) rotate(45deg)' : '' }} />
                <span style={{ opacity: open ? 0 : 1 }} />
                <span style={{ transform: open ? 'translateY(-6.5px) rotate(-45deg)' : '' }} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      <nav className={`mobile-nav${open ? ' open' : ''}`} aria-hidden={!open}>
        {navLinks.map(({ href, icon, label, gold }) => (
          <Link
            key={href} href={href}
            className="mobile-nav-link"
            style={gold ? { color: 'var(--gold)' } : {}}
          >
            <span className="mobile-nav-link-icon">{icon}</span>
            <span>{label}</span>
            {pathname === href && <span style={{ marginLeft: 'auto', color: 'var(--green)', fontSize: 12 }}>●</span>}
          </Link>
        ))}

        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />

        {session ? (
          <div style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{session.name}</div>
              <div style={{ fontSize: 12, color: 'var(--dim)' }}>{session.email}</div>
            </div>
            <LogoutButton />
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, padding: '8px 0' }}>
            <Link href="/login"     className="btn btn-full" onClick={() => setOpen(false)}>Sign in</Link>
            <Link href="/subscribe" className="btn btn-gold btn-full" onClick={() => setOpen(false)}>
              {billingEnabled ? 'View plans' : 'Research access'}
            </Link>
          </div>
        )}
      </nav>
    </>
  );
}
