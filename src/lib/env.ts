type EnvVar = {
  name: string;
  required: boolean;
  description: string;
};

const VARS: EnvVar[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true, description: "Supabase project URL" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, description: "Supabase anonymous key" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", required: true, description: "Supabase service role key (admin)" },
  { name: "NEXT_PUBLIC_SITE_URL", required: true, description: "Public site URL" },
  { name: "NEXT_PUBLIC_BASE_URL", required: true, description: "Base URL for API calls" },
  { name: "MP_ACCESS_TOKEN", required: true, description: "Mercado Pago access token" },
  { name: "MP_WEBHOOK_SECRET", required: true, description: "Secret for webhook HMAC validation" },
  { name: "NEXT_PUBLIC_MP_PUBLIC_KEY", required: true, description: "Mercado Pago public key" },
  { name: "MP_OAUTH_CLIENT_ID", required: true, description: "Mercado Pago OAuth client ID" },
  { name: "MP_OAUTH_CLIENT_SECRET", required: true, description: "Mercado Pago OAuth client secret" },
  { name: "MP_OAUTH_STATE_SECRET", required: true, description: "Secret for OAuth state param" },
  { name: "RESEND_API_KEY", required: false, description: "Resend API key for transactional emails" },
  { name: "RESEND_FROM_EMAIL", required: false, description: "Sender email for transactional emails" },
  { name: "STAFF_INVITE_SECRET", required: false, description: "Secret for staff invite tokens" },
  { name: "CRON_SECRET", required: false, description: "Secret for cron job authentication" },
  { name: "NEXT_PUBLIC_SENTRY_DSN", required: false, description: "Sentry DSN for error tracking" },
  { name: "UPSTASH_REDIS_REST_URL", required: false, description: "Upstash Redis URL (rate limiting)" },
  { name: "UPSTASH_REDIS_REST_TOKEN", required: false, description: "Upstash Redis token" },
  { name: "RECAPTCHA_SECRET_KEY", required: false, description: "reCAPTCHA server-side key" },
  { name: "NEXT_PUBLIC_RECAPTCHA_SITE_KEY", required: false, description: "reCAPTCHA client-side key" },
];

export function validateEnv(): void {
  const missing: EnvVar[] = [];

  for (const v of VARS) {
    if (v.required && !process.env[v.name]) {
      missing.push(v);
    }
  }

  if (missing.length > 0) {
    const msg = missing.map((v) => `  - ${v.name}: ${v.description}`).join("\n");
    console.error(
      `[env] ${missing.length} required environment variable(s) missing:\n${msg}\n\n` +
        "The application may not function correctly. Set these in your .env.local or deployment environment.",
    );

    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Missing required environment variables: ${missing.map((v) => v.name).join(", ")}`,
      );
    }
  }

  const optionalMissing = VARS.filter((v) => !v.required && !process.env[v.name]);
  if (optionalMissing.length > 0) {
    console.warn(
      `[env] ${optionalMissing.length} optional environment variable(s) not set:`,
      optionalMissing.map((v) => v.name).join(", "),
    );
  }

  console.info("[env] Validation complete");
}
