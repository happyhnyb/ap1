/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.cloudflare.com' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  // Ensure server-only packages are not bundled into the client
  serverExternalPackages: ['mongoose', 'bcryptjs'],
};

export default nextConfig;
