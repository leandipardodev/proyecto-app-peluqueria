import { readFile } from "node:fs/promises";

const checks = [
  {
    event: "trial_started",
    path: "src/lib/dashboard/auth-actions.ts",
  },
  {
    event: "first_staff_added",
    path: "src/lib/dashboard/staff-actions.ts",
  },
  {
    event: "first_service_published",
    path: "src/lib/dashboard/service-actions.ts",
  },
  {
    event: "first_booking_confirmed",
    path: "src/lib/dashboard/appointment-actions.ts",
  },
  {
    event: "subscription_paid",
    path: "src/app/api/payments/mercadopago-webhook/route.ts",
  },
  {
    event: "subscription_canceled",
    path: "src/app/api/cron/billing-expiry/route.ts",
  },
];

let hasErrors = false;

for (const check of checks) {
  const content = await readFile(check.path, "utf8");
  if (!content.includes(check.event)) {
    hasErrors = true;
    console.error(`Missing event '${check.event}' in ${check.path}`);
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log("Product events instrumentation check passed");
