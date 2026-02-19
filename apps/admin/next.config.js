/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@mahan/core', '@mahan/supabase'],
  reactStrictMode: true,
};

module.exports = nextConfig;
