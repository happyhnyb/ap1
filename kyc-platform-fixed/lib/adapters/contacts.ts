import { INITIAL_CONTACTS } from '@/mocks/data';
import type { ContactSubmission } from '@/types/post';
import { generateId, sanitize } from '@/lib/utils';
import { isMongoConfigured, connectDB } from '@/lib/db/connect';
import { ContactModel } from '@/lib/db/models/Contact';

function toContact(doc: Record<string, unknown>): ContactSubmission {
  return {
    _id:          String(doc._id),
    name:         doc.name as string,
    email:        doc.email as string,
    subject:      doc.subject as string,
    message:      doc.message as string,
    submitted_at: new Date(doc.submitted_at as string).toISOString(),
    status:       (doc.status as ContactSubmission['status']) ?? 'new',
    ref:          doc.ref as string,
  };
}

const mongo = {
  async list() {
    await connectDB();
    const docs = await ContactModel.find().sort({ submitted_at: -1 }).lean();
    return docs.map((d) => toContact(d as unknown as Record<string, unknown>));
  },
  async create(input: { name: string; email: string; subject: string; message: string }) {
    await connectDB();
    const ref = `KYC-${Date.now().toString(36).toUpperCase()}`;
    const doc = await ContactModel.create({
      name:         sanitize(input.name),
      email:        sanitize(input.email),
      subject:      sanitize(input.subject),
      message:      sanitize(input.message),
      submitted_at: new Date(),
      status:       'new',
      ref,
    });
    return toContact(doc.toObject() as unknown as Record<string, unknown>);
  },
};

let memoryContacts: ContactSubmission[] = [...INITIAL_CONTACTS];

const memory = {
  async list() {
    return [...memoryContacts].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  },
  async create(input: { name: string; email: string; subject: string; message: string }) {
    const ref = `KYC-${Date.now().toString(36).toUpperCase()}`;
    const entry: ContactSubmission = {
      _id: generateId('c'),
      name: sanitize(input.name),
      email: sanitize(input.email),
      subject: sanitize(input.subject),
      message: sanitize(input.message),
      submitted_at: new Date().toISOString(),
      status: 'new',
      ref,
    };
    memoryContacts = [entry, ...memoryContacts];
    return entry;
  },
};

export const contactsAdapter = isMongoConfigured() ? mongo : memory;
