/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@trivora/core', '@trivora/supabase'],
  reactStrictMode: true,
};

module.exports = nextConfig;
