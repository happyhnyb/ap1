/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output only for Docker — Vercel/Netlify handle bundling themselves
  ...(process.env.DOCKER_BUILD === 'true' ? { output: 'standalone' } : {}),

  eslint: {
    // Vercel/Next lint execution is currently tripping over a circular flat-config
    // serialization issue. Keep deploys unblocked and rely on explicit lint/typecheck runs.
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.cloudflare.com' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Custom R2 public domain — set R2_PUBLIC_URL in env
      ...(process.env.R2_PUBLIC_URL
        ? (() => { try { return [{ protocol: 'https', hostname: new URL(process.env.R2_PUBLIC_URL).hostname }]; } catch { return []; } })()
        : []),
    ],
  },

  // Keep server-only packages out of the client bundle
  serverExternalPackages: ['mongoose', 'bcryptjs'],

  // ── Security headers ──────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options',        value: 'DENY' },
          // Stop MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Minimal referrer leak
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          // Restrict browser feature access
          { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // Force HTTPS in production (1 year, include subdomains)
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
            : []),
        ],
      },
    ];
  },

  // ── Redirects ─────────────────────────────────────────────────
  async redirects() {
    return [
      // Redirect bare /admin to login if accessed directly (belt-and-suspenders)
      // Actual auth check is server-side in the page component
    ];
  },
};

export default nextConfig;
