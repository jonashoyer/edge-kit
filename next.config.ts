import type { NextConfig } from 'next';

const config = {
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
} satisfies NextConfig;

export default config;
