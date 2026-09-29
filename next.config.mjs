/**
 * Static export for free hosting on GitHub Pages.
 * NEXT_PUBLIC_BASE_PATH is set by the GitHub workflow to "/<repo-name>" (empty for <user>.github.io repos).
 * @type {import('next').NextConfig}
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
