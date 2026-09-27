import "server-only";
import { createHmac, timingSafeEqual, createHash, randomInt, scrypt, randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";

export const PARTNER_SESSION_COOKIE = "klip_partner_session";
export const REFERRAL_CODE_COOKIE = "klip_ref";
const PIN_LENGTH = 6;
const SCRYPT_KEYLEN = 32;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// Freno de login por IP con retroceso exponencial.
const LOCK_STEPS: Array<{ minAttempts: number; ms: number }> = [
  { minAttempts: 15, ms: 24 * 60 * 60 * 1000 },
  { minAttempts: 10, ms: 60 * 60 * 1000 },
  { minAttempts: 5, ms: 5 * 60 * 1000 },
];

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSecret(): string {
  const secret = process.env.REFERRAL_PORTAL_SECRET;
  if (secret && secret.trim()) return secret;

  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return "dev-referral-portal-secret";
  }

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fallback) {
    return createHash("sha256").update("klip-referral-portal-v1:" + fallback).digest("hex");
  }

  throw new Error("Missing REFERRAL_PORTAL_SECRET in production environment");
}

function sign(raw: string): string {
  return createHmac("sha256", getSecret()).update(raw).digest("base64url");
}

// ---------------------------------------------------------------------------
// PIN
// ---------------------------------------------------------------------------

/** Genera un PIN numerico de 6 digitos con entropia criptografica. */
export function generatePin(): string {
  const max = 10 ** PIN_LENGTH;
  return String(randomInt(0, max)).padStart(PIN_LENGTH, "0");
}

export function normalizePin(pin: string): string {
  return pin.replace(/\D/g, "");
}

export function isValidPinShape(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export function pinLast4(pin: string): string {
  return pin.slice(-4);
}

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Devuelve `scrypt:<salt-hex>:<hash-hex>`. El PIN nunca se guarda en claro:
 * la base solo tiene el hash, asi que no se puede recuperar. Si el vendedor
 * lo pierde, el admin regenera uno nuevo.
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(pin, salt);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length !== SCRYPT_KEYLEN) return false;

  const derived = await scryptAsync(pin, salt);
  return timingSafeEqual(derived, expected);
}

// ---------------------------------------------------------------------------
// Sesion
// ---------------------------------------------------------------------------

export type PartnerSession = {
  partnerId: string;
  exp: number;
};

export function createPartnerSessionToken(partnerId: string): string {
  const payload: PartnerSession = {
    partnerId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const rawPayload = base64UrlEncode(JSON.stringify(payload));
  return `${rawPayload}.${sign(rawPayload)}`;
}

export function verifyPartnerSessionToken(token: string | undefined | null): PartnerSession | null {
  if (!token) return null;
  const [rawPayload, rawSig] = token.split(".");
  if (!rawPayload || !rawSig) return null;

  const given = Buffer.from(rawSig);
  const expected = Buffer.from(sign(rawPayload));
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(rawPayload)) as PartnerSession;
    if (!payload?.partnerId || typeof payload.exp !== "number") return null;
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie de atribucion
//
// Va en la cookie del navegador con vida de 30 dias para que sobreviva a que
// el dueño del local se guarde /book/salon en vez del link completo. Va firmada
// para que nadie se la pueda arreglar a mano apuntando a un partner_id falso.
// ---------------------------------------------------------------------------

export function createReferralCookieToken(partnerId: string): string {
  const raw = base64UrlEncode(partnerId);
  return `${raw}.${sign(`ref:${raw}`)}`;
}

export function verifyReferralCookieToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [raw, rawSig] = token.split(".");
  if (!raw || !rawSig) return null;

  const given = Buffer.from(rawSig);
  const expected = Buffer.from(sign(`ref:${raw}`));
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;

  try {
    const partnerId = base64UrlDecode(raw);
    return partnerId || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Freno por IP
// ---------------------------------------------------------------------------

function lockDurationFor(attempts: number): number {
  for (const step of LOCK_STEPS) {
    if (attempts >= step.minAttempts) return step.ms;
  }
  return 0;
}

export async function getIpLockRemainingMs(ip: string): Promise<number> {
  if (!ip) return 0;
  try {
    const admin = await createServiceRoleClient();
    const { data } = await admin
      .from("referral_login_attempts")
      .select("attempts, locked_until")
      .eq("ip", ip)
      .maybeSingle();
    if (!data) return 0;
    const lockedUntil = data.locked_until ? new Date(data.locked_until).getTime() : 0;
    const remaining = lockedUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  } catch {
    // Si no se puede leer el freno, no bloqueamos el acceso: el login igual
    // valida el PIN con scrypt, lo unico que cambia es el freno de fuerza bruta.
    return 0;
  }
}

export async function registerLoginFailure(ip: string): Promise<void> {
  if (!ip) return;
  try {
    const admin = await createServiceRoleClient();
    const { data } = await admin
      .from("referral_login_attempts")
      .select("attempts")
      .eq("ip", ip)
      .maybeSingle();

    const previous = Number(data?.attempts ?? 0);
    const attempts = previous + 1;
    const lockMs = lockDurationFor(attempts);
    const lockedUntil = lockMs > 0 ? new Date(Date.now() + lockMs).toISOString() : null;

    await admin
      .from("referral_login_attempts")
      .upsert(
        { ip, attempts, last_at: new Date().toISOString(), locked_until: lockedUntil },
        { onConflict: "ip" },
      );
  } catch {
    // sin freno persistente, el login sigue funcionando con la proteccion
    // del rate limiter y el scrypt del PIN
  }
}

export async function clearLoginFailures(ip: string): Promise<void> {
  if (!ip) return;
  try {
    const admin = await createServiceRoleClient();
    await admin.from("referral_login_attempts").delete().eq("ip", ip);
  } catch {
    // noop
  }
}
