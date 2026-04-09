import Feed from '@/components/feed/Feed';
import { getPosts } from '@/lib/api';

export default async function HomePage() {
  const posts = await getPosts();
  return <Feed posts={posts} />;
}
