import { Suspense } from 'react';
import LoginForm from './LoginForm';
import type { Metadata } from 'next';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm isDemo={env.IS_DEV && env.ENABLE_DEMO_AUTH && env.IS_DEMO} />
    </Suspense>
  );
}
