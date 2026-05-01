import { getServerSession, type SessionPayload } from './jwt';

export async function getEffectiveServerSession(): Promise<SessionPayload | null> {
  return getServerSession();
}
