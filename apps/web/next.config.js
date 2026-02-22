/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@trivora/core', '@trivora/supabase', '@trivora/ui'],
  reactStrictMode: true,
};

module.exports = nextConfig;
