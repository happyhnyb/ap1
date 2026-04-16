import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { getServerSession } from '@/lib/auth/jwt';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Ticker } from '@/components/layout/Ticker';
import { BottomNav } from '@/components/layout/BottomNav';
import { AnimationProvider } from '@/components/layout/AnimationProvider';

export const metadata: Metadata = {
  title: { default: 'Know Your Commodity', template: '%s · KYC' },
  description: 'Premium commodity intelligence platform for India. Deep analysis, real-time mandi data, and AI-powered price forecasting.',
  openGraph: {
    title: 'Know Your Commodity',
    description: 'Premium commodity intelligence platform for India.',
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
        <Header session={session} />
        {children}
        <Footer />
        <BottomNav session={session} />
        <AnimationProvider />
      </body>
    </html>
  );
}
