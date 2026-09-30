import { randomInt } from "node:crypto";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { sendEmailWithResend } from "@/lib/email/resend";
import { createRateLimiter } from "@/lib/rate-limiter";
import { headers } from "next/headers";
import "server-only";

const VERIFICATION_CODE_EXPIRY_MINUTES = 15;
const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

// Limites por IP: el espacio del codigo son 10^6 valores. Sin esto, un atacante
// los barre contra completeRegistration() y termina haciendo signInWithPassword
// con su propia contrasena sobre la cuenta de la victima.
const sendLimiter = createRateLimiter({ intervalMs: 60 * 60_000, maxRequests: MAX_SENDS_PER_HOUR });
const verifyLimiter = createRateLimiter({ intervalMs: 15 * 60_000, maxRequests: 20 });

async function getClientIp(): Promise<string> {
  try {
    const list = await headers();
    return (
      list.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      list.get("x-real-ip") ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

function generateCode(): string {
  // CSPRNG. Math.random() no sirve aca: el codigo es una credencial.
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

type AdminClient = Awaited<ReturnType<typeof createServiceRoleClient>>;

type PendingCodeRow = {
  id: string;
  code: string;
  created_at: string;
  expires_at: string;
  verified_at: string | null;
  attempts?: number | null;
};

// Se resuelve una vez por instancia y se cachea. La migracion 106 agrega la
// columna; mientras no este aplicada caemos a la ruta sin contador en vez de
// romper el registro.
let attemptsColumnCache: boolean | null = null;

async function attemptsColumnExists(admin: AdminClient): Promise<boolean> {
  if (attemptsColumnCache !== null) return attemptsColumnCache;
  const { error } = await admin.from("email_verifications").select("attempts").limit(1);
  attemptsColumnCache = !error;
  if (!attemptsColumnCache) {
    console.warn(
      "[verification] email_verifications.attempts no existe: la migracion 106 no esta aplicada. " +
        "El limite de intentos por email no se esta contando (el rate limit por IP si sigue activo).",
    );
  }
  return attemptsColumnCache;
}

export async function sendVerificationCode(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const ip = await getClientIp();

    const perIp = await sendLimiter.check(`send-code:${ip}`);
    if (!perIp.allowed) {
      return { success: false, error: "Demasiados intentos. Esperá unos minutos e intentá de nuevo." };
    }

    const admin = await createServiceRoleClient();

    const code = generateCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();

    // El indice unico de 106 es PARCIAL (`where verified_at is null`), asi que
    // PostgREST no puede inferirlo con onConflict (mismo limite que ya
    // documenta referrals.ts con uq_referral_program_settings_default).
    // Patron delete + insert: el codigo nuevo invalida el anterior.
    await admin.from("email_verifications").delete().eq("email", normalizedEmail);

    const baseRow = {
      email: normalizedEmail,
      code,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      verified_at: null,
    };
    const hasAttempts = await attemptsColumnExists(admin);

    const { error: insertError } = await admin
      .from("email_verifications")
      .insert(hasAttempts ? { ...baseRow, attempts: 0 } : baseRow);

    if (insertError) return { success: false, error: insertError.message };

    await sendEmailWithResend({
      to: normalizedEmail,
      subject: "Tu codigo de verificacion - Klip",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827;">
          <h1 style="font-size:20px;margin:0 0 8px;">Verificá tu email</h1>
          <p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#4b5563;">
            Usá este código para confirmar tu cuenta en Klip:
          </p>
          <div style="background:#f3f4f6;border-radius:12px;padding:20px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;margin:0 0 16px;">
            ${code}
          </div>
          <p style="font-size:12px;color:#9ca3af;margin:0;">
            Código válido por ${VERIFICATION_CODE_EXPIRY_MINUTES} minutos. Si no pediste este código, ignorá este mensaje.
          </p>
          <p style="font-size:12px;color:#6b7280;margin-top:18px;">Enviado por Klip desde send.klip.com.ar</p>
        </div>
      `,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error al enviar código" };
  }
}

export async function verifyEmailCode(email: string, code: string): Promise<{ success: boolean; error?: string }> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();
    const ip = await getClientIp();

    const perIp = await verifyLimiter.check(`verify-code:${ip}:${normalizedEmail}`);
    if (!perIp.allowed) {
      return { success: false, error: "Demasiados intentos. Pedí un código nuevo e intentá de nuevo." };
    }

    const admin = await createServiceRoleClient();
    const hasAttempts = await attemptsColumnExists(admin);

    // La columna `attempts` la agrega la migracion 106. Si el codigo se despliega
    // antes que la migracion, el select falla con undefined_column y NADIE
    // podria registrarse. Por eso caemos a una ruta sin contador en vez de
    // romper: el rate limit por IP de arriba sigue frenando el barrido.
    const columns = hasAttempts
      ? "id, code, created_at, expires_at, verified_at, attempts"
      : "id, code, created_at, expires_at, verified_at";

    // TS no puede parsear una lista de columnas dinamica y devuelve
    // ParserError<...>; por eso el cast. La forma de la fila es la de ambos
    // branches (la unica diferencia es `attempts`, opcional).
    const { data: existing, error: selectError } = await admin
      .from("email_verifications")
      .select(columns)
      .eq("email", normalizedEmail)
      .is("verified_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (selectError) return { success: false, error: selectError.message };

    const row = ((existing?.[0] as unknown) as PendingCodeRow | undefined) ?? null;
    if (!row) {
      return { success: false, error: "No hay códigos pendientes. Solicitá uno nuevo." };
    }

    // El contador vive en la fila: sobrevive al redeploy y no depende de que el
    // limiter sea in-memory (que en Vercel es por instancia).
    const attempts = row.attempts ?? 0;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await admin.from("email_verifications").delete().eq("email", normalizedEmail).is("verified_at", null);
      return { success: false, error: "Demasiados intentos incorrectos. Pedí un código nuevo." };
    }

    const match = row.code === trimmedCode;
    if (!match) {
      const next = attempts + 1;
      if (hasAttempts && next >= MAX_CODE_ATTEMPTS) {
        await admin.from("email_verifications").delete().eq("email", normalizedEmail).is("verified_at", null);
        return { success: false, error: "Demasiados intentos incorrectos. Pedí un código nuevo." };
      }
      if (hasAttempts) {
        await admin.from("email_verifications").update({ attempts: next }).eq("id", row.id);
      }
      return { success: false, error: "Código incorrecto. Verificá e intentá de nuevo." };
    }

    await admin
      .from("email_verifications")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", row.id);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error al verificar código" };
  }
}

export async function cleanupExpiredCodes(): Promise<void> {
  try {
    const admin = await createServiceRoleClient();
    await admin
      .from("email_verifications")
      .delete()
      .lt("expires_at", new Date().toISOString());
  } catch {
    // silencioso
  }
}
