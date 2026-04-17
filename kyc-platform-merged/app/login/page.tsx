import LoginForm from './LoginForm';
import type { Metadata } from 'next';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
  return <LoginForm isDemo={env.IS_DEV && env.ENABLE_DEMO_AUTH && env.IS_DEMO} />;
}
