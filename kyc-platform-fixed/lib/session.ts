// Re-export from the new JWT module for backward compatibility
export { getServerSession as getServerSessionUser, type SessionPayload as SessionUser } from './auth/jwt';
