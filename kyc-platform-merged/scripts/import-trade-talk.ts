import rawPosts from '../mocks/tradeTalkPosts.json';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

const TAG_DICTIONARY = [
  'wheat', 'sugar', 'rice', 'corn', 'soybean', 'soybeans', 'cotton', 'oil', 'crude',
  'ethanol', 'silver', 'gold', 'trade', 'exports', 'tariff', 'yuan', 'china',
  'canada', 'europe', 'eu', 'pakistan', 'india', 'usd', 'inr', 'grain', 'fertilizer',
  'energy', 'food', 'agriculture', 'commodity', 'markets',
];

function buildTags(text: string): string[] {
  const lower = text.toLowerCase();
  return TAG_DICTIONARY.filter((tag) => lower.includes(tag)).slice(0, 8);
}

const PostSchema = new mongoose.Schema({
  type: String,
  title: String,
  slug: { type: String, unique: true },
  excerpt: String,
  body: String,
  tags: [String],
  category: String,
  author: String,
  author_id: String,
  hero_image: String,
  inline_images: [String],
  is_premium: Boolean,
  linked_article_id: String,
  status: String,
  published_at: Date,
  created_at: Date,
  updated_at: Date,
  view_count: Number,
  img: String,
  search_text: String,
}, { collection: 'posts' });

const Post = mongoose.models.Post || mongoose.model('Post', PostSchema);

type RawTradeTalkPost = {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  author: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  hero_image: string | null;
};

async function main() {
  await mongoose.connect(MONGODB_URI!);
  console.log('✅ Connected to MongoDB');

  const posts = rawPosts as RawTradeTalkPost[];
  const ops = posts.map((post) => {
    const tags = buildTags(`${post.title} ${post.body}`);
    const search_text = [post.title, post.excerpt, post.body, tags.join(' '), 'Trade', post.author].join(' ');

    return {
      updateOne: {
        filter: { slug: post.slug },
        update: {
          $set: {
            type: 'ARTICLE',
            title: post.title,
            excerpt: post.excerpt,
            body: post.body,
            tags,
            category: 'Trade',
            author: post.author,
            author_id: 'trade-talk',
            hero_image: post.hero_image,
            inline_images: [],
            is_premium: false,
            linked_article_id: null,
            status: 'published',
            published_at: new Date(post.published_at),
            updated_at: new Date(post.updated_at),
            img: 'trade',
            search_text,
          },
          $setOnInsert: {
            slug: post.slug,
            created_at: new Date(post.created_at),
            view_count: 0,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await Post.bulkWrite(ops, { ordered: false });
  const publishedCount = await Post.countDocuments({ status: 'published' });
  const tradeTalkCount = await Post.countDocuments({ author_id: 'trade-talk' });

  console.log(`✅ Upserted ${result.upsertedCount} new Trade Talk posts`);
  console.log(`✅ Matched ${result.matchedCount} existing Trade Talk posts`);
  console.log(`✅ Modified ${result.modifiedCount} Trade Talk posts`);
  console.log(`📰 Published posts now in DB: ${publishedCount}`);
  console.log(`📰 Trade Talk posts now in DB: ${tradeTalkCount}`);

  await mongoose.disconnect();
  console.log('✅ Import complete');
}

main().catch((error) => {
  console.error('❌ Import failed:', error);
  process.exit(1);
});
