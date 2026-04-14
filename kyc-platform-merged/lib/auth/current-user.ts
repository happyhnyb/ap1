import { usersAdapter } from '@/lib/adapters';
import { getServerSession, sessionPayloadFromUser, type SessionPayload } from './jwt';

export async function getEffectiveServerSession(): Promise<SessionPayload | null> {
  const session = await getServerSession();
  if (!session) return null;

  try {
    const user = await usersAdapter.getByEmail(session.email);
    return user ? sessionPayloadFromUser(user) : session;
  } catch {
    return session;
  }
}
