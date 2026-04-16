import RegisterForm from './RegisterForm';
import type { Metadata } from 'next';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Create Account' };

export default function RegisterPage() {
  return <RegisterForm isDemo={env.IS_DEMO} />;
}
