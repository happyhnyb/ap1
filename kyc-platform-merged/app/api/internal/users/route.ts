import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  activatePremium,
  createUser,
  ensureRoleSeeds,
  expireStaleSubscriptions,
  findOrCreateAuthUser,
  getByStripeCustomerId,
  getUserByEmail,
  listUsers,
  loginUser,
  setStripeCustomerId,
  syncStripeSubscription,
  updateUserPassword,
  upsertUserWithPassword,
} from '@/lib/db/repositories/users';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';

const BodySchema = z.object({
  action: z.enum([
    'login',
    'register',
    'findOrCreateAuthUser',
    'updatePassword',
    'upsertPrivilegedUser',
    'activatePremium',
    'setStripeCustomerId',
    'syncStripeSubscription',
    'expireStaleSubscriptions',
  ]),
  email: z.string().email().optional(),
  password: z.string().optional(),
  name: z.string().optional(),
  method: z.enum(['email', 'google']).optional(),
  role: z.enum(['user', 'editor', 'admin']).optional(),
  userId: z.string().optional(),
  plan: z.enum(['monthly', 'annual']).optional(),
  paymentRef: z.string().nullable().optional(),
  effectiveAt: z.string().nullable().optional(),
  customerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  status: z.enum(['active', 'expired', 'cancelled', 'none']).optional(),
  expiresAt: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  await ensureRoleSeeds();
  const email = req.nextUrl.searchParams.get('email');
  const customerId = req.nextUrl.searchParams.get('customerId');

  if (email) {
    const user = await getUserByEmail(email);
    return NextResponse.json({ user });
  }
  if (customerId) {
    const user = await getByStripeCustomerId(customerId);
    return NextResponse.json({ user });
  }

  const users = await listUsers();
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  await ensureRoleSeeds();
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid internal users request.' }, { status: 400 });
  }

  const body = parsed.data;

  switch (body.action) {
    case 'login': {
      const user = await loginUser(body.email ?? '', body.password ?? '');
      return NextResponse.json({ user });
    }
    case 'register': {
      if (!body.name || !body.email || !body.password) {
        return NextResponse.json({ error: 'Missing registration fields.' }, { status: 400 });
      }
      const user = await createUser({ name: body.name, email: body.email, password: body.password });
      return NextResponse.json({ user });
    }
    case 'findOrCreateAuthUser': {
      if (!body.name || !body.email || !body.method) {
        return NextResponse.json({ error: 'Missing auth user fields.' }, { status: 400 });
      }
      const user = await findOrCreateAuthUser({ name: body.name, email: body.email, method: body.method });
      return NextResponse.json({ user });
    }
    case 'updatePassword': {
      if (!body.userId || !body.password) {
        return NextResponse.json({ error: 'Missing password reset fields.' }, { status: 400 });
      }
      const user = await updateUserPassword(body.userId, body.password);
      return NextResponse.json({ user });
    }
    case 'upsertPrivilegedUser': {
      if (!body.name || !body.email || !body.password || !body.role || !['editor', 'admin'].includes(body.role)) {
        return NextResponse.json({ error: 'Missing privileged user fields.' }, { status: 400 });
      }
      const user = await upsertUserWithPassword({
        name: body.name,
        email: body.email,
        password: body.password,
        role: body.role,
      });
      return NextResponse.json({ user });
    }
    case 'activatePremium': {
      if (!body.userId || !body.plan) {
        return NextResponse.json({ error: 'Missing subscription fields.' }, { status: 400 });
      }
      const user = await activatePremium(body.userId, body.plan, {
        paymentRef: body.paymentRef ?? null,
        effectiveAt: body.effectiveAt ? new Date(body.effectiveAt) : undefined,
      });
      return NextResponse.json({ user });
    }
    case 'setStripeCustomerId': {
      if (!body.userId || !body.customerId) {
        return NextResponse.json({ error: 'Missing Stripe customer fields.' }, { status: 400 });
      }
      await setStripeCustomerId(body.userId, body.customerId);
      return NextResponse.json({ ok: true });
    }
    case 'syncStripeSubscription': {
      if (!body.customerId || !body.stripeSubscriptionId || !body.status || !body.plan) {
        return NextResponse.json({ error: 'Missing Stripe subscription fields.' }, { status: 400 });
      }
      await syncStripeSubscription(body.customerId, {
        stripeSubscriptionId: body.stripeSubscriptionId,
        status: body.status,
        plan: body.plan,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      });
      return NextResponse.json({ ok: true });
    }
    case 'expireStaleSubscriptions': {
      await expireStaleSubscriptions();
      return NextResponse.json({ ok: true });
    }
  }
}
