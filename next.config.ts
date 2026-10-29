import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // The Docker image (Dockerfile) runs Next's minimal standalone server. Vercel
    // builds without it, as before.
    output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
    cacheComponents: true,
    partialPrefetching: true,
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
