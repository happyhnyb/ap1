import { pgQuery } from '@/lib/db/pg';
import { connectDB, isMongoConfigured } from '@/lib/db/connect';
import { PostModel } from '@/lib/db/models/Post';
import { env } from '@/lib/env';
import { normalizeStoredImageUrl } from '@/lib/media/url';

async function fixPostgres() {
  const result = await pgQuery<{ id: string; hero_image: string | null }>('SELECT id, hero_image FROM articles');
  let updated = 0;

  for (const row of result.rows) {
    const normalized = normalizeStoredImageUrl(row.hero_image) || null;
    if (normalized === (row.hero_image ?? null)) continue;
    await pgQuery('UPDATE articles SET hero_image = $1, updated_at = NOW() WHERE id = $2', [normalized, row.id]);
    updated += 1;
  }

  return { checked: result.rows.length, updated };
}

async function fixMongo() {
  await connectDB();
  const docs = await PostModel.find({}, { _id: 1, hero_image: 1 }).lean();
  let updated = 0;

  for (const doc of docs) {
    const current = typeof doc.hero_image === 'string' ? doc.hero_image : null;
    const normalized = normalizeStoredImageUrl(current) || null;
    if (normalized === current) continue;
    await PostModel.updateOne({ _id: doc._id }, { $set: { hero_image: normalized, updated_at: new Date() } });
    updated += 1;
  }

  return { checked: docs.length, updated };
}

async function main() {
  if (env.DATABASE_URL) {
    const result = await fixPostgres();
    console.log(`PostgreSQL posts checked: ${result.checked}`);
    console.log(`PostgreSQL posts updated: ${result.updated}`);
    return;
  }

  if (isMongoConfigured()) {
    const result = await fixMongo();
    console.log(`Mongo posts checked: ${result.checked}`);
    console.log(`Mongo posts updated: ${result.updated}`);
    return;
  }

  console.log('No DATABASE_URL or MONGODB_URI configured. No posts were changed.');
}

main().catch((error) => {
  console.error('fix:post-images failed:', error);
  process.exit(1);
});
