import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { sendEmailWithResend } from "@/lib/email/resend";

function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://klip.com.ar").replace(/\/$/, "");
}

const VERIFICATION_CODE_EXPIRY_MINUTES = 15;
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

export async function sendVerificationCode(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await createServiceRoleClient();
    const normalizedEmail = email.trim().toLowerCase();

    const code = generateCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();

    await admin.from("email_verifications").insert({
      email: normalizedEmail,
      code,
      expires_at: expiresAt,
    });

    const baseUrl = getBaseUrl();
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
    const admin = await createServiceRoleClient();
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();

    const { data: existing } = await admin
      .from("email_verifications")
      .select("id, code, created_at, expires_at, verified_at")
      .eq("email", normalizedEmail)
      .is("verified_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(MAX_ATTEMPTS);

    if (!existing || existing.length === 0) {
      return { success: false, error: "No hay códigos pendientes. Solicitá uno nuevo." };
    }

    const match = existing.find((v) => v.code === trimmedCode);
    if (!match) {
      return { success: false, error: "Código incorrecto. Verificá e intentá de nuevo." };
    }

    await admin
      .from("email_verifications")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", match.id);

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
