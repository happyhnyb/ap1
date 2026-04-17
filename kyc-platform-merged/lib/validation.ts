/**
 * Zod validation schemas for all write/sensitive endpoints.
 * Centralising them here ensures consistency and makes them testable.
 */
import { z } from 'zod';

// ── Auth ─────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email:    z.string().email('Invalid email address').max(254),
  password: z.string().min(1, 'Password is required').max(128),
});

export const RegisterSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters').max(80).trim(),
  email:    z.string().email('Invalid email address').max(254).toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

// ── Contact form ─────────────────────────────────────────────────

export const ContactSchema = z.object({
  name:    z.string().min(2).max(80).trim(),
  email:   z.string().email().max(254),
  subject: z.string().min(4).max(120).trim(),
  message: z.string().min(10).max(2000).trim(),
});

// ── Posts ────────────────────────────────────────────────────────

const PostTypeEnum = z.enum(['SHORT', 'STORY', 'ARTICLE']);
const PostStatusEnum = z.enum(['draft', 'published', 'archived']);

const CHAR_LIMITS = { SHORT: 1000, STORY: 3000, ARTICLE: 10000 } as const;

const _PostBaseSchema = z.object({
  title:             z.string().min(5).max(200).trim(),
  excerpt:           z.string().min(10).max(500).trim(),
  body:              z.string().min(20),
  category:          z.string().min(1).max(60),
  type:              PostTypeEnum,
  tags:              z.array(z.string().max(40)).max(10).default([]),
  is_premium:        z.boolean().default(false),
  linked_article_id: z.string().max(120).nullable().optional(),
  status:            PostStatusEnum.optional().default('draft'),
});

function addBodyLimitRefinement<T extends typeof _PostBaseSchema>(schema: T) {
  return schema.superRefine((data, ctx) => {
    if (!data.type || !data.body) return;
    const limit = CHAR_LIMITS[data.type as keyof typeof CHAR_LIMITS];
    if (limit && data.body.length > limit) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: limit,
        origin: 'string',
        inclusive: true,
        message: `${data.type} body cannot exceed ${limit} characters (got ${data.body.length}).`,
        path: ['body'],
      });
    }
  });
}

export const CreatePostSchema = addBodyLimitRefinement(_PostBaseSchema);

// Partial schema for PATCH — apply same body-limit check only when both type + body are present
export const PatchPostSchema = addBodyLimitRefinement(_PostBaseSchema.partial() as unknown as typeof _PostBaseSchema);

// ── Search ───────────────────────────────────────────────────────

export const SearchQuerySchema = z.object({
  q:       z.string().min(1).max(200).trim(),
  type:    z.enum(['SHORT', 'STORY', 'ARTICLE', '']).optional(),
  premium: z.enum(['true', 'false', '']).optional(),
  from:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  to:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

// ── Predictor filter params ───────────────────────────────────────

export const PredictorFilterSchema = z.object({
  commodity: z.string().max(80).optional().default(''),
  state:     z.string().max(80).optional().default(''),
  district:  z.string().max(80).optional().default(''),
  market:    z.string().max(80).optional().default(''),
  days:      z.coerce.number().int().min(1).max(90).optional().default(30),
  horizon:   z.coerce.number().int().min(3).max(30).optional().default(14),
  insights:  z.enum(['true', 'false']).optional().default('true'),
});

// ── Helpers ──────────────────────────────────────────────────────

/** Parse + validate a URLSearchParams against a schema, returning typed data or a 400 error body. */
export function parseQuery<T extends z.ZodTypeAny>(
  schema: T,
  params: Record<string, string | undefined>
): { data: z.infer<T> } | { error: string } {
  const result = schema.safeParse(params);
  if (!result.success) {
    const issues = result.error.issues ?? (result.error as unknown as { errors?: z.ZodIssue[] }).errors ?? [];
    const first = issues[0];
    return { error: first ? `${first.path.join('.')}: ${first.message}` : 'Invalid query parameters.' };
  }
  return { data: result.data };
}

/** Parse + validate a JSON body, returning typed data or a 400 error body. */
export async function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  req: Request
): Promise<{ data: z.infer<T> } | { error: string }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: 'Request body must be valid JSON.' };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues ?? (result.error as unknown as { errors?: z.ZodIssue[] }).errors ?? [];
    const first = issues[0];
    return { error: first ? `${first.path.join('.')}: ${first.message}` : 'Validation failed.' };
  }
  return { data: result.data };
}
