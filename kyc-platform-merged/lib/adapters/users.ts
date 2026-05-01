import 'server-only';

import bcrypt from 'bcryptjs';
import type { User } from '@/types/user';
import { env } from '@/lib/env';
import { connectDB, isMongoConfigured } from '@/lib/db/connect';
import { UserModel } from '@/lib/db/models/User';
import {
  activatePremium as pgActivatePremium,
  createUser,
  ensureRoleSeeds,
  expireStaleSubscriptions as pgExpireStaleSubscriptions,
  findOrCreateAuthUser as pgFindOrCreateAuthUser,
  getByStripeCustomerId as pgGetByStripeCustomerId,
  getUserByEmail,
  listUsers,
  loginUser,
  setStripeCustomerId as pgSetStripeCustomerId,
  syncStripeSubscription as pgSyncStripeSubscription,
  updateUserPassword as pgUpdateUserPassword,
  upsertUserWithPassword as pgUpsertUserWithPassword,
} from '@/lib/db/repositories/users';

export class AuthStoreUnavailableError extends Error {
  constructor(message = 'Authentication is temporarily unavailable.') {
    super(message);
    this.name = 'AuthStoreUnavailableError';
  }
}

function getBackendBaseUrl() {
  return env.MAC_MINI_API_BASE_URL.replace(/\/$/, '');
}

async function proxyJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    throw new AuthStoreUnavailableError('No local database or Mac Mini backend is configured.');
  }

  const headers = new Headers(init?.headers);
  if (env.INTERNAL_API_KEY) {
    headers.set('x-internal-api-key', env.INTERNAL_API_KEY);
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const payload = await res.json().catch(() => null) as { error?: string } & T | null;
  if (!res.ok) {
    throw new AuthStoreUnavailableError(payload?.error || `Mac Mini user request failed (${res.status}).`);
  }

  return payload as T;
}

async function ensureLocalSeeds() {
  if (env.DATABASE_URL) {
    await ensureRoleSeeds();
  }
}

function normalizeRole(role: string): User['role'] {
  if (role === 'admin' || role === 'editor') return role;
  return 'user';
}

function toMongoUser(doc: Record<string, unknown>): User {
  const subscription = (doc.subscription as Record<string, unknown> | undefined) ?? {};
  return {
    _id: String(doc._id),
    name: doc.name as string,
    email: doc.email as string,
    mobile: (doc.mobile as string | null) ?? null,
    password_hash: (doc.password_hash as string) ?? '',
    role: normalizeRole((doc.role as string) ?? 'user'),
    auth_methods: ((doc.auth_methods as ('email' | 'google')[]) ?? ['email']),
    stripe_customer_id: (doc.stripe_customer_id as string | null) ?? null,
    stripe_subscription_id: (subscription.stripe_subscription_id as string | null) ?? null,
    subscription: {
      status: ((subscription.status as User['subscription']['status']) ?? 'none'),
      plan: ((subscription.plan as User['subscription']['plan']) ?? 'free'),
      started_at: subscription.started_at ? new Date(subscription.started_at as string).toISOString() : null,
      expires_at: subscription.expires_at ? new Date(subscription.expires_at as string).toISOString() : null,
      payment_ref: (subscription.payment_ref as string | null) ?? null,
    },
    created_at: new Date(doc.created_at as string).toISOString(),
    updated_at: doc.updated_at ? new Date(doc.updated_at as string).toISOString() : undefined,
    last_login_at: null,
  };
}

export const usersAdapter = {
  async list(): Promise<User[]> {
    if (env.DATABASE_URL) {
      await ensureLocalSeeds();
      return listUsers();
    }
    if (isMongoConfigured()) {
      await connectDB();
      const docs = await UserModel.find().sort({ created_at: -1 }).lean();
      return docs.map((doc) => toMongoUser(doc as unknown as Record<string, unknown>));
    }
    return proxyJson<User[]>('/api/internal/users');
  },

  async getByEmail(email: string): Promise<User | null> {
    if (env.DATABASE_URL) {
      await ensureLocalSeeds();
      return getUserByEmail(email);
    }
    if (isMongoConfigured()) {
      await connectDB();
      const doc = await UserModel.findOne({ email: email.toLowerCase() }).lean();
      return doc ? toMongoUser(doc as unknown as Record<string, unknown>) : null;
    }
    const query = new URLSearchParams({ email }).toString();
    const result = await proxyJson<{ user: User | null }>(`/api/internal/users?${query}`);
    return result.user;
  },

  async login(email: string, password: string): Promise<User | null> {
    if (env.DATABASE_URL) {
      await ensureLocalSeeds();
      return loginUser(email, password);
    }
    if (isMongoConfigured()) {
      await connectDB();
      const doc = await UserModel.findOne({ email: email.toLowerCase() }).lean();
      if (!doc?.password_hash) return null;
      const ok = await bcrypt.compare(password, doc.password_hash);
      if (!ok) return null;
      return toMongoUser(doc as unknown as Record<string, unknown>);
    }
    const result = await proxyJson<{ user: User | null }>('/api/internal/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'login', email, password }),
    });
    return result.user;
  },

  async register(input: { name: string; email: string; password: string }): Promise<User> {
    if (env.DATABASE_URL) {
      await ensureLocalSeeds();
      return createUser(input);
    }
    if (isMongoConfigured()) {
      await connectDB();
      const passwordHash = await bcrypt.hash(input.password, 12);
      const doc = await UserModel.create({
        name: input.name.trim(),
        email: input.email.toLowerCase(),
        password_hash: passwordHash,
        auth_methods: ['email'],
        role: 'reader',
        subscription: {
          status: 'none',
          plan: 'free',
        },
      });
      return toMongoUser(doc.toObject() as unknown as Record<string, unknown>);
    }
    const result = await proxyJson<{ user: User }>('/api/internal/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'register', ...input }),
    });
    return result.user;
  },

  async updatePassword(userId: string, password: string): Promise<User | null> {
    if (env.DATABASE_URL) {
      await ensureLocalSeeds();
      return pgUpdateUserPassword(userId, password);
    }
    if (isMongoConfigured()) {
      await connectDB();
      const passwordHash = await bcrypt.hash(password, 12);
      const doc = await UserModel.findByIdAndUpdate(
        userId,
        {
          $set: {
            password_hash: passwordHash,
            updated_at: new Date(),
          },
          $addToSet: { auth_methods: 'email' },
        },
        { new: true }
      ).lean();
      return doc ? toMongoUser(doc as unknown as Record<string, unknown>) : null;
    }
    const result = await proxyJson<{ user: User | null }>('/api/internal/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'updatePassword', userId, password }),
    });
    return result.user;
  },

  async upsertPrivilegedUser(input: {
    name: string;
    email: string;
    password: string;
    role: 'editor' | 'admin';
  }): Promise<User> {
    if (env.DATABASE_URL) {
      await ensureLocalSeeds();
      return pgUpsertUserWithPassword(input);
    }
    if (isMongoConfigured()) {
      await connectDB();
      const passwordHash = await bcrypt.hash(input.password, 12);
      const doc = await UserModel.findOneAndUpdate(
        { email: input.email.toLowerCase() },
        {
          $set: {
            name: input.name.trim(),
            email: input.email.toLowerCase(),
            password_hash: passwordHash,
            role: input.role,
            updated_at: new Date(),
          },
          $addToSet: { auth_methods: 'email' },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      ).lean();
      return toMongoUser(doc as unknown as Record<string, unknown>);
    }
    const result = await proxyJson<{ user: User }>('/api/internal/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'upsertPrivilegedUser', ...input }),
    });
    return result.user;
  },

  async findOrCreateAuthUser(input: { name: string; email: string; method: 'email' | 'google' }): Promise<User> {
    if (env.DATABASE_URL) {
      await ensureLocalSeeds();
      return pgFindOrCreateAuthUser(input);
    }
    if (isMongoConfigured()) {
      await connectDB();
      const existing = await UserModel.findOne({ email: input.email.toLowerCase() });
      if (existing) {
        existing.name = existing.name || input.name.trim();
        existing.auth_methods = Array.from(new Set([...(existing.auth_methods || []), input.method])) as ('email' | 'google')[];
        await existing.save();
        return toMongoUser(existing.toObject() as unknown as Record<string, unknown>);
      }

      const doc = await UserModel.create({
        name: input.name.trim(),
        email: input.email.toLowerCase(),
        password_hash: null,
        auth_methods: [input.method],
        role: 'reader',
        subscription: {
          status: 'none',
          plan: 'free',
        },
      });
      return toMongoUser(doc.toObject() as unknown as Record<string, unknown>);
    }
    const result = await proxyJson<{ user: User }>('/api/internal/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'findOrCreateAuthUser', ...input }),
    });
    return result.user;
  },

  async activatePremium(userId: string, plan: 'monthly' | 'annual', opts?: { paymentRef?: string | null; effectiveAt?: Date }) {
    if (env.DATABASE_URL) {
      return pgActivatePremium(userId, plan, opts);
    }
    if (isMongoConfigured()) {
      await connectDB();
      const effectiveAt = opts?.effectiveAt ?? new Date();
      const expiresAt = new Date(effectiveAt);
      expiresAt.setMonth(expiresAt.getMonth() + (plan === 'annual' ? 12 : 1));
      const doc = await UserModel.findByIdAndUpdate(
        userId,
        {
          role: 'premium',
          subscription: {
            status: 'active',
            plan,
            started_at: effectiveAt,
            expires_at: expiresAt,
            payment_ref: opts?.paymentRef ?? null,
          },
        },
        { new: true }
      ).lean();
      return doc ? toMongoUser(doc as unknown as Record<string, unknown>) : null;
    }
    const result = await proxyJson<{ user: User | null }>('/api/internal/users', {
      method: 'POST',
      body: JSON.stringify({
        action: 'activatePremium',
        userId,
        plan,
        paymentRef: opts?.paymentRef ?? null,
        effectiveAt: opts?.effectiveAt?.toISOString() ?? null,
      }),
    });
    return result.user;
  },

  async setStripeCustomerId(userId: string, customerId: string) {
    if (env.DATABASE_URL) {
      await pgSetStripeCustomerId(userId, customerId);
      return;
    }
    if (isMongoConfigured()) {
      await connectDB();
      await UserModel.updateOne({ _id: userId }, { $set: { stripe_customer_id: customerId } });
      return;
    }
    await proxyJson<{ ok: true }>('/api/internal/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'setStripeCustomerId', userId, customerId }),
    });
  },

  async getByStripeCustomerId(customerId: string) {
    if (env.DATABASE_URL) {
      return pgGetByStripeCustomerId(customerId);
    }
    if (isMongoConfigured()) {
      await connectDB();
      const doc = await UserModel.findOne({ stripe_customer_id: customerId }).lean();
      return doc ? toMongoUser(doc as unknown as Record<string, unknown>) : null;
    }
    const query = new URLSearchParams({ customerId }).toString();
    const result = await proxyJson<{ user: User | null }>(`/api/internal/users?${query}`);
    return result.user;
  },

  async syncStripeSubscription(customerId: string, opts: {
    stripeSubscriptionId: string;
    status: 'active' | 'expired' | 'cancelled' | 'none';
    plan: 'monthly' | 'annual';
    expiresAt: Date | null;
  }) {
    if (env.DATABASE_URL) {
      await pgSyncStripeSubscription(customerId, opts);
      return;
    }
    if (isMongoConfigured()) {
      await connectDB();
      await UserModel.updateOne(
        { stripe_customer_id: customerId },
        {
          $set: {
            'subscription.stripe_subscription_id': opts.stripeSubscriptionId,
            'subscription.status': opts.status,
            'subscription.plan': opts.plan,
            'subscription.expires_at': opts.expiresAt,
            role: opts.status === 'active' ? 'premium' : 'reader',
          },
        }
      );
      return;
    }
    await proxyJson<{ ok: true }>('/api/internal/users', {
      method: 'POST',
      body: JSON.stringify({
        action: 'syncStripeSubscription',
        customerId,
        stripeSubscriptionId: opts.stripeSubscriptionId,
        status: opts.status,
        plan: opts.plan,
        expiresAt: opts.expiresAt?.toISOString() ?? null,
      }),
    });
  },

  async expireStaleSubscriptions() {
    if (env.DATABASE_URL) {
      await pgExpireStaleSubscriptions();
      return;
    }
    if (isMongoConfigured()) {
      await connectDB();
      await UserModel.updateMany(
        {
          'subscription.status': 'active',
          'subscription.expires_at': { $lte: new Date() },
        },
        {
          $set: {
            'subscription.status': 'expired',
            role: 'reader',
          },
        }
      );
      return;
    }
    await proxyJson<{ ok: true }>('/api/internal/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'expireStaleSubscriptions' }),
    });
  },
};
