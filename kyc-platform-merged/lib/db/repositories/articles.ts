import { createId } from '@/lib/db/ids';
import { pgQuery, withPgTransaction } from '@/lib/db/pg';
import { generateSlug } from '@/lib/utils';
import type { Post } from '@/types/post';

type ArticleRow = {
  id: string;
  type: Post['type'];
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  author_id: string;
  author_name: string;
  tags: string[];
  categories: string[];
  hero_image: string | null;
  is_premium: boolean;
  linked_article_id: string | null;
  linked_article_slug: string | null;
  status: Post['status'];
  summary: string | null;
  seo_title: string | null;
  seo_description: string | null;
  source_url: string | null;
  source_label: string | null;
  source_metadata: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  view_count: number;
};

export interface ArticleInput {
  title: string;
  excerpt: string;
  body: string;
  category: string;
  type: Post['type'];
  tags: string[];
  is_premium: boolean;
  linked_article_id?: string | null;
  hero_image?: string | null;
  author: string;
  author_id: string;
  status?: Post['status'];
  summary?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  source_url?: string | null;
  source_label?: string | null;
  source_metadata?: Record<string, unknown> | null;
}

function normalizeTagName(tag: string) {
  return tag.trim();
}

async function generateUniqueArticleSlug(title: string, excludeArticleId?: string) {
  const baseSlug = generateSlug(title);
  let candidate = baseSlug;
  let suffix = 2;

  for (;;) {
    const values: unknown[] = [candidate];
    let sql = 'SELECT id FROM articles WHERE slug = $1';
    if (excludeArticleId) {
      values.push(excludeArticleId);
      sql += ` AND id <> $${values.length}`;
    }
    sql += ' LIMIT 1';

    const existing = await pgQuery<{ id: string }>(sql, values);
    if (!existing.rows[0]) return candidate;

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

function toPost(row: ArticleRow): Post {
  return {
    _id: row.id,
    type: row.type,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    body: row.body,
    author: row.author_name,
    author_id: row.author_id,
    tags: row.tags ?? [],
    category: row.categories?.[0] ?? 'General',
    is_premium: row.is_premium,
    linked_article_id: row.linked_article_slug ?? row.linked_article_id,
    status: row.status,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    view_count: row.view_count,
    img: 'crops',
    hero_image: row.hero_image,
    inline_images: [],
  };
}

async function ensureCategory(name: string) {
  const trimmed = name.trim();
  const slug = generateSlug(trimmed);
  const existing = await pgQuery<{ id: string }>('SELECT id FROM article_categories WHERE slug = $1 LIMIT 1', [slug]);
  if (existing.rows[0]) return existing.rows[0].id;
  const id = createId('cat');
  await pgQuery('INSERT INTO article_categories (id, slug, name) VALUES ($1, $2, $3)', [id, slug, trimmed]);
  return id;
}

async function ensureTag(name: string) {
  const trimmed = normalizeTagName(name);
  const slug = generateSlug(trimmed);
  const existing = await pgQuery<{ id: string }>('SELECT id FROM article_tags WHERE slug = $1 LIMIT 1', [slug]);
  if (existing.rows[0]) return existing.rows[0].id;
  const id = createId('tag');
  await pgQuery('INSERT INTO article_tags (id, slug, name) VALUES ($1, $2, $3)', [id, slug, trimmed]);
  return id;
}

async function syncArticleTaxonomy(articleId: string, categoryName: string, tags: string[]) {
  const categoryId = await ensureCategory(categoryName);
  await pgQuery('DELETE FROM article_category_links WHERE article_id = $1', [articleId]);
  await pgQuery('INSERT INTO article_category_links (article_id, category_id) VALUES ($1, $2)', [articleId, categoryId]);

  await pgQuery('DELETE FROM article_tag_links WHERE article_id = $1', [articleId]);
  for (const tag of tags.filter(Boolean)) {
    const tagId = await ensureTag(tag);
    await pgQuery(
      'INSERT INTO article_tag_links (article_id, tag_id) VALUES ($1, $2) ON CONFLICT (article_id, tag_id) DO NOTHING',
      [articleId, tagId]
    );
  }
}

async function resolveLinkedArticleReference(reference?: string | null) {
  const trimmed = reference?.trim();
  if (!trimmed) return null;

  const byId = await pgQuery<{ id: string }>('SELECT id FROM articles WHERE id = $1 LIMIT 1', [trimmed]);
  if (byId.rows[0]) return byId.rows[0].id;

  const bySlug = await pgQuery<{ id: string }>('SELECT id FROM articles WHERE slug = $1 LIMIT 1', [trimmed]);
  if (bySlug.rows[0]) return bySlug.rows[0].id;

  throw new Error(`Linked article "${trimmed}" was not found. Use an existing article slug or ID.`);
}

async function fetchArticles(whereSql = 'TRUE', values: unknown[] = [], limitSql = '') {
  const result = await pgQuery<ArticleRow>(
    `
      SELECT
        a.id,
        a.type,
        a.title,
        a.slug,
        a.excerpt,
        a.body,
        a.author_id,
        u.name AS author_name,
        COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT t.name), NULL), ARRAY[]::TEXT[]) AS tags,
        COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.name), NULL), ARRAY[]::TEXT[]) AS categories,
        a.hero_image,
        a.is_premium,
        a.linked_article_id,
        linked.slug AS linked_article_slug,
        a.status,
        a.summary,
        a.seo_title,
        a.seo_description,
        a.source_url,
        a.source_label,
        a.source_metadata,
        a.published_at,
        a.created_at,
        a.updated_at,
        a.view_count
      FROM articles a
      JOIN app_users u ON u.id = a.author_id
      LEFT JOIN articles linked ON linked.id = a.linked_article_id
      LEFT JOIN article_tag_links atl ON atl.article_id = a.id
      LEFT JOIN article_tags t ON t.id = atl.tag_id
      LEFT JOIN article_category_links acl ON acl.article_id = a.id
      LEFT JOIN article_categories c ON c.id = acl.category_id
      WHERE ${whereSql}
      GROUP BY a.id, u.name, linked.slug
      ORDER BY COALESCE(a.published_at, a.created_at) DESC
      ${limitSql}
    `,
    values
  );

  return result.rows.map(toPost);
}

export async function listPublishedArticles() {
  return fetchArticles(`a.status = 'published'`);
}

export async function listPublishedArticlesPaged(page: number, limit: number, type?: string) {
  const offset = (page - 1) * limit;
  const filters = [`a.status = 'published'`];
  const values: unknown[] = [];
  if (type) {
    values.push(type);
    filters.push(`a.type = $${values.length}`);
  }
  const posts = await fetchArticles(filters.join(' AND '), values, `LIMIT ${limit} OFFSET ${offset}`);
  const totalResult = await pgQuery<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM articles a WHERE ${filters.join(' AND ')}`,
    values
  );
  return { posts, total: Number(totalResult.rows[0]?.count ?? '0') };
}

export async function listAllArticles() {
  return fetchArticles();
}

export async function getArticleBySlug(slug: string) {
  const rows = await fetchArticles('a.slug = $1', [slug], 'LIMIT 1');
  return rows[0] ?? null;
}

export async function searchArticles(query: string) {
  const term = `%${query.toLowerCase()}%`;
  return fetchArticles(
    `a.status = 'published' AND (LOWER(a.title) LIKE $1 OR LOWER(a.excerpt) LIKE $1)`,
    [term],
    'LIMIT 30'
  );
}

export async function incrementArticleViews(slug: string) {
  await pgQuery('UPDATE articles SET view_count = view_count + 1, updated_at = NOW() WHERE slug = $1', [slug]);
}

export async function createArticle(input: ArticleInput) {
  const id = createId('art');
  const slug = await generateUniqueArticleSlug(input.title);
  const status = input.status ?? 'draft';
  const publishedAt = status === 'published' ? new Date().toISOString() : null;
  const linkedArticleId = await resolveLinkedArticleReference(input.linked_article_id);

  await withPgTransaction(async (client) => {
    await client.query(
      `INSERT INTO articles (
        id, type, title, slug, excerpt, body, author_id, hero_image, is_premium,
        linked_article_id, status, summary, seo_title, seo_description, source_url,
        source_label, source_metadata, published_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15,
        $16, $17, $18
      )`,
      [
        id,
        input.type,
        input.title,
        slug,
        input.excerpt,
        input.body,
        input.author_id,
        input.hero_image ?? null,
        input.is_premium,
        linkedArticleId,
        status,
        input.summary ?? null,
        input.seo_title ?? null,
        input.seo_description ?? null,
        input.source_url ?? null,
        input.source_label ?? null,
        input.source_metadata ?? {},
        publishedAt,
      ]
    );
  });

  await syncArticleTaxonomy(id, input.category, input.tags);
  return getArticleBySlug(slug);
}

export async function updateArticleBySlug(slug: string, patch: Partial<ArticleInput> & { status?: Post['status'] }) {
  const existing = await pgQuery<{ id: string }>('SELECT id FROM articles WHERE slug = $1 LIMIT 1', [slug]);
  if (!existing.rows[0]) return null;
  const articleId = existing.rows[0].id;
  const nextSlug = patch.title !== undefined ? await generateUniqueArticleSlug(patch.title, articleId) : slug;

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  if (patch.title !== undefined) {
    set('title', patch.title);
    set('slug', nextSlug);
  }
  if (patch.excerpt !== undefined) set('excerpt', patch.excerpt);
  if (patch.body !== undefined) set('body', patch.body);
  if (patch.hero_image !== undefined) set('hero_image', patch.hero_image);
  if (patch.is_premium !== undefined) set('is_premium', patch.is_premium);
  if (patch.linked_article_id !== undefined) {
    set('linked_article_id', await resolveLinkedArticleReference(patch.linked_article_id));
  }
  if (patch.status !== undefined) {
    set('status', patch.status);
    if (patch.status === 'published') set('published_at', new Date().toISOString());
  }
  if (patch.summary !== undefined) set('summary', patch.summary);
  if (patch.seo_title !== undefined) set('seo_title', patch.seo_title);
  if (patch.seo_description !== undefined) set('seo_description', patch.seo_description);
  if (patch.source_url !== undefined) set('source_url', patch.source_url);
  if (patch.source_label !== undefined) set('source_label', patch.source_label);
  if (patch.source_metadata !== undefined) set('source_metadata', patch.source_metadata);
  set('updated_at', new Date().toISOString());

  if (fields.length) {
    values.push(slug);
    await pgQuery(`UPDATE articles SET ${fields.join(', ')} WHERE slug = $${values.length}`, values);
  }

  if (patch.category || patch.tags) {
    const current = await getArticleBySlug(nextSlug);
    if (current) {
      await syncArticleTaxonomy(articleId, patch.category ?? current.category, patch.tags ?? current.tags);
    }
  }

  return getArticleBySlug(nextSlug);
}

export async function deleteArticleById(id: string) {
  await pgQuery('DELETE FROM articles WHERE id = $1', [id]);
}

export async function publishArticleById(id: string) {
  await pgQuery(
    `UPDATE articles
     SET status = 'published', published_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [id]
  );
  const result = await pgQuery<{ slug: string }>('SELECT slug FROM articles WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] ? getArticleBySlug(result.rows[0].slug) : null;
}
