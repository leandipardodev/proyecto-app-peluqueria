import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0 : 0.2,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});
