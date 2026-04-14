import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import { canAccessPredictor } from '@/lib/auth/entitlement';
import PredictorClient from '@/components/predictor/PredictorClient';
import PredictorPaywall from '@/components/predictor/PredictorPaywall';

export const metadata: Metadata = { title: 'Commodity Price Predictor' };

export default async function PredictorPage() {
  const session = await getEffectiveServerSession();

  if (!session) redirect('/login?from=/premium/predictor');

  const hasAccess = canAccessPredictor(session);

  if (!hasAccess) {
    return <PredictorPaywall />;
  }

  return <PredictorClient />;
}
