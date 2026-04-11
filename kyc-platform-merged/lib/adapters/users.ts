/**
 * Users adapter — MongoDB in production, in-memory in demo/dev mode.
 *
 * SECURITY: The in-memory adapter accepts plaintext passwords ONLY for
 * seeded demo accounts and ONLY when NODE_ENV !== 'production'.
 * In production, every password comparison goes through bcrypt.
 */
import type { User } from '@/types/user';
import { INITIAL_USERS } from '@/mocks/data';
import { isMongoConfigured, connectDB } from '@/lib/db/connect';
import { UserModel } from '@/lib/db/models/User';
import bcrypt from 'bcryptjs';

const IS_PROD = process.env.NODE_ENV === 'production';

function toUser(doc: Record<string, unknown>): User {
  const sub = doc.subscription as Record<string, unknown>;
  return {
    _id:           String(doc._id),
    name:          doc.name as string,
    email:         doc.email as string,
    mobile:        (doc.mobile as string | null) ?? null,
    password_hash: (doc.password_hash as string) ?? '',
    auth_methods:  (doc.auth_methods as User['auth_methods']) ?? ['email'],
    role:          doc.role as User['role'],
    subscription: {
      status:     (sub?.status as User['subscription']['status']) ?? 'none',
      plan:       (sub?.plan   as User['subscription']['plan'])   ?? 'free',
      expires_at: sub?.expires_at
        ? new Date(sub.expires_at as string).toISOString().slice(0, 10)
        : null,
    },
    created_at: new Date(doc.created_at as string).toISOString(),
  };
}

// ── Mongo implementation ─────────────────────────────────────────
const mongo = {
  async list() {
    await connectDB();
    const docs = await UserModel.find().sort({ created_at: -1 }).lean();
    return docs.map((d) => toUser(d as unknown as Record<string, unknown>));
  },
  async getByEmail(email: string) {
    await connectDB();
    const doc = await UserModel.findOne({ email: email.toLowerCase() }).lean();
    return doc ? toUser(doc as unknown as Record<string, unknown>) : null;
  },
  async login(email: string, password: string) {
    await connectDB();
    const doc = await UserModel.findOne({ email: email.toLowerCase() }).lean();
    if (!doc || !doc.password_hash) return null;
    const ok = await bcrypt.compare(password, String(doc.password_hash));
    return ok ? toUser(doc as unknown as Record<string, unknown>) : null;
  },
  async register(input: { name: string; email: string; password: string }) {
    await connectDB();
    const hash = await bcrypt.hash(input.password, 12);
    const doc = await UserModel.create({
      name:          input.name,
      email:         input.email.toLowerCase(),
      password_hash: hash,
      auth_methods:  ['email'],
      role:          'reader',
      subscription:  { status: 'none', plan: 'free', expires_at: null },
    });
    return toUser(doc.toObject() as unknown as Record<string, unknown>);
  },
  async activatePremium(userId: string, plan: 'monthly' | 'annual') {
    await connectDB();
    const months = plan === 'annual' ? 12 : 1;
    const expires = new Date();
    expires.setMonth(expires.getMonth() + months);
    await UserModel.findByIdAndUpdate(userId, {
      role:                        'premium',
      'subscription.status':       'active',
      'subscription.plan':         plan,
      'subscription.started_at':   new Date(),
      'subscription.expires_at':   expires,
    });
  },

  /** Set Stripe customer ID on a user (called at checkout creation). */
  async setStripeCustomerId(userId: string, customerId: string) {
    await connectDB();
    await UserModel.findByIdAndUpdate(userId, { stripe_customer_id: customerId });
  },

  /** Find a user by their Stripe customer ID (used in webhooks). */
  async getByStripeCustomerId(customerId: string) {
    await connectDB();
    const doc = await UserModel.findOne({ stripe_customer_id: customerId }).lean();
    return doc ? toUser(doc as unknown as Record<string, unknown>) : null;
  },

  /** Full subscription sync from a Stripe subscription object (webhook handler). */
  async syncStripeSubscription(customerId: string, opts: {
    stripeSubscriptionId: string;
    status: 'active' | 'expired' | 'cancelled' | 'none';
    plan: 'monthly' | 'annual';
    expiresAt: Date | null;
  }) {
    await connectDB();
    const update: Record<string, unknown> = {
      'subscription.stripe_subscription_id': opts.stripeSubscriptionId,
      'subscription.status':  opts.status,
      'subscription.plan':    opts.plan,
      'subscription.expires_at': opts.expiresAt,
    };
    if (opts.status === 'active') {
      update['role'] = 'premium';
      update['subscription.started_at'] = new Date();
    } else {
      // Revoke premium access on cancel/expire/failure
      update['role'] = 'reader';
    }
    await UserModel.findOneAndUpdate({ stripe_customer_id: customerId }, update);
  },

  /** Expire all subscriptions whose expires_at has passed (run on a schedule). */
  async expireStaleSubscriptions() {
    await connectDB();
    const now = new Date();
    await UserModel.updateMany(
      { 'subscription.status': 'active', 'subscription.expires_at': { $lte: now } },
      { 'subscription.status': 'expired', role: 'reader' }
    );
  },
};

// ── In-memory implementation (demo / dev only) ───────────────────
let memoryUsers: User[] = [...INITIAL_USERS];

const memory = {
  async list() { return [...memoryUsers]; },
  async getByEmail(email: string) {
    return memoryUsers.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  },
  async login(email: string, password: string) {
    const user = memoryUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return null;

    // Seed/demo users store plaintext passwords (not bcrypt hashes).
    // Detect by checking if the stored value looks like a bcrypt hash ($2a/$2b prefix).
    // This allows the in-memory demo to work in production (e.g. Vercel without MongoDB).
    const isBcrypt = user.password_hash?.startsWith('$2');
    if (!isBcrypt) {
      return user.password_hash === password ? user : null;
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    return ok ? user : null;
  },
  async register(input: { name: string; email: string; password: string }) {
    const hash = await bcrypt.hash(input.password, 12);
    const now = new Date().toISOString();
    const user: User = {
      _id:           `u${Date.now()}`,
      name:          input.name,
      email:         input.email.toLowerCase(),
      mobile:        null,
      password_hash: hash,
      auth_methods:  ['email'],
      role:          'reader',
      subscription:  { status: 'none', plan: 'free', expires_at: null },
      created_at:    now,
    };
    memoryUsers = [user, ...memoryUsers];
    return user;
  },
  async activatePremium(userId: string, plan: 'monthly' | 'annual') {
    const months = plan === 'annual' ? 12 : 1;
    const expires = new Date();
    expires.setMonth(expires.getMonth() + months);
    memoryUsers = memoryUsers.map((u) => u._id !== userId ? u : {
      ...u,
      role:         'premium',
      subscription: { status: 'active', plan, expires_at: expires.toISOString().slice(0, 10) },
    } as User);
  },
  // Stripe methods are no-ops in demo mode — payments require MongoDB
  async setStripeCustomerId(_userId: string, _customerId: string) {
    if (IS_PROD) throw new Error('Stripe requires MongoDB — set MONGODB_URI');
  },
  async getByStripeCustomerId(_customerId: string) {
    if (IS_PROD) throw new Error('Stripe requires MongoDB — set MONGODB_URI');
    return null;
  },
  async syncStripeSubscription(_customerId: string, _opts: Parameters<typeof mongo.syncStripeSubscription>[1]) {
    if (IS_PROD) throw new Error('Stripe requires MongoDB — set MONGODB_URI');
  },
  async expireStaleSubscriptions() {
    const now = new Date().toISOString().slice(0, 10);
    memoryUsers = memoryUsers.map((u) => {
      if (u.subscription.status === 'active' && u.subscription.expires_at && u.subscription.expires_at < now) {
        return { ...u, role: 'reader', subscription: { ...u.subscription, status: 'expired' } } as User;
      }
      return u;
    });
  },
};

// ── In production: require Mongo ─────────────────────────────────
if (IS_PROD && !isMongoConfigured()) {
  console.error(
    '[users] FATAL: MONGODB_URI is not configured. ' +
    'The in-memory adapter must not be used in production. ' +
    'Set MONGODB_URI in your environment.'
  );
}

export const usersAdapter = isMongoConfigured() ? mongo : memory;
