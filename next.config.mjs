import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs";
import workboxBuild from "workbox-build";

const isDev = process.env.NODE_ENV === "development";

const cacheOkOnly = [new workboxBuild.CacheableResponsePlugin({ statuses: [0, 200] })];

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /^https?:\/\/[^\/]*\/api\//i,
        handler: "NetworkFirst",
        options: {
          cacheName: "api-calls",
          networkTimeoutSeconds: 5,
          plugins: cacheOkOnly,
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 60 * 60,
          },
        },
      },
      {
        urlPattern: /^https?:\/\/[^\/]*\/dashboard(\/.*)?$/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "dashboard-pages",
          networkTimeoutSeconds: 8,
          plugins: cacheOkOnly,
          expiration: {
            maxEntries: 16,
            maxAgeSeconds: 6 * 60 * 60,
          },
        },
      },
      {
        urlPattern: /\.(?:js|css|woff2|png|jpg|jpeg|svg|webp|ico)$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-assets",
          plugins: cacheOkOnly,
          expiration: {
            maxEntries: 128,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline' https:${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mercadopago.com https://sdk.mercadopago.com https://*.mercadopago.com https://*.ingest.sentry.io https://*.sentry.io",
      "frame-src 'self' https://www.mercadopago.com https://sdk.mercadopago.com https://*.mercadopago.com",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

const sentryWebpackPluginOptions = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
};

export default withSentryConfig(withPWA(nextConfig), sentryWebpackPluginOptions);
