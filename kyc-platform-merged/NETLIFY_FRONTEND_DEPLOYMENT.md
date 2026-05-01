# Netlify Frontend Deployment

Target production split:

- `kycagri.com` -> Netlify frontend
- `www.kycagri.com` -> Netlify frontend
- `api.kycagri.com` -> Mac Mini backend through Cloudflare Tunnel

Keep this strict:

- Do not point `kycagri.com` or `www.kycagri.com` to the Mac Mini tunnel.
- Do not add `api.kycagri.com` as the frontend production domain.
- Keep the Mac Mini as the backend API origin only.

## Repo Status

This repo is already compatible with Netlify's Next.js adapter:

- `netlify.toml` uses `npm run build`
- `@netlify/plugin-nextjs` is enabled
- the frontend can continue calling `https://api.kycagri.com` server-side

## Netlify Site Setup

1. Log in to Netlify with your own browser session.
2. Create a new site from your Git provider.
3. Select this repo.
4. Confirm the build settings:

```txt
Base directory: (leave empty)
Build command: npm run build
Publish directory: .next
```

5. Before the first production deploy, set these environment variables in Netlify:

```dotenv
NEXT_PUBLIC_SITE_URL=https://kycagri.com
NEXT_PUBLIC_BASE_URL=https://kycagri.com
MAC_MINI_API_BASE_URL=https://api.kycagri.com
INTERNAL_API_KEY=<same value used on the Mac Mini>
```

Optional but likely needed depending on enabled features:

```dotenv
AUTH_SECRET=...
JWT_SECRET=...
OPENAI_API_KEY=...
DATAGOV_API_KEY=...
R2_ENDPOINT=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_URL=...
```

After saving env vars, trigger a fresh deploy.

## Netlify Domains

In Netlify site settings, add:

- `kycagri.com`
- `www.kycagri.com`

Use the exact DNS targets Netlify shows for your site. Netlify may provide different values depending on the account and setup, so treat the dashboard as the source of truth.

## Cloudflare DNS

Desired DNS state:

- `api` -> `CNAME` -> `0773476c-40e6-49ed-b89d-b68be819ed2a.cfargotunnel.com` -> proxied
- `@` -> whatever Netlify tells you to use for the apex domain
- `www` -> whatever Netlify tells you to use for the `www` domain

Remove stale records for:

- `@`
- `www`

Especially remove any old records pointing `@` or `www` at:

- the Mac Mini tunnel
- an old hosting provider
- a dead origin that Cloudflare still proxies

## Why The Current 502 Happens

If Cloudflare sends `kycagri.com` or `www.kycagri.com` to the Mac Mini tunnel and that machine is down, Cloudflare returns `502` before the app can render any fallback UI.

Moving the frontend to Netlify fixes that:

- Netlify keeps the public site live
- the app can still use the bundled article snapshot fallback
- the Mac Mini remains the main live backend source for content and APIs

## Verification

After DNS propagates, these should succeed:

```bash
curl -I https://kycagri.com
curl -I https://www.kycagri.com
curl -I https://api.kycagri.com/api/health
```

Expected result:

- `kycagri.com` and `www.kycagri.com` return frontend responses from Netlify
- `api.kycagri.com` continues to hit the Mac Mini backend
