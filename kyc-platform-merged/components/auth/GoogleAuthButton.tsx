'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            ux_mode?: 'popup' | 'redirect';
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function GoogleAuthButton({
  text = 'continue_with',
  redirectTo = '/',
}: {
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  redirectTo?: string;
}) {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !buttonRef.current) return;

    let mounted = true;
    const existing = document.querySelector('script[data-google-gsi="true"]') as HTMLScriptElement | null;

    const render = () => {
      if (!mounted || !window.google || !buttonRef.current) return;
      buttonRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          if (!response.credential) {
            setError('Google sign-in did not return a credential.');
            return;
          }

          try {
            const res = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: response.credential }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Google sign-in failed.');
            router.push(redirectTo);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Google sign-in failed.');
          }
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text,
        shape: 'pill',
        width: 320,
      });
    };

    if (existing) {
      existing.addEventListener('load', render, { once: true });
      render();
      return () => { mounted = false; };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = 'true';
    script.onload = render;
    document.head.appendChild(script);

    return () => {
      mounted = false;
    };
  }, [redirectTo, router, text]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div ref={buttonRef} style={{ display: 'flex', justifyContent: 'center' }} />
      {error && <div className="notice notice-red" style={{ marginBottom: 0, textAlign: 'center' }}>{error}</div>}
    </div>
  );
}
