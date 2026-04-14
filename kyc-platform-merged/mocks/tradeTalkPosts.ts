import type { Post } from '@/types/post';
import rawPosts from './tradeTalkPosts.json';

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

export const TRADE_TALK_POSTS: Post[] = (rawPosts as RawTradeTalkPost[]).map((post, index) => ({
  _id: `tt${String(index + 1).padStart(3, '0')}`,
  type: 'ARTICLE',
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt,
  body: post.body,
  author: post.author,
  author_id: 'u1',
  tags: buildTags(`${post.title} ${post.body}`),
  category: 'Trade',
  is_premium: false,
  linked_article_id: null,
  status: 'published',
  published_at: post.published_at,
  created_at: post.created_at,
  updated_at: post.updated_at,
  view_count: 0,
  img: 'trade',
  hero_image: post.hero_image,
  inline_images: [],
}));
