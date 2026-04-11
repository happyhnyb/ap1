import Link from 'next/link';
import Image from 'next/image';
import type { SessionPayload } from '@/lib/auth/jwt';
import { tierLabel, isEditor } from '@/lib/auth/entitlement';
import LogoutButton from './LogoutButton';

interface Props { session: SessionPayload | null }

export function Header({ session }: Props) {
  const tier = tierLabel(session);

  return (
    <header className="header">
      <div className="container">
        <div className="header-inner">
          {/* Logo */}
          <Link href="/" className="logo" style={{ gap: 12 }}>
            <Image
              src="/logo.png"
              alt="KYC"
              width={72}
              height={72}
              style={{ filter: 'drop-shadow(0 0 12px rgba(76,175,80,.5))', flexShrink: 0 }}
              priority
            />
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontFamily: 'Lora,serif', fontWeight: 700, fontSize: 18 }}>Know Your</div>
              <div style={{ color: 'var(--green)', fontFamily: 'Lora,serif', fontWeight: 700, fontSize: 18, fontStyle: 'italic' }}>Commodity</div>
            </div>
          </Link>

          {/* Nav links */}
          <nav className="nav-links">
            <Link href="/" className="nav-link">Home</Link>
            <Link href="/feed" className="nav-link">Feed</Link>
            <Link href="/search" className="nav-link">Search</Link>
            <Link href="/about" className="nav-link">About</Link>
            <Link href="/contact" className="nav-link">Contact</Link>
            {session && (
              <Link href="/premium/predictor" className="nav-link" style={{ color: 'var(--gold)', fontWeight: 500 }}>
                ⚡ Predictor
              </Link>
            )}
            {isEditor(session) && (
              <Link href="/admin" className="nav-link" style={{ fontSize: 12, opacity: 0.8 }}>CMS</Link>
            )}
          </nav>

          {/* Auth */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {session ? (
              <>
                {tier === 'Pro' && (
                  <span className="badge badge-gold" style={{ fontSize: 10, letterSpacing: '.06em' }}>★ PRO</span>
                )}
                <span style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session.name.split(' ')[0]}
                </span>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-sm">Sign in</Link>
                <Link href="/subscribe" className="btn btn-sm btn-gold">Get Pro ↗</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
