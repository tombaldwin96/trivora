/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@mahan/core', '@mahan/supabase', '@mahan/ui'],
  reactStrictMode: true,
};

module.exports = nextConfig;
