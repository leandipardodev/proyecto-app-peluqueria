import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /^https?.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "pages-and-api",
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
      {
        urlPattern: /\/dashboard(\/.*)?$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "dashboard-pages",
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
      {
        urlPattern: /\.(?:js|css|woff2|png|jpg|jpeg|svg|webp|ico)$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-assets",
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
};

export default withPWA(nextConfig);
