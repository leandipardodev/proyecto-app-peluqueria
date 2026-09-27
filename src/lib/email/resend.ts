type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  scheduledAt?: string;
  replyTo?: string;
  fromName?: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM_NAME = "Klip Turnos";
const DEFAULT_FROM_ADDRESS = "no-reply@send.klip.com.ar";

function htmlToPlainText(html: string): string {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h1|h2|h3|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveFrom(fromName?: string): string {
  const configured = process.env.RESEND_FROM_EMAIL;
  let address = DEFAULT_FROM_ADDRESS;
  let name = DEFAULT_FROM_NAME;

  if (configured) {
    const match = configured.match(/^(.*?)\s*<([^>]+)>$/);
    if (match) {
      name = match[1].replace(/^["']|["']$/g, "") || name;
      address = match[2];
    } else {
      address = configured;
    }
  }

  const finalName = fromName || name;
  return `"${finalName}" <${address}>`;
}

export async function sendEmailWithResend({ to, subject, html, text, scheduledAt, replyTo, fromName }: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY no está configurada");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resolveFrom(fromName),
      to: [to],
      subject,
      html,
      text: text || htmlToPlainText(html),
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Resend error: ${response.status} ${message}`);
  }
}
