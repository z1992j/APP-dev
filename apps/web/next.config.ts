import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    // In Docker, use service name 'server'; fallback to NEXT_PUBLIC_API_BASE or localhost for dev
    const backend = process.env.INTERNAL_API_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default config;
