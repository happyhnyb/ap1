import bcrypt from 'bcryptjs';
import { createId, createOpaqueToken, sha256Hex } from '@/lib/db/ids';
import { pgQuery } from '@/lib/db/pg';
import type { User } from '@/types/user';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type UserRow = {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  password_hash: string | null;
  role: 'user' | 'editor' | 'admin';
  status: 'active' | 'disabled' | 'pending';
  auth_methods: string[];
  plan: 'free' | 'monthly' | 'annual';
  sub_status: 'active' | 'expired' | 'cancelled' | 'none';
  sub_started_at: string | null;
  sub_expires_at: string | null;
  payment_ref: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  last_login_at: string | null;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

function toUser(row: UserRow): User {
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    password_hash: row.password_hash ?? '',
    role: row.role,
    auth_methods: (row.auth_methods ?? ['email']) as User['auth_methods'],
    status: row.status,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    subscription: {
      status: row.sub_status,
      plan: row.plan,
      started_at: row.sub_started_at,
      expires_at: row.sub_expires_at,
      payment_ref: row.payment_ref,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
  };
}

export async function ensureRoleSeeds() {
  await pgQuery(
    `INSERT INTO roles (name, description) VALUES
      ('admin', 'Full system access'),
      ('editor', 'Editorial and CMS access'),
      ('user', 'Standard signed-in user')
     ON CONFLICT (name) DO NOTHING`
  );
  await pgQuery(
    `INSERT INTO permissions (code, description) VALUES
      ('articles.read', 'Read article records'),
      ('articles.write', 'Create and edit article records'),
      ('users.read', 'Read user records'),
      ('users.write', 'Manage user records'),
      ('auth.manage', 'Manage auth sessions')
     ON CONFLICT (code) DO NOTHING`
  );
  await pgQuery(
    `INSERT INTO role_permissions (role_name, permission_code) VALUES
      ('admin', 'articles.read'),
      ('admin', 'articles.write'),
      ('admin', 'users.read'),
      ('admin', 'users.write'),
      ('admin', 'auth.manage'),
      ('editor', 'articles.read'),
      ('editor', 'articles.write'),
      ('user', 'articles.read')
     ON CONFLICT (role_name, permission_code) DO NOTHING`
  );
}

export async function listUsers() {
  const result = await pgQuery<UserRow>('SELECT * FROM app_users ORDER BY created_at DESC');
  return result.rows.map(toUser);
}

export async function getUserByEmail(email: string) {
  const result = await pgQuery<UserRow>('SELECT * FROM app_users WHERE email = $1 LIMIT 1', [email.toLowerCase()]);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export async function getUserById(id: string) {
  const result = await pgQuery<UserRow>('SELECT * FROM app_users WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export async function createUser(input: { name: string; email: string; password: string; role?: 'user' | 'editor' | 'admin' }) {
  const id = createId('usr');
  const passwordHash = await bcrypt.hash(input.password, 12);
  const result = await pgQuery<UserRow>(
    `INSERT INTO app_users (
      id, name, email, password_hash, role, auth_methods, status, plan, sub_status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'active', 'free', 'none')
    RETURNING *`,
    [id, input.name.trim(), input.email.toLowerCase(), passwordHash, input.role ?? 'user', ['email']]
  );
  return toUser(result.rows[0]);
}

export async function updateUserPassword(userId: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  await pgQuery(
    'UPDATE app_users SET password_hash = $2, auth_methods = ARRAY(SELECT DISTINCT value FROM unnest(auth_methods || $3::text[]) AS value), updated_at = NOW() WHERE id = $1',
    [userId, passwordHash, ['email']]
  );
  return getUserById(userId);
}

export async function upsertUserWithPassword(input: {
  name: string;
  email: string;
  password: string;
  role: 'user' | 'editor' | 'admin';
}) {
  const existing = await getUserByEmail(input.email);
  if (existing) {
    const passwordHash = await bcrypt.hash(input.password, 12);
    await pgQuery(
      `UPDATE app_users
       SET name = $2,
           password_hash = $3,
           role = $4,
           status = 'active',
           auth_methods = ARRAY(SELECT DISTINCT value FROM unnest(auth_methods || $5::text[]) AS value),
           updated_at = NOW()
       WHERE id = $1`,
      [existing._id, input.name.trim(), passwordHash, input.role, ['email']]
    );
    return (await getUserById(existing._id))!;
  }

  return createUser(input);
}

export async function loginUser(email: string, password: string) {
  const result = await pgQuery<UserRow>('SELECT * FROM app_users WHERE email = $1 LIMIT 1', [email.toLowerCase()]);
  const row = result.rows[0];
  if (!row || !row.password_hash) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  await pgQuery('UPDATE app_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [row.id]);
  return toUser({ ...row, last_login_at: new Date().toISOString() });
}

export async function findOrCreateAuthUser(input: { name: string; email: string; method: 'email' | 'google' }) {
  const existing = await getUserByEmail(input.email);
  if (existing) {
    await pgQuery(
      `UPDATE app_users
       SET name = COALESCE(NULLIF(name, ''), $2),
           auth_methods = (
             SELECT ARRAY(
               SELECT DISTINCT value
               FROM unnest(auth_methods || $3::text[]) AS value
             )
           ),
           updated_at = NOW()
       WHERE id = $1`,
      [existing._id, input.name.trim(), [input.method]]
    );
    return (await getUserById(existing._id))!;
  }

  const id = createId('usr');
  const result = await pgQuery<UserRow>(
    `INSERT INTO app_users (
      id, name, email, password_hash, role, auth_methods, status, plan, sub_status
    ) VALUES ($1, $2, $3, NULL, 'user', $4, 'active', 'free', 'none')
    RETURNING *`,
    [id, input.name.trim(), input.email.toLowerCase(), [input.method]]
  );
  return toUser(result.rows[0]);
}

export async function createSession(input: { userId: string; ipAddress?: string | null; userAgent?: string | null }) {
  const id = createId('ses');
  const rawToken = createOpaqueToken();
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await pgQuery(
    `INSERT INTO user_sessions (id, user_id, session_token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.userId, tokenHash, expiresAt.toISOString(), input.ipAddress ?? null, input.userAgent ?? null]
  );

  return { token: rawToken, expiresAt };
}

export async function getUserBySessionToken(token: string) {
  const tokenHash = sha256Hex(token);
  const result = await pgQuery<UserRow>(
    `SELECT u.*
     FROM user_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.session_token_hash = $1
       AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  if (!result.rows[0]) return null;
  await pgQuery('UPDATE user_sessions SET last_seen_at = NOW(), updated_at = NOW() WHERE session_token_hash = $1', [tokenHash]);
  return toUser(result.rows[0]);
}

export async function revokeSessionToken(token: string) {
  await pgQuery('DELETE FROM user_sessions WHERE session_token_hash = $1', [sha256Hex(token)]);
}

export async function rotateSessionToken(token: string) {
  const tokenHash = sha256Hex(token);
  const sessionLookup = await pgQuery<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM user_sessions WHERE session_token_hash = $1 AND expires_at > NOW() LIMIT 1',
    [tokenHash]
  );
  const row = sessionLookup.rows[0];
  if (!row) return null;

  const nextToken = createOpaqueToken();
  const nextHash = sha256Hex(nextToken);
  const nextExpiry = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await pgQuery(
    `UPDATE user_sessions
     SET session_token_hash = $2, expires_at = $3, updated_at = NOW()
     WHERE id = $1`,
    [row.id, nextHash, nextExpiry.toISOString()]
  );
  return { token: nextToken, expiresAt: nextExpiry, userId: row.user_id };
}

export async function activatePremium(userId: string, plan: 'monthly' | 'annual', opts?: { paymentRef?: string | null; effectiveAt?: Date }) {
  const effectiveAt = opts?.effectiveAt ?? new Date();
  const expiresAt = new Date(effectiveAt);
  expiresAt.setMonth(expiresAt.getMonth() + (plan === 'annual' ? 12 : 1));
  await pgQuery(
    `UPDATE app_users
     SET plan = $2,
         sub_status = 'active',
         sub_started_at = COALESCE(sub_started_at, $3),
         sub_expires_at = $4,
         payment_ref = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [userId, plan, effectiveAt.toISOString(), expiresAt.toISOString(), opts?.paymentRef ?? null]
  );
  return getUserById(userId);
}

export async function setStripeCustomerId(userId: string, customerId: string) {
  await pgQuery('UPDATE app_users SET stripe_customer_id = $2, updated_at = NOW() WHERE id = $1', [userId, customerId]);
}

export async function getByStripeCustomerId(customerId: string) {
  const result = await pgQuery<UserRow>('SELECT * FROM app_users WHERE stripe_customer_id = $1 LIMIT 1', [customerId]);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export async function syncStripeSubscription(customerId: string, opts: {
  stripeSubscriptionId: string;
  status: 'active' | 'expired' | 'cancelled' | 'none';
  plan: 'monthly' | 'annual';
  expiresAt: Date | null;
}) {
  await pgQuery(
    `UPDATE app_users
     SET stripe_subscription_id = $2,
         sub_status = $3,
         plan = $4,
         sub_expires_at = $5,
         updated_at = NOW()
     WHERE stripe_customer_id = $1`,
    [customerId, opts.stripeSubscriptionId, opts.status, opts.plan, opts.expiresAt?.toISOString() ?? null]
  );
}

export async function expireStaleSubscriptions() {
  await pgQuery(
    `UPDATE app_users
     SET sub_status = 'expired', updated_at = NOW()
     WHERE sub_status = 'active' AND sub_expires_at IS NOT NULL AND sub_expires_at <= NOW()`
  );
}
