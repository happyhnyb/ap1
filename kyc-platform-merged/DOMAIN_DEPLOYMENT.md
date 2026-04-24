# Domain Deployment Checklist

Target production split:

- `kycagri.com` -> Vercel frontend
- `www.kycagri.com` -> Vercel frontend
- `api.kycagri.com` -> Mac Mini backend through Cloudflare Tunnel

Keep this rule strict:

- Do not add `api.kycagri.com` to Vercel.
- Do not point `kycagri.com` or `www.kycagri.com` at the Cloudflare Tunnel.
- Do not expose Ollama directly.

Tunnel source of truth:

- Tunnel UUID: `0773476c-40e6-49ed-b89d-b68be819ed2a`
- Tunnel target CNAME: `0773476c-40e6-49ed-b89d-b68be819ed2a.cfargotunnel.com`

## 1. Vercel Dashboard Steps

Use Vercel's domain instructions as the source of truth for `@` and `www`, because Vercel may show different record targets depending on project and setup.

In Vercel:

1. Open the Vercel dashboard.
2. Select the correct KYC frontend project.
3. Go to `Settings -> Domains`.
4. Add these domains to the project:
   - `kycagri.com`
   - `www.kycagri.com`
5. Let Vercel inspect the domains and show the exact required DNS records.
6. Copy the exact records Vercel requests for `@` and `www`.
7. After DNS is updated in Cloudflare, come back to Vercel and confirm both domains show as connected.

Important:

- If Vercel shows `DEPLOYMENT_NOT_FOUND`, the domain is usually either not attached to the correct project or DNS is pointing at the wrong Vercel target.
- If the domain was attached to an old Vercel project, remove it there first and then add it to the correct project.

## 2. Cloudflare DNS Records To Check

Desired DNS state:

- `api` -> `CNAME` -> `0773476c-40e6-49ed-b89d-b68be819ed2a.cfargotunnel.com` -> proxied
- `@` -> whatever Vercel tells you to create for the apex domain
- `www` -> whatever Vercel tells you to create for the `www` domain

In Cloudflare DNS:

1. Keep `api` pointing to the tunnel CNAME.
2. Add or update `@` exactly as Vercel instructs.
3. Add or update `www` exactly as Vercel instructs.
4. Remove stale or conflicting records for:
   - `@`
   - `www`
   - `api`

Common conflicts to remove:

- old A records for `@`
- old CNAME records for `www`
- any `api` record pointing anywhere except the tunnel hostname
- duplicate records with the same name but different targets

## 3. Vercel Environment Variables

Set these in the Vercel project:

```dotenv
NEXT_PUBLIC_SITE_URL=https://kycagri.com
MAC_MINI_API_BASE_URL=https://api.kycagri.com
INTERNAL_API_KEY=<same value as the Mac Mini .env.local, server-side only>
```

Notes:

- `INTERNAL_API_KEY` must be configured only in Vercel server envs, never in browser/client code.
- After adding or changing env vars in Vercel, redeploy the project.

## 4. How Frontend Calls Should Work

The browser should call Vercel routes such as:

- `/api/ai/summarize`
- `/api/ai/forecast-explain`

Those routes run server-side and, when `MAC_MINI_API_BASE_URL` is set, they forward the request to the Mac Mini backend and attach `x-internal-api-key`.

This keeps:

- the browser off protected Mac Mini endpoints
- `INTERNAL_API_KEY` off the client
- Ollama hidden behind the Mac Mini backend

## 5. CLI Verification Commands

Use these after DNS updates:

```bash
curl https://api.kycagri.com/api/health
dig CNAME api.kycagri.com +short
dig A kycagri.com +short
dig CNAME www.kycagri.com +short
```

Expected:

- `api.kycagri.com` resolves toward `0773476c-40e6-49ed-b89d-b68be819ed2a.cfargotunnel.com`
- `kycagri.com` resolves according to Vercel's domain instructions
- `www.kycagri.com` resolves according to Vercel's domain instructions
- `https://kycagri.com` loads the frontend instead of the Vercel `DEPLOYMENT_NOT_FOUND` page

Optional HTTPS checks:

```bash
curl -I https://kycagri.com
curl -I https://www.kycagri.com
curl -I https://api.kycagri.com/api/health
```

## 6. If `kycagri.com` Still Shows `DEPLOYMENT_NOT_FOUND`

Check these in order:

1. Confirm `kycagri.com` is added to the correct Vercel project.
2. Confirm `www.kycagri.com` is added to the same Vercel project.
3. In Cloudflare DNS, remove stale `@` and `www` records that do not match Vercel's instructions.
4. Confirm `api.kycagri.com` is not accidentally added to Vercel.
5. Confirm `kycagri.com` is not pointed at the tunnel hostname.
6. Redeploy the Vercel project after env changes.
7. Wait for DNS propagation, then test again.

If it still fails after that, the most likely cause is that the domain is attached to the wrong Vercel project or to an old deleted deployment target.
