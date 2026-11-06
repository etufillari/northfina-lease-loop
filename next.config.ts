import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(process.env.LEASE_LOOP_DEMO_HOST
    ? { allowedDevOrigins: [process.env.LEASE_LOOP_DEMO_HOST] }
    : {}),
};

export default nextConfig;
