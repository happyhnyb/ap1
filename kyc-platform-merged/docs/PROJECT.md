# Know Your Commodity (KYC) — Full Project Documentation

> **Platform:** Premium commodity intelligence for India's agri-markets.  
> **Live site:** kycagri.com  
> **Repo:** github.com/happyhnyb/ap1 → subfolder `kyc-platform-merged/`  
> **Deployed on:** Vercel (root directory = `kyc-platform-merged`)

---

## Table of Contents

1. [What the Platform Does](#1-what-the-platform-does)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [User Roles & Access Tiers](#4-user-roles--access-tiers)
5. [Feature Workflows](#5-feature-workflows)
   - [Authentication](#51-authentication-workflow)
   - [Content / Posts](#52-content--posts-workflow)
   - [Price Predictor](#53-price-predictor-workflow)
   - [Search (Standard + AI)](#54-search-workflow)
   - [Payments & Subscriptions](#55-payments--subscriptions-workflow)
   - [Admin / CMS](#56-admin--cms-workflow)
   - [Mandi Widget](#57-mandi-widget-workflow)
6. [Database Schema](#6-database-schema)
7. [API Route Map](#7-api-route-map)
8. [Environment Variables](#8-environment-variables)
9. [Demo vs Production Mode](#9-demo-vs-production-mode)
10. [Deployment Guide](#10-deployment-guide)
11. [Local Development](#11-local-development)

---

## 1. What the Platform Does

KYC is a **subscription-based commodity intelligence platform** built for Indian agri-markets. Think Bloomberg for crops — combining editorial journalism, real government mandi price data, and ML-powered forecasting.

**Core value props:**
- Breaking news + deep-dive articles on crops, markets, trade, and policy
- Live mandi (wholesale market) prices pulled from Agmarknet (data.gov.in)
- ML price predictor: 14–30 day forecasts using GBRT + Holt-Winters + Seasonal Naive
- AI-powered search and article summarization (OpenAI)
- Freemium model — free readers see teasers; Pro subscribers get full access

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript 5.7 |
| Styling | Custom CSS (design tokens + BEM-style classes, no Tailwind in use) |
| Database | MongoDB Atlas via Mongoose 9 |
| Auth | JWT (`jose` library) — HttpOnly cookies, 7-day expiry, HS256 |
| Payments | Razorpay (primary) or Stripe (fallback) — switchable via env vars |
| ML / Forecasting | Pure TypeScript: GBRT, Holt-Winters, Seasonal Naive, SMA — no Python required |
| AI | OpenAI API (GPT) — search, summarization, forecast explanation, copilot |
| Data source | Agmarknet API (data.gov.in) — live mandi prices |
| File storage | Cloudflare R2 (optional) — falls back to `public/uploads/` |
| Charts | Recharts 3 |
| Email | Resend (OTP auth, contact form) |
| Testing | Vitest |
| Deployment | Vercel (serverless, auto-deploy on git push) |

---

## 3. Project Structure

```
kyc-platform-merged/
├── app/                        # Next.js App Router pages + API routes
│   ├── layout.tsx              # Root layout: Header, Footer, Ticker, BottomNav, AnimationProvider
│   ├── page.tsx                # Homepage: masthead + Feed
│   ├── globals.css             # All CSS — design tokens, components, animations
│   ├── about/                  # About page (static)
│   ├── admin/                  # CMS editor (editor/admin only)
│   ├── contact/                # Contact form
│   ├── feed/                   # All posts infinite-scroll feed
│   ├── login/ register/        # Auth forms
│   ├── post/[slug]/            # Individual article pages
│   ├── premium/predictor/      # ML price predictor (Pro only)
│   ├── search/                 # Search page (standard + AI)
│   ├── subscribe/              # Subscription / paywall page
│   └── api/                    # All backend route handlers
│       ├── auth/               # login, register, logout, Google OAuth, OTP
│       ├── posts/              # CRUD for articles
│       ├── predictor/          # Price forecast endpoints
│       ├── search/             # Standard search
│       ├── ai-search/          # AI semantic search
│       ├── ai/                 # Copilot, summarize, explain, personalize
│       ├── payment/            # Checkout, webhook, portal
│       ├── forecast/           # Internal forecasting helpers
│       ├── contact/            # Contact form submission
│       └── upload/             # Image upload (R2 or local)
│
├── components/
│   ├── layout/                 # Header, Footer, Ticker, BottomNav, AnimationProvider
│   ├── feed/                   # Feed, FeedInfinite, MandiWidget, PostThumb
│   ├── post/                   # Article renderer, AI summary panel
│   ├── predictor/              # PredictorClient, PriceChart, Paywall, AIExplain
│   ├── auth/                   # GoogleAuthButton, EmailOTPCard
│   ├── cms/                    # ImageUpload
│   └── subscribe/              # SubscribeButton, ManageSubscriptionButton
│
├── lib/
│   ├── adapters/               # Data access layer (MongoDB ↔ in-memory swap)
│   │   ├── posts.ts            # Post CRUD operations
│   │   └── users.ts            # User CRUD + auth operations
│   ├── auth/                   # JWT, entitlement checks, Google OAuth, Email OTP
│   ├── db/                     # Mongoose connection + models (Post, User, Contact)
│   ├── ai/                     # OpenAI integration: prompts, retrieval, caching
│   ├── forecasting/            # Full ML forecasting engine (TypeScript)
│   │   ├── models/             # GBRT, Holt-Winters, Seasonal Naive, SMA
│   │   ├── preprocessing/      # Data cleaning, imputation, quality scoring
│   │   ├── evaluation/         # Backtester, SMAPE/MAE metrics
│   │   ├── explainability/     # Feature importance, driver analysis
│   │   └── selection/         # Champion/challenger model picker
│   ├── mandi/                  # Agmarknet API engine (fetch + Holt's smoothing)
│   ├── payments/               # Razorpay + Stripe provider abstraction
│   ├── search/                 # Standard (text) + AI (semantic) search
│   ├── storage/                # Cloudflare R2 upload helper
│   ├── env.ts                  # All environment variable definitions
│   ├── validation.ts           # Zod schemas for all write endpoints
│   ├── ratelimit.ts            # In-memory rate limiter
│   └── utils.ts                # timeAgo, slugify, etc.
│
├── mocks/
│   ├── data.ts                 # Seed data: demo users, initial posts, plans
│   └── tradeTalkPosts.ts       # Pre-written article content
│
├── types/                      # TypeScript types (Post, User, etc.)
├── docs/                       # Documentation (you are here)
└── mandi-service/              # Optional standalone Node.js sidecar (not required)
```

---

## 4. User Roles & Access Tiers

```
Guest (not logged in)
  └── Free articles only, no AI search, no predictor

Reader (logged in, free)
  └── Same as guest — free content only

Premium / Pro (paid subscriber)
  └── All articles (including premium-gated)
  └── AI-powered search
  └── Price predictor (14-30 day forecasts)
  └── Article AI summaries

Editor
  └── Everything Premium gets
  └── Access to /admin CMS — create/edit/publish posts
  └── Image upload

Admin
  └── Everything Editor gets
  └── Full user management (planned)
```

Role is stored on the User record (`role` field). Subscription state is an embedded `subscription` subdocument with `status: active | expired | cancelled | none`.

**Entitlement logic** lives in `lib/auth/entitlement.ts`:
- `isPremium()` — reads from JWT (fast, used for UI gating)
- `isPremiumUser()` — reads from DB (slow but fresh, used in premium API routes)
- `isEditor()` — admin or editor role
- `canAccessPost()` — checks post's `is_premium` flag against user tier
- `canAccessPredictor()` / `canAccessAISearch()` — Pro+ only

---

## 5. Feature Workflows

### 5.1 Authentication Workflow

KYC supports **three auth methods**: Email+Password, Google OAuth, and Email OTP (magic link).

#### Email + Password login

```
User fills email + password on /login
  → POST /api/auth/login
    → Rate limit check (5 attempts / 15 min per IP)
    → usersAdapter.login(email, password)
      → [MongoDB mode]  UserModel.findOne + bcrypt.compare
      → [Demo mode]     In-memory lookup + bcrypt or plaintext compare
    → If valid: signToken(sessionPayload) → JWT (HS256, 7-day expiry)
    → Set cookie: kyc_token (HttpOnly, Secure, SameSite=Lax)
    → Return { ok: true, user: sessionPayload }
  → Client router.push('/') + router.refresh()
  → Header re-renders with session state
```

#### Registration

```
User fills name + email + password on /register
  → Client validates: length ≥ 8, 1 uppercase, 1 digit
  → POST /api/auth/register
    → Rate limit check
    → Zod validates RegisterSchema
    → usersAdapter.getByEmail(email) — check no duplicate
    → usersAdapter.register() → bcrypt.hash(password, 12) → save user
    → Sign JWT → set cookie
    → Redirect to homepage
```

#### Google OAuth

```
User clicks "Continue with Google"
  → GET /api/auth/google?code=...
    → Exchange code for Google ID token
    → Verify token with Google JWKS
    → usersAdapter.getByEmail(email) → create if not exists
    → Sign JWT → set cookie
    → Redirect to /
```

#### Email OTP

```
User enters email on OTP card
  → POST /api/auth/otp/request
    → Generate 6-digit OTP, store in memory with TTL
    → Send email via Resend API
  → User enters code
  → POST /api/auth/otp/verify
    → Validate OTP + expiry
    → Find/create user → sign JWT → set cookie
```

#### Session check

```
Any page load:
  getServerSession() in layout.tsx / page.tsx
    → Read kyc_token cookie
    → verifyToken() with jose
    → Returns SessionPayload | null
    → Passed as prop to Header, BottomNav, and gated UI
```

> **Demo mode note:** Without `MONGODB_URI`, users are stored in memory only. They disappear when the serverless function cold-starts. Demo accounts (`admin@kyc.news`, `reader@kyc.news`, `free@kyc.news`) are always available as they are hardcoded seeds.

---

### 5.2 Content / Posts Workflow

#### Reading articles

```
Homepage (/)
  → postsAdapter.listPublished()
    → [MongoDB] Post.find({ status: 'published' }).sort({ published_at: -1 })
    → [Demo] Filter INITIAL_POSTS
  → Feed component organises posts into: Hero / Side / Latest / Analysis / Most Read
  → Ticker pulls top 10 post titles (streamed via Suspense)

Individual article (/post/[slug])
  → postsAdapter.getBySlug(slug)
  → View count incremented: POST /api/posts/[slug] { action: 'view' }
  → If post.is_premium → check session → show paywall if not Pro
  → Markdown body rendered by Article component
  → AI summary (Pro only): fetched lazily from /api/ai/summarize
```

#### Post types

| Type | Max body | Purpose |
|---|---|---|
| SHORT | 1,000 chars | Breaking news, price alerts |
| STORY | 3,000 chars | Developing coverage |
| ARTICLE | 10,000 chars | Deep-dive analysis |

#### Writing / publishing (editor/admin)

```
/admin page (editor+ only)
  → CMS form: title, slug, excerpt, body, category, type, is_premium
  → ImageUpload → POST /api/upload → stored in R2 or public/uploads
  → POST /api/posts → validates CreatePostSchema → saves to DB
  → status: 'draft' by default
  → Editor sets status: 'published' → published_at is set to now
  → Post appears in feed immediately
```

---

### 5.3 Price Predictor Workflow

The predictor is entirely **TypeScript-only, no Python sidecar required**. It runs inside Next.js serverless functions.

```
User opens /premium/predictor
  → Session check → must be Pro → else PredictorPaywall shown
  → PredictorClient renders with commodity/state/market filters

User selects commodity (e.g. "Wheat") + state + market
  → GET /api/predictor/forecast?commodity=wheat&state=Punjab&days=30&horizon=14
    → usersAdapter re-validates from DB (isPremiumFresh check)
    → forecastingEngine.forecast(query):

        1. LOAD: loadRecords()
           → Tries snapshot DB first
           → Falls back to Agmarknet API (data.gov.in) via parallel page fetches
           → Up to 10 pages × 500 records = 5,000 records fetched in ~500ms

        2. PREPROCESS: buildTimeSeries()
           → Cleans nulls, normalises commodity names
           → Imputes missing dates
           → Filters to requested commodity + market

        3. CHAMPION/CHALLENGER: runChampionChallenger()
           → Trains 4 models on 80% of history:
             - GBRT (Gradient Boosted Regression Trees) — main challenger
             - Holt-Winters (triple exponential smoothing) — seasonal baseline
             - Seasonal Naive — weekly pattern baseline
             - SMA (Simple Moving Average) — trend baseline
           → Rolling-origin cross-validation
           → Winner selected by lowest SMAPE

        4. FORECAST: getChampionForecast(champion, horizon)
           → Generates day-by-day price predictions
           → Each day: { date, predicted_price, lower_bound, upper_bound }

        5. DRIVERS: enrichExplanation()
           → Feature importance from GBRT tree splits
           → Ranked list: season, lag prices, volume, market_spread, etc.
           → Colour-coded positive/negative direction

        6. QUALITY: summarizeQuality()
           → Scores data completeness, recency, coverage
           → Returns High / Medium / Low rating

    → Response cached by Next.js for 1 hour

  → PredictorClient renders:
     - Price chart (historical + forecast band) via Recharts
     - Drivers panel (horizontal importance bars)
     - Quality panel (colour-coded rating)
     - Top markets comparison
     - Day-by-day table with % change vs current

  → AI Explain button → POST /api/ai/forecast-explain
     → Sends forecast data to OpenAI
     → Returns plain-English explanation of forecast drivers
```

---

### 5.4 Search Workflow

Two search modes available from `/search`:

#### Standard search (text-based)

```
User types query
  → GET /api/search?q=wheat+msp
    → Standard mode: MongoDB text index search on (title, excerpt, body, tags)
    → Demo mode: in-memory filter with title/excerpt/tags matching
    → Returns matching posts ordered by relevance score
```

#### AI semantic search (Pro only)

```
User types query + is Pro subscriber
  → POST /api/ai-search { query }
    → Gate check: isPremiumFresh()
    → semanticSearch(query):
        1. OpenAI embeddings: query → vector
        2. Compare against cached article embeddings (cosine similarity)
        3. Top-K articles retrieved as context
    → OpenAI copilot call with retrieved context + knowledge base
    → Returns: answer, bullet points, follow-up questions, citations
  → SearchInterface renders AI answer card above standard results
```

---

### 5.5 Payments & Subscriptions Workflow

KYC supports Razorpay (primary for India) and Stripe (fallback). Controlled by env vars — whichever is configured wins.

#### Subscribe flow

```
User clicks "Get Pro" / "Subscribe from ₹499/mo"
  → /subscribe page → shows plan options (monthly ₹499, annual ₹5,000)
  → User clicks Subscribe
    → POST /api/payment/checkout { plan: 'monthly' | 'annual' }
      → getPaymentProvider() decides Razorpay or Stripe

      [Razorpay hosted link mode]
        → Redirect to pre-configured Razorpay payment link URL
        → Razorpay handles payment + sends webhook

      [Razorpay API mode]
        → razorpay.paymentLinks.create({ amount, description })
        → Return { url } → client redirects

      [Stripe mode]
        → stripe.checkout.sessions.create({ price_id, customer })
        → Return { url } → client redirects

  User completes payment on provider's page
  → Webhook fires: POST /api/payment/webhook (Stripe) or /api/payment/razorpay/webhook
    → Verify signature (HMAC)
    → Find user by email / customer ID
    → usersAdapter.update(userId, {
        role: 'premium',
        subscription: { status: 'active', plan, expires_at, payment_ref }
      })
  → User redirected to /subscribe/success
  → On next page load, getServerSession() reads updated JWT
    (user may need to log out + in to get fresh JWT reflecting new role)
```

#### Manage subscription

```
/api/payment/portal (Stripe only)
  → stripe.billingPortal.sessions.create({ customer_id })
  → Redirect to Stripe Customer Portal for cancellation / plan change
```

---

### 5.6 Admin / CMS Workflow

```
Editor or Admin visits /admin
  → Session gate: isEditor(session) → else redirect to /login
  → CMS form renders with all fields

Create post:
  → Fill title → auto-generates slug
  → Write body (markdown supported)
  → Upload hero image → POST /api/upload → R2 or local
  → Set type (SHORT / STORY / ARTICLE), category, is_premium
  → POST /api/posts → CreatePostSchema validation → save to DB

Edit post:
  → PATCH /api/posts/[slug] → PatchPostSchema (partial update)

Publish:
  → status → 'published' → published_at set to current timestamp
  → Post appears immediately in all feeds

Archive:
  → status → 'archived' → removed from public feeds
```

---

### 5.7 Mandi Widget Workflow

The Mandi Widget appears on the homepage and shows live prices from India's wholesale markets.

```
Feed renders MandiWidget (wrapped in Suspense)
  → MandiWidget is an async server component
  → Calls mandiEngine.fetchRecords() with no filters
    → GET https://api.data.gov.in/resource/9ef84268... 
    → Fetches up to 10 pages in parallel (500 records/page)
    → Each page cached by Next.js fetch cache for 24 hours
  → Groups records by commodity
  → Shows top commodities with modal price + % change
  → If Agmarknet API fails → shows fallback static prices
  → Suspense fallback: blank card skeleton while loading
  → Ticker on page top also pulls from this same API via the posts adapter
```

---

## 6. Database Schema

### Post

```
{
  _id:               ObjectId
  type:              'SHORT' | 'STORY' | 'ARTICLE'
  title:             string (max 300)
  slug:              string (unique)
  excerpt:           string (max 500)
  body:              string (markdown)
  tags:              string[]
  category:          string
  author:            string (display name)
  author_id:         string (user _id)
  hero_image:        string | null (URL)
  inline_images:     string[]
  is_premium:        boolean
  linked_article_id: string | null (SHORT → ARTICLE link)
  status:            'draft' | 'published' | 'archived'
  published_at:      Date | null
  view_count:        number
  img:               string (emoji label for PostThumb fallback)
  search_text:       string (pre-built for Atlas Search)
  created_at:        Date
  updated_at:        Date
}
```

Indexes: `slug` (unique), `{ status, published_at }`, `{ type, status }`, `tags`, `{ is_premium, status }`, full-text on title/excerpt/body/tags.

### User

```
{
  _id:                ObjectId
  name:               string
  email:              string (unique, lowercase)
  mobile:             string | null
  password_hash:      string | null (null for Google-only accounts)
  auth_methods:       ('email' | 'google')[]
  role:               'reader' | 'premium' | 'editor' | 'admin'
  stripe_customer_id: string | null

  subscription: {
    status:                  'active' | 'expired' | 'cancelled' | 'none'
    plan:                    'free' | 'monthly' | 'annual'
    started_at:              Date | null
    expires_at:              Date | null
    payment_ref:             string | null
    stripe_subscription_id:  string | null
  }

  created_at: Date
  updated_at: Date
}
```

### Contact

```
{
  name:       string
  email:      string
  subject:    string
  message:    string
  created_at: Date
}
```

---

## 7. API Route Map

### Auth

| Method | Route | Auth required | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | None | Email + password login |
| POST | `/api/auth/register` | None | Create account |
| POST | `/api/auth/logout` | None | Clear cookie |
| GET | `/api/auth/google` | None | Google OAuth callback |
| POST | `/api/auth/otp/request` | None | Send email OTP |
| POST | `/api/auth/otp/verify` | None | Verify OTP |
| GET | `/api/auth/session` | Cookie | Return current session |
| POST | `/api/auth/refresh` | Cookie | Refresh JWT |

### Posts

| Method | Route | Auth required | Purpose |
|---|---|---|---|
| GET | `/api/posts` | None | List published posts |
| POST | `/api/posts` | Editor+ | Create post |
| GET | `/api/posts/[slug]` | Optional | Get post + access gate |
| PATCH | `/api/posts/[slug]` | Editor+ | Update post |
| DELETE | `/api/posts/[slug]` | Admin | Delete post |
| GET | `/api/posts/feed` | None | Feed endpoint (paginated) |

### Predictor

| Method | Route | Auth required | Purpose |
|---|---|---|---|
| GET | `/api/predictor/forecast` | Pro | Price forecast |
| GET | `/api/predictor/history` | Pro | Historical price data |
| GET | `/api/predictor/insights` | Pro | Market insights |
| GET | `/api/predictor/options` | Pro | Available commodities/markets |
| GET | `/api/predictor/summary` | Pro | Quick summary card |
| GET | `/api/predictor/status` | Pro | Service health |

### AI

| Method | Route | Auth required | Purpose |
|---|---|---|---|
| POST | `/api/ai-search` | Pro | Semantic AI search |
| POST | `/api/ai/copilot` | Pro | Conversational AI assistant |
| POST | `/api/ai/summarize` | Pro | Article summarization |
| POST | `/api/ai/forecast-explain` | Pro | Plain-English forecast explanation |
| POST | `/api/ai/personalize` | Pro | Personalised content ranking |

### Payments

| Method | Route | Auth required | Purpose |
|---|---|---|---|
| POST | `/api/payment/checkout` | Reader+ | Start payment session |
| GET | `/api/payment/portal` | Pro | Stripe billing portal |
| POST | `/api/payment/webhook` | Stripe signature | Stripe payment events |
| POST | `/api/payment/razorpay/webhook` | Razorpay signature | Razorpay payment events |

---

## 8. Environment Variables

Stored in `.env.local` locally or in Vercel Dashboard → Settings → Environment Variables.

### Required for production

```env
# Auth (REQUIRED)
JWT_SECRET=any-long-random-string-32-chars-min

# Database (REQUIRED — without this, app runs in demo/ephemeral mode)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/kyc?retryWrites=true
```

### Payments (one of these required for paid subscriptions)

```env
# Razorpay (recommended for India)
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
RAZORPAY_PAYMENT_LINK_URL=https://rzp.io/l/xxx   # optional hosted link

# Stripe (Western markets / fallback)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_MONTHLY=price_xxx
STRIPE_PRICE_ANNUAL=price_xxx
```

### Optional features

```env
# AI features (without this, AI search/copilot return graceful fallback)
OPENAI_API_KEY=sk-xxx

# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# Email OTP + contact form
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=editor@kyc.news

# Cloudflare R2 image storage (without this, uploads go to public/)
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET=kyc-media
R2_PUBLIC_URL=https://media.kycagri.com

# Public site config
NEXT_PUBLIC_BASE_URL=https://kycagri.com
NEXT_PUBLIC_SITE_NAME=Know Your Commodity
```

---

## 9. Demo vs Production Mode

The app detects its mode via `env.IS_DEMO = !MONGODB_URI`.

| Feature | Demo mode (no MongoDB) | Production mode (MongoDB set) |
|---|---|---|
| Posts | Pre-seeded fake articles from `mocks/data.ts` | Real articles from MongoDB |
| User accounts | In-memory — reset on cold start | Persistent in MongoDB |
| Demo logins | `admin@kyc.news / admin123` etc. work always | Same seeds can be manually created |
| New registrations | Work temporarily, lost on restart | Fully persistent |
| Login/Register UI | Shows amber warning banner | No banner |
| Predictor | Fetches live Agmarknet data | Same |
| Mandi Widget | Fetches live Agmarknet data | Same |

---

## 10. Deployment Guide

### First-time setup on Vercel

1. Push code to GitHub (`happyhnyb/ap1`)
2. Import repo on vercel.com → **New Project**
3. Set **Root Directory** = `kyc-platform-merged` (critical — the Next.js app is in a subdirectory)
4. Framework: Next.js (auto-detected)
5. Add environment variables (at minimum `JWT_SECRET` + `MONGODB_URI`)
6. Deploy

### Subsequent deploys

Every `git push origin main` triggers an automatic Vercel deployment. No manual action needed.

### MongoDB Atlas setup (free tier)

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) → create free M0 cluster
2. Database Access → Add user with password
3. Network Access → Allow `0.0.0.0/0` (Vercel IPs are dynamic)
4. Connect → Drivers → copy connection string
5. Replace `<password>` with your DB user password
6. Add to Vercel: `MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/kyc`
7. Vercel auto-redeploys with the new var active

---

## 11. Local Development

```bash
# Clone repo
git clone git@github.com:happyhnyb/ap1.git
cd ap1/kyc-platform-merged

# Install dependencies
npm install

# Create local env file
cp .env.example .env.local
# Edit .env.local — at minimum set JWT_SECRET
# MONGODB_URI is optional locally; app runs with mock data without it

# Start dev server
npm run dev
# → http://localhost:3000

# Run tests
npm test

# Type check
npm run typecheck

# Seed database (if MongoDB is connected)
npm run seed
```

### Demo accounts (always work, no DB needed)

| Email | Password | Role |
|---|---|---|
| admin@kyc.news | admin123 | Admin (full CMS access) |
| reader@kyc.news | reader123 | Premium Pro subscriber |
| free@kyc.news | free123 | Free reader |

---

## Key Design Decisions

**Dual adapter pattern** — `lib/adapters/` wraps all DB access. When `MONGODB_URI` is absent, every call falls through to in-memory arrays. This means the entire platform runs in demo mode with zero external dependencies for local dev or demos.

**No Python** — The forecasting engine (GBRT, Holt-Winters, backtesting) is entirely TypeScript. This keeps the deployment simple — one Vercel project, no separate ML service to manage or scale.

**Suspense streaming** — Slow external calls (Agmarknet API, Ticker DB fetch, MandiWidget) are wrapped in `<Suspense>` so the page shell renders immediately. The slow parts stream in independently, giving a fast perceived load time.

**JWT + DB re-validation** — JWTs are read from cookies for fast session checks in UI. For premium API routes (predictor, AI), the server re-fetches the user from DB (`isPremiumFresh`) to catch subscription changes between token issuance and expiry.

**Progressive enhancement animations** — `AnimationProvider` only enables scroll-reveal CSS classes after JS loads, so content is always visible without JavaScript. Respects `prefers-reduced-motion`.
