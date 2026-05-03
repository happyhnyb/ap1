import crypto from 'node:crypto';
import { Pool } from 'pg';
import rawPosts from '../mocks/tradeTalkParsedNew.json';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: false });

const AUTHOR_ID = 'usr_3efc39c32a52d19cc35820c3'; // Dhairya
const AUTHOR_NAME = 'Know Your Commodity';
const CATEGORY = 'Trade';

const TAG_DICTIONARY = [
  'wheat', 'sugar', 'rice', 'corn', 'soybean', 'soybeans', 'cotton', 'oil', 'crude',
  'ethanol', 'silver', 'gold', 'trade', 'exports', 'tariff', 'yuan', 'china',
  'canada', 'europe', 'eu', 'pakistan', 'india', 'usd', 'inr', 'grain', 'fertilizer',
  'energy', 'food', 'agriculture', 'commodity', 'markets', 'rupee', 'dollar', 'inflation',
  'import', 'export', 'pulses', 'canola', 'salt', 'peas', 'lentils', 'chana', 'tur',
  'urad', 'msp', 'msp', 'forex', 'currency', 'rbi', 'opec', 'ukraine', 'russia',
];

function createId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function generateSlug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function buildTags(text: string): string[] {
  const lower = text.toLowerCase();
  return TAG_DICTIONARY.filter((tag) => lower.includes(tag)).slice(0, 8);
}

async function ensureCategory(name: string) {
  const slug = generateSlug(name);
  const existing = await pool.query<{ id: string }>('SELECT id FROM article_categories WHERE slug = $1 LIMIT 1', [slug]);
  if (existing.rows[0]) return existing.rows[0].id;
  const id = createId('cat');
  await pool.query('INSERT INTO article_categories (id, slug, name) VALUES ($1, $2, $3)', [id, slug, name]);
  return id;
}

async function ensureTag(name: string) {
  const slug = generateSlug(name);
  const existing = await pool.query<{ id: string }>('SELECT id FROM article_tags WHERE slug = $1 LIMIT 1', [slug]);
  if (existing.rows[0]) return existing.rows[0].id;
  const id = createId('tag');
  await pool.query('INSERT INTO article_tags (id, slug, name) VALUES ($1, $2, $3)', [id, slug, name]);
  return id;
}

type RawPost = {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  author: string;
  hero_image: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
};

async function upsertPost(post: RawPost) {
  const slug = generateSlug(post.title);
  const tags = buildTags(`${post.title} ${post.body}`);

  // Check if slug already exists
  const existing = await pool.query<{ id: string }>('SELECT id FROM articles WHERE slug = $1 LIMIT 1', [slug]);

  let articleId: string;

  if (existing.rows[0]) {
    articleId = existing.rows[0].id;
    await pool.query(
      `UPDATE articles SET
        title = $1, excerpt = $2, body = $3, hero_image = $4,
        status = 'published', published_at = $5, updated_at = $6
       WHERE id = $7`,
      [post.title, post.excerpt, post.body, post.hero_image, post.published_at, post.updated_at, articleId]
    );
  } else {
    articleId = createId('art');
    await pool.query(
      `INSERT INTO articles (
        id, type, title, slug, excerpt, body, author_id, hero_image,
        is_premium, linked_article_id, status, summary, seo_title,
        seo_description, source_url, source_label, source_metadata,
        published_at, created_at, updated_at, view_count
      ) VALUES (
        $1, 'ARTICLE', $2, $3, $4, $5, $6, $7,
        false, NULL, 'published', NULL, NULL,
        NULL, NULL, 'Know Your Commodity', '{}',
        $8, $9, $10, 0
      )`,
      [
        articleId, post.title, slug, post.excerpt, post.body, AUTHOR_ID, post.hero_image,
        post.published_at, post.created_at, post.updated_at,
      ]
    );
  }

  // Sync taxonomy
  const categoryId = await ensureCategory(CATEGORY);
  await pool.query('DELETE FROM article_category_links WHERE article_id = $1', [articleId]);
  await pool.query('INSERT INTO article_category_links (article_id, category_id) VALUES ($1, $2)', [articleId, categoryId]);

  await pool.query('DELETE FROM article_tag_links WHERE article_id = $1', [articleId]);
  for (const tag of tags) {
    const tagId = await ensureTag(tag);
    await pool.query(
      'INSERT INTO article_tag_links (article_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [articleId, tagId]
    );
  }

  return { id: articleId, slug, isNew: !existing.rows[0] };
}

// Also ensure trade-talk author exists in app_users
async function ensureAuthorUser() {
  const existing = await pool.query('SELECT id FROM app_users WHERE id = $1 LIMIT 1', [AUTHOR_ID]);
  if (!existing.rows[0]) {
    console.log('ℹ️  Author user not found with that ID, using existing admin user');
  }
}

async function main() {
  await ensureAuthorUser();

  const posts = rawPosts as RawPost[];
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    try {
      const result = await upsertPost(post);
      if (result.isNew) inserted++;
      else updated++;
      if ((i + 1) % 20 === 0) {
        console.log(`  Progress: ${i + 1}/${posts.length} (${inserted} new, ${updated} updated)`);
      }
    } catch (err) {
      console.error(`❌ Failed [${i}] "${post.title.slice(0, 50)}":`, (err as Error).message);
      errors++;
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   ${inserted} new articles inserted`);
  console.log(`   ${updated} existing articles updated`);
  console.log(`   ${errors} errors`);

  const total = await pool.query("SELECT COUNT(*) FROM articles WHERE status = 'published'");
  console.log(`\n📰 Total published articles in DB: ${total.rows[0].count}`);

  await pool.end();
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
