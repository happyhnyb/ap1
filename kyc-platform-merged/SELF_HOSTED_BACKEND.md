# Self-Hosted Backend Setup

This app can run with:
- Vercel for the public frontend
- Mac Mini for backend APIs, auth, articles, AI, predictor
- PostgreSQL with its data directory on an external SSD

## Recommended SSD paths

```bash
/Volumes/YOUR_SSD_NAME/kycagri-data
/Volumes/YOUR_SSD_NAME/kycagri-data/postgres
/Volumes/YOUR_SSD_NAME/kycagri-data/media
```

The app checks that these paths exist under `/Volumes`. It should fail loudly if the SSD is not mounted.

## 1. Prepare directories on the Mac Mini

```bash
mkdir -p /Volumes/YOUR_SSD_NAME/kycagri-data/postgres
mkdir -p /Volumes/YOUR_SSD_NAME/kycagri-data/media
```

## 2. Set environment

Create `.env.local` with at least:

```dotenv
NODE_ENV=production
LOCAL_SERVER_PORT=3000
NEXT_PUBLIC_SITE_URL=https://kycagri.com
APP_BASE_URL=https://kycagri.com
API_BASE_URL=https://api.kycagri.com
COOKIE_DOMAIN=.kycagri.com
DATABASE_URL=postgresql://kyc_app:change_me@127.0.0.1:5432/kyc_platform
JWT_SECRET=replace_me
AUTH_SECRET=replace_me
INTERNAL_API_KEY=replace_me
KYC_STORAGE_ROOT=/Volumes/YOUR_SSD_NAME/kycagri-data
POSTGRES_DATA_PATH=/Volumes/YOUR_SSD_NAME/kycagri-data/postgres
MEDIA_STORAGE_PATH=/Volumes/YOUR_SSD_NAME/kycagri-data/media
MANDI_SERVICE_URL=http://localhost:4000
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

## 3. Run PostgreSQL with Docker on the SSD

```bash
docker run -d \
  --name kyc-postgres \
  --restart unless-stopped \
  -e POSTGRES_DB=kyc_platform \
  -e POSTGRES_USER=kyc_app \
  -e POSTGRES_PASSWORD=change_me \
  -p 5432:5432 \
  -v /Volumes/YOUR_SSD_NAME/kycagri-data/postgres:/var/lib/postgresql/data \
  postgres:16
```

## 4. Install app dependencies

```bash
cd ~/ap1/kyc-platform-merged
npm install
npm run mandi:install
```

## 5. Run database migrations

```bash
npm run db:migrate
npm run db:seed-taxonomy
ADMIN_NAME="Your Name" ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="strong-password" npm run db:seed-admin
```

## 6. Build and start

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

## 7. Health checks

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/health/db
curl http://localhost:3000/api/health/storage
curl https://api.kycagri.com/api/auth/me
```

## Vercel frontend env vars

```dotenv
NEXT_PUBLIC_SITE_URL=https://kycagri.com
MAC_MINI_API_BASE_URL=https://api.kycagri.com
INTERNAL_API_KEY=the_same_internal_key_as_mac_mini
```

Redeploy Vercel after changing those env vars.
