/**
 * KYC Platform — MongoDB Seed Script
 * Run: npx tsx scripts/seed.ts
 *
 * Drops existing data and seeds fresh users + posts.
 * Do NOT run against production.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in .env');
  process.exit(1);
}

// ── Models (inline to avoid circular imports) ────────────────────

const UserSchema = new mongoose.Schema({
  name: String, email: String, password_hash: String,
  auth_methods: [String], role: String, mobile: String,
  subscription: {
    status: String, plan: String,
    started_at: Date, expires_at: Date, payment_ref: String,
  },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const PostSchema = new mongoose.Schema({
  type: String, title: String, slug: String, excerpt: String, body: String,
  tags: [String], category: String, author: String, author_id: String,
  hero_image: String, inline_images: [String],
  is_premium: Boolean, linked_article_id: String,
  status: String, published_at: Date,
  view_count: { type: Number, default: 0 }, img: String, search_text: String,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

PostSchema.index({ title: 'text', excerpt: 'text', body: 'text', tags: 'text' });

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Post = mongoose.models.Post || mongoose.model('Post', PostSchema);

// ── Seed data ────────────────────────────────────────────────────

async function main() {
  await mongoose.connect(MONGODB_URI!);
  console.log('✅ Connected to MongoDB');

  // Clear
  await User.deleteMany({});
  await Post.deleteMany({});
  console.log('🗑️  Cleared existing data');

  // Users
  const hash = (pw: string) => bcrypt.hash(pw, 12);
  const expires = (months: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d;
  };

  await User.insertMany([
    {
      name: 'Dhairya Pareek', email: 'admin@kyc.news',
      password_hash: await hash('admin123'),
      auth_methods: ['email', 'google'], role: 'admin', mobile: '+919876543210',
      subscription: { status: 'active', plan: 'annual', started_at: new Date(), expires_at: expires(12) },
    },
    {
      name: 'Deepak Pareek', email: 'editor@kyc.news',
      password_hash: await hash('editor123'),
      auth_methods: ['email'], role: 'editor', mobile: '+919876543211',
      subscription: { status: 'active', plan: 'annual', started_at: new Date(), expires_at: expires(12) },
    },
    {
      name: 'Niraj Shah', email: 'niraj@kyc.news',
      password_hash: await hash('editor123'),
      auth_methods: ['email', 'google'], role: 'editor', mobile: '+919876543212',
      subscription: { status: 'active', plan: 'annual', started_at: new Date(), expires_at: expires(12) },
    },
    {
      name: 'Demo Reader', email: 'reader@kyc.news',
      password_hash: await hash('reader123'),
      auth_methods: ['email'], role: 'premium', mobile: null,
      subscription: { status: 'active', plan: 'monthly', started_at: new Date(), expires_at: expires(1) },
    },
    {
      name: 'Free User', email: 'free@kyc.news',
      password_hash: await hash('free123'),
      auth_methods: ['email'], role: 'reader', mobile: null,
      subscription: { status: 'none', plan: 'free', expires_at: null },
    },
  ]);
  console.log('👥 Seeded 5 users');

  // Posts
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

  const posts = [
    {
      type: 'SHORT', title: 'Kharif Sowing Surges 12% on Early Monsoon Arrival',
      slug: 'kharif-sowing-surges',
      excerpt: 'Kharif sowing jumped 12% year-on-year as the southwest monsoon arrived a week early, boosting rice and soybean acreage.',
      body: `Kharif sowing has jumped 12% year-on-year as the southwest monsoon arrived a week early, boosting rice and soybean acreage across Maharashtra and Madhya Pradesh.\n\nRice planting is up 18% in key paddy states including West Bengal, Telangana, and Chhattisgarh. Soybean acreage in Madhya Pradesh alone has increased by 22%, driven by favourable soil moisture levels and strong MSP signals from the government.\n\nFarmers in Vidarbha report the best pre-monsoon conditions in five years, with reservoir levels at 45% capacity — well above the 10-year average of 32% at this stage.`,
      category: 'Crops', tags: ['kharif', 'monsoon', 'sowing', 'rice'],
      is_premium: false, status: 'published', published_at: daysAgo(10),
      author: 'Dhairya Pareek', author_id: 'seed-u1', img: 'crops', view_count: 4210,
    },
    {
      type: 'STORY', title: 'How Precision Agriculture Is Transforming Cotton Farming in Gujarat',
      slug: 'precision-agriculture-cotton-gujarat',
      excerpt: 'From drone-sprayed pesticides to AI-powered soil sensors, Gujarat\'s cotton farmers are embracing a tech revolution that\'s boosting yields and slashing input costs by 30%.',
      body: `From drone-sprayed pesticides to AI-powered soil sensors, Gujarat's cotton farmers are embracing a tech revolution.\n\n## The Drone Revolution\n\nOver 8,000 cotton farmers in Gujarat's Saurashtra region are now using drone-based pesticide spraying, cutting chemical usage by 35% while improving coverage uniformity. The state government's 50% subsidy on drone services has been a key accelerator.\n\n## Soil Intelligence\n\nStartups like CropIn and DeHaat are deploying IoT soil sensors that monitor moisture, pH levels, and nutrient content in real time. Farmers receive WhatsApp alerts with precise fertilizer recommendations.\n\n## The Results\n\nEarly adopters report 25-30% yield improvements and significant reductions in water consumption. Cotton quality grades have also improved, fetching premium prices at APMC mandis.\n\n## Challenges Ahead\n\nSmallholder farmers — who constitute 86% of India's farming community — still struggle with access and affordability. Without continued subsidy support and cooperative models, the precision ag revolution risks becoming an elite phenomenon.`,
      category: 'AgriTech', tags: ['precision agriculture', 'cotton', 'Gujarat', 'drones', 'AgriTech'],
      is_premium: true, linked_article_id: 'india-dairy-crisis-climate',
      status: 'published', published_at: daysAgo(8),
      author: 'Deepak Pareek', author_id: 'seed-u2', img: 'agritech', view_count: 7845,
    },
    {
      type: 'ARTICLE', title: 'India\'s Dairy Crisis: How Climate Change Is Reshaping the ₹16 Lakh Crore Industry',
      slug: 'india-dairy-crisis-climate',
      excerpt: 'Rising heat stress, shifting rainfall patterns, and fodder shortages threaten India\'s position as the world\'s largest milk producer.',
      body: `Rising heat stress, shifting rainfall patterns, and fodder shortages threaten India's position as the world's largest milk producer.\n\n## The Scale of the Problem\n\nIndia produces over 230 million tonnes of milk annually — more than the US and EU combined. But production growth has slowed to 1.8% in 2025, down from a decade average of 4.2%. This isn't a temporary blip; it reflects structural stress building across the supply chain.\n\n## Heat Stress: The Silent Yield Killer\n\nDairy cattle experience significant productivity drops when temperatures exceed 27°C. A cow under heat stress produces 10-15% less milk and has 30% lower conception rates. In Rajasthan and Gujarat, average summer temperatures have risen 1.8°C over the past 20 years. Climate models project a further 2°C rise by 2040.\n\n## The Fodder Crisis\n\nGreen fodder availability has declined 23% since 2015 in Rajasthan and Gujarat — India's largest dairy states. Farmers are substituting with dry roughage, which reduces milk fat content and shortens lactation cycles.\n\n## What Must Change\n\nExperts argue for a three-pronged approach: heat-tolerant breed development through NDDB programs, micro-irrigation expansion for fodder cultivation, and a stronger cold chain infrastructure to reduce the 25% wastage that occurs post-farm-gate.\n\n## The Amul Model Under Pressure\n\nEven Amul, which processes 28 million litres daily, acknowledges procurement challenges. Procurement from Gujarat cooperatives fell 4% in the April-June 2025 quarter — the first decline since 2008.\n\n## Investment Opportunity\n\nVenture capital has begun flowing into climate-resilient dairying: heat stress monitoring sensors, automated shade structures, and precision nutritional formulations. But scale-up remains elusive without policy backing and cooperative integration.`,
      category: 'Livestock', tags: ['dairy', 'climate change', 'livestock', 'Amul', 'fodder'],
      is_premium: true, status: 'published', published_at: daysAgo(6),
      author: 'Niraj Shah', author_id: 'seed-u3', img: 'dairy', view_count: 15230,
    },
    {
      type: 'SHORT', title: 'Wheat MSP Raised to ₹2,425/Quintal for 2026-27 Season',
      slug: 'wheat-msp-raised',
      excerpt: 'The Cabinet Committee on Economic Affairs approved a ₹150 increase in the minimum support price of wheat.',
      body: `The CCEA approved a ₹150 increase in the MSP of wheat, bringing it to ₹2,425 per quintal for 2026-27.\n\nThe increase is in line with the government's commitment to ensuring at least 50% return over the cost of production. Total wheat procurement is expected to reach 38 million tonnes this year, up from 34.1 million tonnes in 2025-26.`,
      category: 'Policy', tags: ['MSP', 'wheat', 'CCEA', 'rabi', 'policy'],
      is_premium: false, status: 'published', published_at: daysAgo(9),
      author: 'Dhairya Pareek', author_id: 'seed-u1', img: 'wheat', view_count: 5670,
    },
    {
      type: 'STORY', title: 'The Organic Farming Boom: Why Indian Exports Jumped 48% in One Year',
      slug: 'organic-farming-boom-exports',
      excerpt: 'India\'s organic agri-exports hit $1.8 billion in FY26, driven by EU demand and Sikkim\'s success story.',
      body: `India's organic agri-exports hit $1.8 billion in FY26, a 48% jump that surprised even optimistic projections.\n\n## What's Driving Growth\n\nThe EU's Farm to Fork strategy has created massive demand for certified organic produce. EU-India trade discussions have lowered some certification friction, and Indian organic producers are capitalising.\n\n## The Sikkim Model\n\nSikkim's transition to 100% organic in 2016 has become a global case study. The state now exports certified organic produce to 14 countries. Its success is being replicated in Himachal Pradesh and parts of Uttarakhand.\n\n## Challenges\n\nCertification costs remain a barrier for smallholders — the average Indian farm is 1.08 hectares, and a full NPOP certification costs ₹12,000-25,000. Group certification models through FPOs are the most viable path forward.`,
      category: 'Trade', tags: ['organic farming', 'exports', 'Sikkim', 'EU', 'trade'],
      is_premium: false, status: 'published', published_at: daysAgo(7),
      author: 'Deepak Pareek', author_id: 'seed-u2', img: 'organic', view_count: 6320,
    },
    {
      type: 'SHORT', title: 'Locust Warning Issued for Rajasthan–Gujarat Border Districts',
      slug: 'locust-warning-rajasthan',
      excerpt: 'The Locust Warning Organisation issued a yellow alert for six border districts in Rajasthan and three in Gujarat.',
      body: `The LWO has issued a yellow alert for six districts in western Rajasthan and three in Gujarat's Kutch region.\n\nControl operations using vehicle-mounted ULV sprayers and drones have been deployed in Jaisalmer and Barmer. Farmers in the affected regions have been advised to monitor fields at night when locust activity peaks.`,
      category: 'Alerts', tags: ['locust', 'Rajasthan', 'Gujarat', 'pest', 'warning'],
      is_premium: false, status: 'published', published_at: daysAgo(5),
      author: 'Niraj Shah', author_id: 'seed-u3', img: 'locust', view_count: 8920,
    },
  ];

  for (const p of posts) {
    const search_text = [p.title, p.excerpt, p.body, p.tags.join(' '), p.category, p.author].join(' ');
    await Post.create({ ...p, search_text });
  }
  console.log(`📰 Seeded ${posts.length} posts`);

  await mongoose.disconnect();
  console.log('✅ Seed complete. Disconnected from MongoDB.');
}

main().catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); });
