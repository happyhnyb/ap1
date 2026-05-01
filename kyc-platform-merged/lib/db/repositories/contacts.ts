import { createId } from '@/lib/db/ids';
import { pgQuery } from '@/lib/db/pg';
import type { ContactSubmission } from '@/types/post';

type ContactRow = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'new' | 'read';
  ref: string;
  created_at: string;
};

function toContact(row: ContactRow): ContactSubmission {
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    status: row.status,
    ref: row.ref,
    submitted_at: row.created_at,
  };
}

export async function listContacts() {
  const result = await pgQuery<ContactRow>('SELECT * FROM contact_submissions ORDER BY created_at DESC');
  return result.rows.map(toContact);
}

export async function createContact(input: { name: string; email: string; subject: string; message: string }) {
  const id = createId('ctc');
  const ref = `KYC-${Date.now().toString(36).toUpperCase()}`;
  const result = await pgQuery<ContactRow>(
    `INSERT INTO contact_submissions (id, name, email, subject, message, ref)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, input.name.trim(), input.email.trim().toLowerCase(), input.subject.trim(), input.message.trim(), ref]
  );
  return toContact(result.rows[0]);
}
