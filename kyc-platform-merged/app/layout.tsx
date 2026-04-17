import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { getServerSession } from '@/lib/auth/jwt';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Ticker } from '@/components/layout/Ticker';
import { BottomNav } from '@/components/layout/BottomNav';
import { AnimationProvider } from '@/components/layout/AnimationProvider';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: { default: 'Know Your Commodity', template: '%s · KYC' },
  metadataBase: new URL(env.BASE_URL),
  description: 'Global commodity intelligence platform with market reporting, source-backed research, and AI-assisted forecast analysis.',
  openGraph: {
    title: 'Know Your Commodity',
    description: 'Global commodity intelligence platform with market reporting, research tools, and AI-assisted forecast analysis.',
    type: 'website',
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'KYC' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#080a06',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  const predictorPublic = env.PREDICTOR_RELEASE_MODE === 'public';

  return (
    <html lang="en">
      <head>
        {/* Font preconnect — establishes TCP/TLS early, avoiding the double-block of @import */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body>
        {/* Ticker streams in independently — page shell renders without waiting for DB */}
        <Suspense fallback={<div className="ticker-placeholder" />}>
          <Ticker />
        </Suspense>
        <Header session={session} predictorPublic={predictorPublic} billingEnabled={env.PAYMENTS_ENABLED} />
        {children}
        <Footer predictorPublic={predictorPublic} />
        <BottomNav session={session} predictorPublic={predictorPublic} billingEnabled={env.PAYMENTS_ENABLED} />
        <AnimationProvider />
      </body>
    </html>
  );
}
