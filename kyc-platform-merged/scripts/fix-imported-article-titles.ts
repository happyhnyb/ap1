import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not configured.');
  process.exit(1);
}

type Row = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
};

const pool = new Pool({ connectionString: DATABASE_URL, ssl: false });

function generateSlug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function stripDecorators(value: string) {
  return value
    .replace(/^[_*`~\s]+|[_*`~\s]+$/g, '')
    .replace(/^[^\p{L}\p{N}"']+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksBrokenTitle(title: string) {
  return /^IMG-.*\.(jpg|jpeg|png|webp)$/i.test(title) || title.length > 180;
}

function extractParagraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function deriveTitleFromBody(body: string, fallbackExcerpt: string) {
  const paragraphs = extractParagraphs(body);
  const candidate = stripDecorators(paragraphs[0] || fallbackExcerpt);
  if (!candidate) return null;

  const sentenceMatch = candidate.match(/^(.{8,180}?(?:\?\?|\?!|!!|\?|!|\.))(?:\s|$)/);
  if (sentenceMatch) return sentenceMatch[1].trim();
  if (candidate.length <= 180) return candidate;

  const softBoundary = candidate.match(/^(.{20,180}?)(?:\s[-:]\s|\s{2,}|$)/);
  return (softBoundary?.[1] || candidate.slice(0, 180)).trim();
}

function removeLeadingTitleFromBody(body: string, title: string) {
  const paragraphs = extractParagraphs(body);
  if (!paragraphs.length) return body.trim();

  const first = stripDecorators(paragraphs[0]);
  if (first !== title) return body.trim();

  return paragraphs.slice(1).join('\n\n').trim();
}

function buildExcerpt(body: string) {
  const firstParagraph = extractParagraphs(body).find((part) => !part.startsWith('## ') && !part.startsWith('### ') && !part.startsWith('> '));
  if (!firstParagraph) return 'Imported Trade Talk article.';
  const normalized = stripDecorators(firstParagraph);
  return normalized.length > 260 ? `${normalized.slice(0, 257).trimEnd()}...` : normalized;
}

async function uniqueSlugFor(title: string, currentId: string) {
  const base = generateSlug(title) || `article-${currentId.slice(-8)}`;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await pool.query<{ id: string }>(
      'SELECT id FROM articles WHERE slug = $1 AND id <> $2 LIMIT 1',
      [slug, currentId]
    );
    if (!existing.rows[0]) return slug;
  }

  throw new Error(`Could not find unique slug for ${title}`);
}

async function main() {
  const result = await pool.query<Row>(
    `SELECT id, title, slug, excerpt, body
     FROM articles
     WHERE title ~* '^IMG-.*\\.(jpg|jpeg|png|webp)$'
        OR length(title) > 180
     ORDER BY created_at ASC`
  );

  let fixed = 0;

  for (const row of result.rows) {
    if (!looksBrokenTitle(row.title)) continue;

    const nextTitle = deriveTitleFromBody(row.body, row.excerpt);
    if (!nextTitle) continue;

    const nextBody = removeLeadingTitleFromBody(row.body, nextTitle);
    const nextExcerpt = buildExcerpt(nextBody || row.body);
    const nextSlug = await uniqueSlugFor(nextTitle, row.id);

    await pool.query(
      `UPDATE articles
       SET title = $2,
           slug = $3,
           excerpt = $4,
           body = $5,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, nextTitle, nextSlug, nextExcerpt, nextBody || row.body]
    );

    fixed += 1;
    console.log(`Fixed: ${row.title} -> ${nextTitle}`);
  }

  console.log(`Repaired ${fixed} imported articles.`);
}

main()
  .catch((error) => {
    console.error('Title repair failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
