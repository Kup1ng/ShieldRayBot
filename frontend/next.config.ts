import type { NextConfig } from "next";

/*
 * Production: a static export that FastAPI serves. HTML pages are returned by FastAPI
 * routes (so they get the CSP nonce, auth checks and no-store headers) and every other
 * file lives under /static/spa (see scripts/sync-export.mjs).
 *
 * Development: `next dev` proxies the backend API so screens run against real data.
 */
const isDev = process.env.NODE_ENV === "development";
const backend = process.env.SHIELDRAY_BACKEND_URL || "http://127.0.0.1:8000";

export const ASSET_PREFIX = "/static/spa";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_ASSET_PREFIX: isDev ? "" : ASSET_PREFIX,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  ...(isDev
    ? {
        async rewrites() {
          return {
            // Panel actions post the backend's own form routes (some share a page's path).
            beforeFiles: [
              {
                source: "/:path*",
                has: [{ type: "header" as const, key: "x-panel-fetch", value: "1" }],
                destination: `${backend}/:path*`,
              },
            ],
            afterFiles: [
              { source: "/api/:path*", destination: `${backend}/api/:path*` },
              { source: "/media/:path*", destination: `${backend}/media/:path*` },
              { source: "/static/:path*", destination: `${backend}/static/:path*` },
              { source: "/help/:path*", destination: `${backend}/help/:path*` },
            ],
            fallback: [],
          };
        },
      }
    : {
        output: "export" as const,
        assetPrefix: ASSET_PREFIX,
      }),
};

export default nextConfig;
