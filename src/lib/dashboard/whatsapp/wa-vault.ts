import "server-only";
import { createHmac, createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";

const KEY_CONTEXT = "klip-wa-token:v1";

function encryptionKey(): Buffer {
  const secret =
    process.env.META_WA_STATE_SECRET ||
    process.env.META_WA_APP_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("Falta META_WA_STATE_SECRET para cifrar el token de WhatsApp");
  }
  return createHmac("sha256", KEY_CONTEXT).update(secret).digest();
}

function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

function decryptToken(payload: string): string | null {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export async function saveWhatsAppToken(shopId: string, token: string): Promise<void> {
  if (!shopId || !token) throw new Error("saveWhatsAppToken: shopId y token son obligatorios");
  const admin = await createServiceRoleClient();
  const { error } = await admin
    .from("shops")
    .update({ wa_token: encryptToken(token) })
    .eq("id", shopId);
  if (error) throw new Error(`No se pudo guardar el token de WhatsApp: ${error.message}`);
}

export async function getWhatsAppToken(shopId: string): Promise<string | null> {
  if (!shopId) return null;
  const admin = await createServiceRoleClient();
  const { data, error } = await admin.from("shops").select("wa_token").eq("id", shopId).maybeSingle();
  if (error || !data?.wa_token) return null;
  return decryptToken(data.wa_token);
}

export async function deleteWhatsAppToken(shopId: string): Promise<void> {
  if (!shopId) return;
  try {
    const admin = await createServiceRoleClient();
    await admin.from("shops").update({ wa_token: null }).eq("id", shopId);
  } catch {
    // el token puede no existir: no es un error relevante
  }
}