import type { User } from '@/types/user';
import { INITIAL_USERS } from '@/mocks/data';
import { isMongoConfigured, connectDB } from '@/lib/db/connect';
import { UserModel } from '@/lib/db/models/User';
import bcrypt from 'bcryptjs';

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
    const ok = await bcrypt.compare(password, doc.password_hash);
    return ok ? toUser(doc as unknown as Record<string, unknown>) : null;
  },
  async register(input: { name: string; email: string; password: string }) {
    await connectDB();
    const hash = await bcrypt.hash(input.password, 12);
    const doc = await UserModel.create({
      name: input.name,
      email: input.email.toLowerCase(),
      password_hash: hash,
      auth_methods: ['email'],
      role: 'reader',
      subscription: { status: 'none', plan: 'free', expires_at: null },
    });
    return toUser(doc.toObject() as unknown as Record<string, unknown>);
  },
  async activatePremium(userId: string, plan: 'monthly' | 'annual') {
    await connectDB();
    const months = plan === 'annual' ? 12 : 1;
    const expires = new Date();
    expires.setMonth(expires.getMonth() + months);
    await UserModel.findByIdAndUpdate(userId, {
      role: 'premium',
      'subscription.status': 'active',
      'subscription.plan': plan,
      'subscription.started_at': new Date(),
      'subscription.expires_at': expires,
    });
  },
};

// ── In-memory fallback ───────────────────────────────────────────
let memoryUsers: User[] = [...INITIAL_USERS];

const memory = {
  async list() { return [...memoryUsers]; },
  async getByEmail(email: string) {
    return memoryUsers.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  },
  async login(email: string, password: string) {
    const user = memoryUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return null;
    if (user.password_hash === password) return user;  // plaintext seed data
    const ok = await bcrypt.compare(password, user.password_hash);
    return ok ? user : null;
  },
  async register(input: { name: string; email: string; password: string }) {
    const hash = await bcrypt.hash(input.password, 12);
    const now = new Date().toISOString();
    const user: User = {
      _id: `u${Date.now()}`,
      name: input.name,
      email: input.email.toLowerCase(),
      mobile: null,
      password_hash: hash,
      auth_methods: ['email'],
      role: 'reader',
      subscription: { status: 'none', plan: 'free', expires_at: null },
      created_at: now,
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
      role: 'premium',
      subscription: { status: 'active', plan, expires_at: expires.toISOString().slice(0, 10) },
    } as User);
  },
};

export const usersAdapter = isMongoConfigured() ? mongo : memory;
