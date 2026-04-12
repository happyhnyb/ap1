import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getServerSession } from '@/lib/auth/jwt';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Ticker } from '@/components/layout/Ticker';
import { BottomNav } from '@/components/layout/BottomNav';

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
      <body>
        <Ticker />
        <Header session={session} />
        {children}
        <Footer />
        <BottomNav session={session} />
      </body>
    </html>
  );
}
