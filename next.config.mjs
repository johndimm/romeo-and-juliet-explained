/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Only enable static export when BUILD_STATIC is set to 'true'
  // This allows building for both Vercel (with API routes) and Android (static export)
  ...(process.env.BUILD_STATIC === 'true' ? { output: 'export' } : {}),
};

export default nextConfig;

