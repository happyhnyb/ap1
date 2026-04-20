#!/usr/bin/env node
/**
 * Seed MongoDB with initial posts and promote dhairya@hnyb.in to admin.
 * Usage: MONGODB_URI=... npx tsx scripts/seed-db.ts
 */
import mongoose from 'mongoose';
import { INITIAL_POSTS } from '../mocks/data';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

// ── Minimal inline schemas (avoid circular Next.js imports) ──────────────────

const PostSchema = new mongoose.Schema({
  type:              { type: String, enum: ['SHORT', 'STORY', 'ARTICLE'], required: true },
  title:             { type: String, required: true },
  slug:              { type: String, required: true, unique: true },
  excerpt:           { type: String, required: true },
  body:              { type: String, required: true },
  tags:              [String],
  category:          { type: String, required: true },
  author:            { type: String, required: true },
  author_id:         { type: String, required: true },
  hero_image:        { type: String, default: null },
  inline_images:     [String],
  is_premium:        { type: Boolean, default: false },
  linked_article_id: { type: String, default: null },
  status:            { type: String, enum: ['draft', 'published', 'archived'], default: 'published' },
  published_at:      { type: Date, default: null },
  view_count:        { type: Number, default: 0 },
  img:               { type: String, default: '' },
  search_text:       { type: String, default: '' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const UserSchema = new mongoose.Schema({
  name:          String,
  email:         { type: String, lowercase: true },
  password_hash: String,
  auth_methods:  [String],
  role:          { type: String, default: 'reader' },
  stripe_customer_id: { type: String, default: null },
  subscription:  {
    status:     { type: String, default: 'none' },
    plan:       { type: String, default: 'free' },
    started_at: { type: Date, default: null },
    expires_at: { type: Date, default: null },
    payment_ref: { type: String, default: null },
    stripe_subscription_id: { type: String, default: null },
  },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI!);
  console.log('Connected.\n');

  const Post = mongoose.models.Post || mongoose.model('Post', PostSchema);
  const User = mongoose.models.User || mongoose.model('User', UserSchema);

  // ── Seed posts ─────────────────────────────────────────────────────────────
  let inserted = 0, skipped = 0;
  for (const post of INITIAL_POSTS) {
    const exists = await Post.findOne({ slug: post.slug });
    if (exists) { skipped++; continue; }
    await Post.create({
      type:              post.type,
      title:             post.title,
      slug:              post.slug,
      excerpt:           post.excerpt,
      body:              post.body,
      tags:              post.tags ?? [],
      category:          post.category,
      author:            post.author,
      author_id:         post.author_id,
      hero_image:        post.hero_image ?? null,
      inline_images:     [],
      is_premium:        post.is_premium ?? false,
      linked_article_id: post.linked_article_id ?? null,
      status:            post.status ?? 'published',
      published_at:      post.published_at ? new Date(post.published_at) : new Date(),
      view_count:        post.view_count ?? 0,
      img:               post.img ?? '',
      search_text:       `${post.title} ${post.excerpt} ${post.body}`.slice(0, 2000),
    });
    inserted++;
  }
  console.log(`Posts: ${inserted} inserted, ${skipped} already existed`);

  // ── Promote dhairya@hnyb.in to admin ──────────────────────────────────────
  const adminEmail = 'dhairya@hnyb.in';
  const user = await User.findOne({ email: adminEmail });
  if (user) {
    await User.updateOne({ email: adminEmail }, {
      role: 'admin',
      'subscription.status': 'active',
      'subscription.plan':   'annual',
      'subscription.expires_at': new Date('2027-12-31'),
    });
    console.log(`Promoted ${adminEmail} to admin ✓`);
  } else {
    console.log(`User ${adminEmail} not found — register first, then re-run this script`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
