import "server-only";
import { WA_GRAPH_VERSION } from "./wa-constants";

export class WhatsAppGraphError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly fbMessage?: string,
    public readonly detail?: unknown
  ) {
    super(message);
    this.name = "WhatsAppGraphError";
  }
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${WA_GRAPH_VERSION}/${path}`;
}

async function graphGet<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(graphUrl(path));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string } };
  if (!res.ok || body.error) {
    throw new WhatsAppGraphError(
      `Graph GET ${path} failed (${res.status})`,
      body.error?.code,
      body.error?.message
    );
  }
  return body as T;
}

async function graphPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(graphUrl(path), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const parsed = (await res.json().catch(() => ({}))) as T & {
    error?: { code?: number; message?: string };
  };
  if (!res.ok || (parsed as { error?: unknown }).error) {
    const fbError = (parsed as { error?: { code?: number; message?: string } }).error;
    throw new WhatsAppGraphError(
      `Graph POST ${path} failed (${res.status})`,
      fbError?.code,
      fbError?.message,
      parsed
    );
  }
  return parsed;
}

const appCredentials = () => {
  const appId = process.env.META_WA_APP_ID;
  const appSecret = process.env.META_WA_APP_SECRET;
  if (!appId || !appSecret) {
    throw new WhatsAppGraphError("Faltan META_WA_APP_ID / META_WA_APP_SECRET");
  }
  return { appId, appSecret };
};

export type ExchangeTokenResult = { access_token: string; expires_in?: number };

// Intercambia el token_code del Embedded Signup por un token de negocio de larga duracion.
export async function exchangeEmbeddedTokenCode(code: string): Promise<ExchangeTokenResult> {
  const { appId, appSecret } = appCredentials();

  const url = new URL(graphUrl("oauth/access_token"));
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);
  url.searchParams.set("grant_type", "authorization_code");

  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as ExchangeTokenResult & {
    error?: { code?: number; message?: string };
  };
  if (!res.ok || data.error || !data.access_token) {
    throw new WhatsAppGraphError(
      "No se pudo canjear el token_code",
      data.error?.code,
      data.error?.message
    );
  }

  const longUrl = new URL(graphUrl("oauth/access_token"));
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", appId);
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("fb_exchange_token", data.access_token);

  const longRes = await fetch(longUrl, { cache: "no-store" });
  const longData = (await longRes.json().catch(() => ({}))) as ExchangeTokenResult & {
    error?: { code?: number; message?: string };
  };
  if (!longRes.ok || longData.error) {
    throw new WhatsAppGraphError(
      "No se pudo extender la vida del token",
      longData.error?.code,
      longData.error?.message
    );
  }

  return { access_token: longData.access_token || data.access_token, expires_in: longData.expires_in };
}

// Registra el numero de destino para recibir mensajes (Cloud API).
export async function registerPhoneNumber(phoneNumberId: string, token: string): Promise<void> {
  try {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    await graphPost<{ success: boolean }>(`${phoneNumberId}/register`, token, {
      messaging_product: "whatsapp",
      pin,
    });
  } catch {
    // Si el numero ya se registro (tipico en Embedded Signup) el error es esperable: se continua.
  }
}

// Suscribe la app de Meta para recibir el webhook de las WABAs conectadas.
export async function subscribeWhatsAppWebhook(token: string): Promise<void> {
  const { appId } = appCredentials();
  const callbackUrl = `${(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "")}/api/whatsapp/webhook`;
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!callbackUrl || !verifyToken) {
    throw new WhatsAppGraphError("Faltan NEXT_PUBLIC_SITE_URL / WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  }

  await graphPost<{ success: boolean }>(`${appId}/subscriptions`, token, {
    object: "whatsapp_business_account",
    callback_url: callbackUrl,
    verify_token: verifyToken,
    fields: ["messages", "message_template_status_update", "account_update"],
  });
}

export type WhatsAppTemplateData = {
  name: string;
  category: "UTILITY" | "MARKETING";
  components: { type: string; text?: string; example?: { body_text?: string[][] } }[];
  language: string;
};

export async function createWhatsAppTemplate(
  wabaId: string,
  token: string,
  template: WhatsAppTemplateData
): Promise<void> {
  await graphPost<{ success: boolean }>(`${wabaId}/message_templates`, token, {
    name: template.name,
    language: template.language,
    category: template.category,
    components: template.components,
  });
}

export type ListTemplatesRow = { id: string; name: string; status: string };
export async function listWhatsAppTemplates(
  wabaId: string,
  token: string
): Promise<ListTemplatesRow[]> {
  const data = await graphGet<{ data: ListTemplatesRow[] }>(
    `${wabaId}/message_templates`,
    token,
    { fields: "id,name,status", limit: "100" }
  );
  return data.data || [];
}

export type SendTemplateResult = { messages?: { id?: string }[] };

export async function sendWhatsAppTemplate(params: {
  phoneNumberId: string;
  token: string;
  to: string;
  templateName: string;
  language: string;
  bodyParameters: (string | number)[];
}): Promise<SendTemplateResult> {
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.language },
      components: params.bodyParameters.length
        ? [{ type: "body", parameters: params.bodyParameters.map((p) => ({ text: String(p) })) }]
        : undefined,
    },
  };

  return graphPost<SendTemplateResult>(`${params.phoneNumberId}/messages`, params.token, body);
}