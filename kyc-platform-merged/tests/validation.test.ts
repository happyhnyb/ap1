import { describe, it, expect } from 'vitest';
import {
  LoginSchema,
  RegisterSchema,
  ContactSchema,
  CreatePostSchema,
  PatchPostSchema,
  PredictorFilterSchema,
  parseQuery,
} from '../lib/validation';

describe('LoginSchema', () => {
  it('accepts valid credentials', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com', password: 'secret' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = LoginSchema.safeParse({ email: 'not-an-email', password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('rejects password over 128 chars', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com', password: 'a'.repeat(129) });
    expect(result.success).toBe(false);
  });
});

describe('RegisterSchema', () => {
  it('accepts a valid registration', () => {
    const result = RegisterSchema.safeParse({ name: 'Alice', email: 'alice@example.com', password: 'Secure123' });
    expect(result.success).toBe(true);
  });

  it('rejects name shorter than 2 chars', () => {
    const result = RegisterSchema.safeParse({ name: 'A', email: 'a@b.com', password: 'Secure123' });
    expect(result.success).toBe(false);
  });

  it('rejects password without uppercase', () => {
    const result = RegisterSchema.safeParse({ name: 'Alice', email: 'alice@b.com', password: 'secure123' });
    expect(result.success).toBe(false);
  });

  it('rejects password without number', () => {
    const result = RegisterSchema.safeParse({ name: 'Alice', email: 'alice@b.com', password: 'SecurePass' });
    expect(result.success).toBe(false);
  });

  it('lowercases email', () => {
    const result = RegisterSchema.safeParse({ name: 'Alice', email: 'ALICE@EXAMPLE.COM', password: 'Secure123' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('alice@example.com');
  });
});

describe('ContactSchema', () => {
  it('accepts valid contact data', () => {
    const result = ContactSchema.safeParse({
      name: 'Bob', email: 'bob@b.com', subject: 'Hello there', message: 'This is a test message.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects message shorter than 10 chars', () => {
    const result = ContactSchema.safeParse({ name: 'Bob', email: 'b@b.com', subject: 'Sub', message: 'Short' });
    expect(result.success).toBe(false);
  });

  it('rejects message longer than 2000 chars', () => {
    const result = ContactSchema.safeParse({
      name: 'Bob', email: 'b@b.com', subject: 'Subject here', message: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

describe('CreatePostSchema', () => {
  const base = {
    title: 'Some valid title here', excerpt: 'A meaningful excerpt here.',
    body: 'Body text that is at least twenty chars long.',
    category: 'news', type: 'ARTICLE' as const,
  };

  it('accepts valid post', () => {
    expect(CreatePostSchema.safeParse(base).success).toBe(true);
  });

  it('applies default status = draft', () => {
    const r = CreatePostSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe('draft');
  });

  it('rejects title shorter than 5 chars', () => {
    expect(CreatePostSchema.safeParse({ ...base, title: 'Hi' }).success).toBe(false);
  });

  it('rejects SHORT body over 1000 chars', () => {
    const r = CreatePostSchema.safeParse({ ...base, type: 'SHORT', body: 'a'.repeat(1001) });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issues = r.error.issues ?? (r.error as any).errors ?? [];
      expect(issues[0]?.path).toContain('body');
    }
  });

  it('rejects STORY body over 3000 chars', () => {
    const r = CreatePostSchema.safeParse({ ...base, type: 'STORY', body: 'a'.repeat(3001) });
    expect(r.success).toBe(false);
  });

  it('accepts ARTICLE body up to 10000 chars', () => {
    const r = CreatePostSchema.safeParse({ ...base, type: 'ARTICLE', body: 'a'.repeat(10000) });
    expect(r.success).toBe(true);
  });

  it('rejects ARTICLE body over 10000 chars', () => {
    const r = CreatePostSchema.safeParse({ ...base, type: 'ARTICLE', body: 'a'.repeat(10001) });
    expect(r.success).toBe(false);
  });

  it('rejects invalid type', () => {
    expect(CreatePostSchema.safeParse({ ...base, type: 'INVALID' }).success).toBe(false);
  });
});

describe('PatchPostSchema', () => {
  it('accepts partial update', () => {
    const r = PatchPostSchema.safeParse({ title: 'New title here!' });
    expect(r.success).toBe(true);
  });

  it('accepts empty object', () => {
    expect(PatchPostSchema.safeParse({}).success).toBe(true);
  });
});

describe('PredictorFilterSchema', () => {
  it('applies defaults', () => {
    const r = PredictorFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.days).toBe(30);
      expect(r.data.horizon).toBe(14);
    }
  });

  it('coerces string days to number', () => {
    const r = PredictorFilterSchema.safeParse({ days: '60' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.days).toBe(60);
  });

  it('rejects days > 90', () => {
    expect(PredictorFilterSchema.safeParse({ days: '91' }).success).toBe(false);
  });

  it('rejects horizon > 30', () => {
    expect(PredictorFilterSchema.safeParse({ horizon: '31' }).success).toBe(false);
  });
});

describe('parseQuery helper', () => {
  it('returns data on success', () => {
    const r = parseQuery(LoginSchema, { email: 'x@y.com', password: 'pass' });
    expect('data' in r).toBe(true);
  });

  it('returns error on failure', () => {
    const r = parseQuery(LoginSchema, { email: 'bad', password: '' });
    expect('error' in r).toBe(true);
  });
});
