import 'server-only';

import type { ContactSubmission } from '@/types/post';
import { env } from '@/lib/env';
import { connectDB, isMongoConfigured } from '@/lib/db/connect';
import { ContactModel } from '@/lib/db/models/Contact';
import { createContact, listContacts } from '@/lib/db/repositories/contacts';

function getBackendBaseUrl() {
  return env.MAC_MINI_API_BASE_URL.replace(/\/$/, '');
}

async function proxyJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    throw new Error('No local database or Mac Mini backend is configured.');
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
    throw new Error(payload?.error || `Mac Mini contact request failed (${res.status}).`);
  }
  return payload as T;
}

function toContact(doc: Record<string, unknown>): ContactSubmission {
  const status = (doc.status as 'new' | 'read' | 'resolved') ?? 'new';
  return {
    _id: String(doc._id),
    name: doc.name as string,
    email: doc.email as string,
    subject: doc.subject as string,
    message: doc.message as string,
    submitted_at: new Date(doc.submitted_at as string).toISOString(),
    status: status === 'resolved' ? 'read' : status,
    ref: doc.ref as string,
  };
}

export const contactsAdapter = {
  async list(): Promise<ContactSubmission[]> {
    if (env.DATABASE_URL) return listContacts();
    if (isMongoConfigured()) {
      await connectDB();
      const docs = await ContactModel.find().sort({ submitted_at: -1 }).lean();
      return docs.map((doc) => toContact(doc as unknown as Record<string, unknown>));
    }
    return proxyJson<ContactSubmission[]>('/api/internal/contacts');
  },

  async create(input: { name: string; email: string; subject: string; message: string }) {
    if (env.DATABASE_URL) return createContact(input);
    if (isMongoConfigured()) {
      await connectDB();
      const doc = await ContactModel.create({
        ...input,
        ref: `KYC-${Date.now().toString(36).toUpperCase()}`,
        status: 'new',
        submitted_at: new Date(),
      });
      return toContact(doc.toObject() as unknown as Record<string, unknown>);
    }
    const result = await proxyJson<{ ref: string; ok: boolean }>('/api/contact', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return {
      _id: '',
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
      submitted_at: new Date().toISOString(),
      status: 'new',
      ref: result.ref,
    };
  },
};
