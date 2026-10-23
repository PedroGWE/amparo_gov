/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: process.env.STANDALONE_BUILD === 'true' ? 'standalone' : undefined,
  async rewrites() {
    const icons = {
      '/favicon.ico': '/brand/educa/favicon.ico',
      '/apple-touch-icon.png': '/brand/educa/apple-touch-icon.png',
      '/site.webmanifest': '/brand/educa/site.webmanifest',
    }
    return {
      beforeFiles: Object.entries(icons).map(([source, destination]) => ({
        source,
        destination,
        has: [{ type: 'host', value: 'educa.amparogov.org' }],
      })),
    }
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
  },
}

module.exports = nextConfig
