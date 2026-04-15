import { postsAdapter } from '@/lib/adapters';

const FALLBACK =
  'Kharif sowing up 12% on early monsoon  ·  Wheat MSP raised to ₹2,425/quintal  ·  Tomato prices crash in Karnataka  ·  Organic exports jump 48%  ·  Locust alert for Rajasthan–Gujarat border  ·  ';

export async function Ticker() {
  let segment: string;
  try {
    const posts = await postsAdapter.listPublished();
    if (posts.length > 0) {
      segment =
        posts
          .slice(0, 10)
          .map((p) => p.title)
          .join('  ·  ') + '  ·  ';
    } else {
      segment = FALLBACK;
    }
  } catch {
    segment = FALLBACK;
  }

  // Duplicate so the CSS -50% translateX loop is seamless
  const track = segment + segment;

  return (
    <div className="ticker">
      <div className="ticker-badge">LATEST</div>
      <div className="ticker-scroll">
        <div className="ticker-track">{track}</div>
      </div>
    </div>
  );
}
