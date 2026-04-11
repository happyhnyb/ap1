import type { ContactSubmission, Post } from '@/types/post';
import type { User } from '@/types/user';

export const CATEGORIES = ['Top Stories', 'Crops', 'Markets', 'AgriTech', 'Livestock', 'Policy', 'Climate', 'Trade', 'Research', 'Alerts'];

export const TEAM = [
  { name: 'Dhairya Pareek', role: 'Editor-in-Chief', bio: 'Agriculture policy & crop economics' },
  { name: 'Deepak Pareek', role: 'Technology & Research', bio: 'AgriTech, R&D, precision farming' },
  { name: 'Niraj Shah', role: 'Markets & Trade', bio: 'Commodity markets, exports, MSP' }
];

export const PLANS = [
  { id: 'free', name: 'Free', price: '₹0', period: '/forever', features: ['3 premium articles/month', 'All breaking news', 'Market prices & alerts', 'Weekly newsletter'], featured: false },
  { id: 'monthly', name: 'KYC Pro', price: '₹199', period: '/month', features: ['Unlimited premium access', 'All deep-dive reports', 'AgriTech analysis', 'Commodity forecasts', 'Priority alerts'], featured: true },
  { id: 'annual', name: 'KYC Pro Annual', price: '₹1,799', period: '/year', features: ['Everything in monthly', 'Save 25%', 'Exclusive annual reports', 'Direct analyst access', 'MSP & policy briefings'], featured: false }
];

export const MANDI_PRICES = [
  { crop: 'Wheat', price: '₹2,380', change: '+1.2%', up: true },
  { crop: 'Rice (Basmati)', price: '₹4,650', change: '-0.8%', up: false },
  { crop: 'Soybean', price: '₹4,120', change: '+2.4%', up: true },
  { crop: 'Cotton', price: '₹6,890', change: '+0.5%', up: true },
  { crop: 'Tomato', price: '₹12', change: '-18.3%', up: false },
  { crop: 'Onion', price: '₹28', change: '+3.1%', up: true }
];

export const INITIAL_POSTS: Post[] = [
  {
    _id: 'p1', type: 'SHORT', title: 'Kharif Sowing Surges 12% on Early Monsoon Arrival', slug: 'kharif-sowing-surges', excerpt: 'Kharif sowing has jumped 12% year-on-year as the southwest monsoon arrived a week early, boosting rice and soybean acreage across Maharashtra and MP.', body: 'Kharif sowing has jumped 12% year-on-year as the southwest monsoon arrived a week early, boosting rice and soybean acreage across Maharashtra and Madhya Pradesh.\n\nRice planting is up 18% in key paddy states including West Bengal, Telangana, and Chhattisgarh. Soybean acreage in Madhya Pradesh alone has increased by 22%, driven by favourable soil moisture levels and strong MSP signals from the government.\n\nFarmers in Vidarbha report the best pre-monsoon conditions in five years, with reservoir levels at 45% capacity — well above the 10-year average of 32% at this stage.', author: 'Dhairya Pareek', author_id: 'u1', tags: ['kharif', 'monsoon', 'sowing', 'rice'], category: 'Crops', is_premium: false, linked_article_id: null, status: 'published', published_at: '2026-03-28T07:00:00Z', created_at: '2026-03-28T06:00:00Z', updated_at: '2026-03-28T07:00:00Z', view_count: 4210, img: 'crops', hero_image: null
  },
  {
    _id: 'p2', type: 'STORY', title: 'How Precision Agriculture Is Transforming Cotton Farming in Gujarat', slug: 'precision-agriculture-cotton-gujarat', excerpt: 'From drone-sprayed pesticides to AI-powered soil sensors, Gujarat\'s cotton farmers are embracing a tech revolution that\'s boosting yields and slashing input costs by 30%.', body: 'From drone-sprayed pesticides to AI-powered soil sensors, Gujarat\'s cotton farmers are embracing a tech revolution.\n\n## The Drone Revolution\n\nOver 8,000 cotton farmers in Gujarat\'s Saurashtra region are now using drone-based pesticide spraying, cutting chemical usage by 35% while improving coverage uniformity. The state government\'s 50% subsidy on drone services has been a key accelerator.\n\n## Soil Intelligence\n\nStartups like CropIn and DeHaat are deploying IoT soil sensors that monitor moisture, pH levels, and nutrient content in real time. Farmers receive WhatsApp alerts with precise fertilizer recommendations.\n\n## The Results\n\nEarly adopters report 25-30% yield improvements and significant reductions in water consumption. Cotton quality grades have also improved, fetching premium prices at APMC mandis.\n\n## Challenges Ahead\n\nSmallholder farmers — who constitute 86% of India\'s farming community — still struggle with access and affordability. Without continued subsidy support and cooperative models, the precision ag revolution risks becoming an elite phenomenon.', author: 'Deepak Pareek', author_id: 'u2', tags: ['precision agriculture', 'cotton', 'Gujarat', 'drones', 'AgriTech'], category: 'AgriTech', is_premium: true, linked_article_id: 'india-dairy-crisis-climate', status: 'published', published_at: '2026-03-27T10:00:00Z', created_at: '2026-03-27T09:00:00Z', updated_at: '2026-03-27T10:00:00Z', view_count: 7845, img: 'agritech', hero_image: null
  },
  {
    _id: 'p3', type: 'ARTICLE', title: 'India\'s Dairy Crisis: How Climate Change Is Reshaping the ₹16 Lakh Crore Industry', slug: 'india-dairy-crisis-climate', excerpt: 'Rising heat stress, shifting rainfall patterns, and fodder shortages threaten India\'s position as the world\'s largest milk producer.', body: 'Rising heat stress, shifting rainfall patterns, and fodder shortages threaten India\'s position as the world\'s largest milk producer.\n\n## The Scale of the Problem\n\nIndia produces over 230 million tonnes of milk annually — more than the US and EU combined. But production growth has slowed to 1.8% in 2025.\n\n## Heat Stress\n\nDairy cattle experience significant productivity drops when temperatures exceed 27°C.\n\n## The Fodder Crisis\n\nGreen fodder availability has declined 23% since 2015 in Rajasthan and Gujarat.\n\n## What Must Change\n\nExperts argue for a three-pronged approach: heat-tolerant breed development, micro-irrigation for fodder cultivation, and a stronger cold chain.', author: 'Niraj Shah', author_id: 'u3', tags: ['dairy', 'climate change', 'livestock', 'Amul', 'fodder'], category: 'Livestock', is_premium: true, linked_article_id: null, status: 'published', published_at: '2026-03-26T06:00:00Z', created_at: '2026-03-26T05:00:00Z', updated_at: '2026-03-26T06:00:00Z', view_count: 15230, img: 'dairy', hero_image: null
  },
  {
    _id: 'p4', type: 'SHORT', title: 'Wheat MSP Raised to ₹2,425/Quintal for 2026-27 Season', slug: 'wheat-msp-raised', excerpt: 'The Cabinet Committee on Economic Affairs approved a ₹150 increase in the minimum support price of wheat.', body: 'The CCEA approved a ₹150 increase in the MSP of wheat, bringing it to ₹2,425 per quintal for 2026-27.\n\nThe increase is in line with the government\'s commitment to ensuring at least 50% return over the cost of production.', author: 'Dhairya Pareek', author_id: 'u1', tags: ['MSP', 'wheat', 'CCEA', 'rabi', 'policy'], category: 'Policy', is_premium: false, linked_article_id: null, status: 'published', published_at: '2026-03-28T05:30:00Z', created_at: '2026-03-28T05:00:00Z', updated_at: '2026-03-28T05:30:00Z', view_count: 5670, img: 'wheat', hero_image: null
  },
  {
    _id: 'p5', type: 'STORY', title: 'The Organic Farming Boom: Why Indian Exports Jumped 48% in One Year', slug: 'organic-farming-boom-exports', excerpt: 'India\'s organic agri-exports hit $1.8 billion in FY26, driven by EU demand and Sikkim\'s success story.', body: 'India\'s organic agri-exports hit $1.8 billion in FY26, a 48% jump that surprised even optimistic projections.\n\n## What\'s Driving Growth\n\nThe EU\'s Farm to Fork strategy has created massive demand for certified organic produce.\n\n## The Sikkim Model\n\nSikkim\'s transition remains a global case study.\n\n## Challenges\n\nCertification costs remain a barrier for smallholders.', author: 'Deepak Pareek', author_id: 'u2', tags: ['organic farming', 'exports', 'Sikkim', 'EU', 'trade'], category: 'Trade', is_premium: false, linked_article_id: null, status: 'published', published_at: '2026-03-25T08:00:00Z', created_at: '2026-03-25T07:00:00Z', updated_at: '2026-03-25T08:00:00Z', view_count: 6320, img: 'organic', hero_image: null
  },
  {
    _id: 'p6', type: 'SHORT', title: 'Locust Warning Issued for Rajasthan–Gujarat Border Districts', slug: 'locust-warning-rajasthan', excerpt: 'The Locust Warning Organisation has issued a yellow alert for six border districts in Rajasthan and three in Gujarat.', body: 'The LWO has issued a yellow alert for six districts in western Rajasthan and three in Gujarat\'s Kutch region.\n\nControl operations using vehicle-mounted ULV sprayers and drones have been deployed in Jaisalmer and Barmer.', author: 'Niraj Shah', author_id: 'u3', tags: ['locust', 'Rajasthan', 'Gujarat', 'pest', 'warning'], category: 'Alerts', is_premium: false, linked_article_id: null, status: 'published', published_at: '2026-03-27T16:00:00Z', created_at: '2026-03-27T15:00:00Z', updated_at: '2026-03-27T16:00:00Z', view_count: 8920, img: 'locust', hero_image: null
  }
];

export const INITIAL_USERS: User[] = [
  { _id: 'u1', name: 'Dhairya Pareek', email: 'admin@kyc.news', password_hash: 'admin123', mobile: '+919876543210', role: 'admin', auth_methods: ['email', 'google'], subscription: { status: 'active', plan: 'annual', expires_at: '2027-03-28' }, created_at: '2025-01-01' },
  { _id: 'u2', name: 'Deepak Pareek', email: 'editor@kyc.news', password_hash: 'editor123', mobile: '+919876543211', role: 'editor', auth_methods: ['email'], subscription: { status: 'active', plan: 'annual', expires_at: '2027-03-28' }, created_at: '2025-01-01' },
  { _id: 'u3', name: 'Niraj Shah', email: 'niraj@kyc.news', password_hash: 'editor123', mobile: '+919876543212', role: 'editor', auth_methods: ['email', 'google'], subscription: { status: 'active', plan: 'annual', expires_at: '2027-03-28' }, created_at: '2025-02-01' },
  { _id: 'u4', name: 'Demo Reader', email: 'reader@kyc.news', password_hash: 'reader123', mobile: null, role: 'premium', auth_methods: ['email'], subscription: { status: 'active', plan: 'monthly', expires_at: '2026-04-28' }, created_at: '2026-01-15' },
  { _id: 'u5', name: 'Free User', email: 'free@kyc.news', password_hash: 'free123', mobile: null, role: 'reader', auth_methods: ['email'], subscription: { status: 'none', plan: 'free', expires_at: null }, created_at: '2026-03-01' }
];

export const INITIAL_CONTACTS: ContactSubmission[] = [];
