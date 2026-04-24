# KYC Platform Mac Mini Server Setup

This repo can run as a local production backend on your Mac Mini while the public frontend stays on Vercel.

Recommended split:

- Vercel: public frontend and user-facing pages
- Mac Mini: Next.js backend, local AI summary routes, predictor APIs, ingestion jobs
- Cloudflare Tunnel: secure HTTPS entrypoint to selected Mac Mini routes

## 1. Local Production Env

Create a private env file and keep it off Git:

```bash
cp .env.example .env.local
```

Set at least these values:

```dotenv
NODE_ENV=production
LOCAL_SERVER_PORT=3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
INTERNAL_API_KEY=replace_me_with_a_long_random_value
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
MONGODB_URI=...
JWT_SECRET=...
DATAGOV_API_KEY=...
CRON_SECRET=...
MANDI_SERVICE_URL=http://localhost:4000
```

Generate a strong internal key:

```bash
openssl rand -hex 32
```

## 2. Install And Build

Run these from the repo root:

```bash
npm install
npm run mandi:install
npm run build
```

Production start command for the Next app:

```bash
npm start
```

Predictor sidecar start command:

```bash
npm run mandi:start
```

## 3. Run With PM2

Install PM2 globally:

```bash
npm install -g pm2
```

Start the Next.js app and predictor sidecar with the included PM2 config:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs kyc-platform
pm2 logs kyc-predictor
pm2 restart kyc-platform
pm2 restart kyc-predictor
pm2 stop kyc-platform
pm2 delete kyc-platform
```

To restore PM2 on macOS login/boot, PM2 recommends generating a startup script:

```bash
pm2 startup
```

PM2 will print the exact `sudo ... pm2 startup ...` command for your machine. Copy and run that command, then save the process list again:

```bash
pm2 save
```

If you later upgrade Node.js, refresh the startup hook:

```bash
pm2 unstartup
pm2 startup
pm2 save
```

## 4. Keep Cloudflare Tunnel Running

Install `cloudflared` on macOS:

```bash
brew install cloudflared
cloudflared --version
```

Log in to Cloudflare:

```bash
cloudflared tunnel login
```

Create a tunnel:

```bash
cloudflared tunnel create kyc-platform
cloudflared tunnel list
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /Users/<your-mac-user>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: api.kycagri.com
    service: http://localhost:3000
  - service: http_status:404
```

Route your public hostname to the tunnel:

```bash
cloudflared tunnel route dns kyc-platform api.kycagri.com
```

Test the tunnel locally:

```bash
cloudflared tunnel run kyc-platform
```

To install the tunnel as a macOS service:

Run at login:

```bash
cloudflared service install
```

Run at boot:

```bash
sudo cloudflared service install
```

Manual service control:

```bash
sudo launchctl start com.cloudflare.cloudflared
sudo launchctl stop com.cloudflare.cloudflared
```

Cloudflare logs:

```bash
tail -f /Library/Logs/com.cloudflare.cloudflared.out.log
tail -f /Library/Logs/com.cloudflare.cloudflared.err.log
```

## 5. Cloudflare Manual Account Steps

You need to do these in the Cloudflare dashboard yourself:

1. Create or sign in to a Cloudflare account.
2. Add your domain, for example `kycagri.com`, to Cloudflare.
3. Update your registrar nameservers to the Cloudflare nameservers shown in the dashboard.
4. Open Cloudflare Zero Trust and finish the initial team/account setup.
5. After `cloudflared tunnel login`, approve the domain access prompt in the browser.
6. In Zero Trust, create an Access self-hosted application for sensitive paths or subdomains.
7. Point a hostname such as `api.kycagri.com` to your tunnel.
8. Verify that the hostname is proxied through Cloudflare and returns your Mac Mini app over HTTPS.

Recommended protection:

- Keep `api.kycagri.com` for backend APIs only.
- Protect admin/internal endpoints with Cloudflare Access.
- Keep `/api/local-ai/summarize` behind `INTERNAL_API_KEY` even if the tunnel is live.

Good candidates for Cloudflare Access protection:

- `/admin/*`
- `/api/cron/*`
- `/api/internal/*`
- Any future write/admin API you expose on the tunnel

## 6. Vercel Frontend Integration

On Vercel, do not call `localhost`. The frontend must call the Mac Mini through the Cloudflare HTTPS hostname.

Set these Vercel environment variables:

```dotenv
NEXT_PUBLIC_SITE_URL=https://www.your-frontend-domain.com
MAC_MINI_API_BASE_URL=https://api.kycagri.com
INTERNAL_API_KEY=<same value used on the Mac Mini for protected server-to-server calls>
```

Recommended pattern:

- Public pages stay on Vercel.
- Vercel server routes or server actions call `https://api.kycagri.com/...`.
- Only server-side calls should send `x-internal-api-key` for protected Mac Mini endpoints.
- Browser code should never know your `INTERNAL_API_KEY`.

## 7. Health Checks

Local health route:

```bash
curl http://localhost:3000/api/health
```

Expected response shape:

```json
{
  "ok": true,
  "service": "kyc-platform",
  "time": "2026-04-24T00:00:00.000Z",
  "ollama": true,
  "predictor": true
}
```

Protected local AI test:

```bash
curl -X POST http://localhost:3000/api/local-ai/summarize \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: $INTERNAL_API_KEY" \
  -d '{"text":"Soybean prices strengthened while wheat and corn stayed under pressure."}'
```

After the tunnel is live:

```bash
curl https://api.kycagri.com/api/health
```

## 8. Updating The Server

Pull latest code and rebuild:

```bash
git pull origin main
npm install
npm run build
pm2 restart kyc-platform
```

If predictor-side dependencies changed:

```bash
npm run mandi:install
pm2 restart kyc-predictor
```

## 9. Security Notes

- Never expose port `11434` publicly.
- Never expose MongoDB directly to the internet.
- Use Cloudflare Tunnel instead of router port forwarding.
- Keep `INTERNAL_API_KEY`, `JWT_SECRET`, `CRON_SECRET`, and database credentials only in private env files.
- Protect admin and write-capable routes with Cloudflare Access and/or internal API key checks.
- Keep the Mac Mini awake and disable sleep for server hours.
- Turn on the macOS firewall.
- Use a strong Mac login password and enable disk encryption.
- Back up `.env.local` securely because PM2 and Cloudflare depend on it.

## 10. Quick Commands

```bash
npm install
npm run build
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs kyc-platform
```
