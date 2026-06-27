import { createHmac, timingSafeEqual, createHash } from "crypto";

type InvitePayload = {
  shopId: string;
  email: string;
  role: "staff" | "owner";
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSecret(): string {
  const secret = process.env.STAFF_INVITE_SECRET;
  if (secret && secret.trim()) return secret;

  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return "dev-staff-invite-secret";
  }

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fallback) {
    return createHash("sha256").update("klip-staff-invite-v1:" + fallback).digest("hex");
  }

  throw new Error("Missing STAFF_INVITE_SECRET in production environment");
}

function sign(raw: string): string {
  return createHmac("sha256", getSecret()).update(raw).digest("base64url");
}

export function createStaffInviteToken(input: { shopId: string; email: string; role: "staff" | "owner"; expiresInHours?: number }): string {
  const payload: InvitePayload = {
    shopId: input.shopId,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    exp: Date.now() + (input.expiresInHours ?? 72) * 60 * 60 * 1000,
  };
  const rawPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(rawPayload);
  return `${rawPayload}.${signature}`;
}

export function verifyStaffInviteToken(token: string): InvitePayload | null {
  const [rawPayload, rawSig] = token.split(".");
  if (!rawPayload || !rawSig) return null;

  const expectedSig = sign(rawPayload);
  const given = Buffer.from(rawSig);
  const expected = Buffer.from(expectedSig);
  if (given.length !== expected.length) return null;
  const sigOk = timingSafeEqual(given, expected);
  if (!sigOk) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(rawPayload)) as InvitePayload;
    if (!payload?.shopId || !payload?.email || !payload?.role || !payload?.exp) return null;
    if (payload.exp <= Date.now()) return null;
    if (payload.role !== "staff" && payload.role !== "owner") return null;
    return payload;
  } catch {
    return null;
  }
}
