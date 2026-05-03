import { pgQuery } from '@/lib/db/pg';
import { createId } from '@/lib/db/ids';
import { generateSlug } from '@/lib/utils';

const DEFAULT_CATEGORIES = ['Crops', 'Trade', 'Policy', 'Markets', 'Weather', 'Research'];
const DEFAULT_TAGS = ['wheat', 'rice', 'soybean', 'cotton', 'trade', 'policy', 'mandi', 'forecast'];

async function upsertCategory(name: string) {
  const slug = generateSlug(name);
  const existing = await pgQuery<{ id: string }>('SELECT id FROM article_categories WHERE slug = $1 LIMIT 1', [slug]);
  if (existing.rows[0]) return existing.rows[0].id;
  const id = createId('cat');
  await pgQuery('INSERT INTO article_categories (id, slug, name) VALUES ($1, $2, $3)', [id, slug, name]);
  return id;
}

async function upsertTag(name: string) {
  const slug = generateSlug(name);
  const existing = await pgQuery<{ id: string }>('SELECT id FROM article_tags WHERE slug = $1 LIMIT 1', [slug]);
  if (existing.rows[0]) return existing.rows[0].id;
  const id = createId('tag');
  await pgQuery('INSERT INTO article_tags (id, slug, name) VALUES ($1, $2, $3)', [id, slug, name]);
  return id;
}

async function main() {
  for (const category of DEFAULT_CATEGORIES) {
    await upsertCategory(category);
  }
  for (const tag of DEFAULT_TAGS) {
    await upsertTag(tag);
  }
  console.log('Seeded article categories and tags.');
}

main().catch((error) => {
  console.error('db:seed-taxonomy failed:', error);
  process.exit(1);
});
