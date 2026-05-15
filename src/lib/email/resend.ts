type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  scheduledAt?: string;
  replyTo?: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Klip Turnos <no-reply@send.klip.com.ar>";

export async function sendEmailWithResend({ to, subject, html, scheduledAt, replyTo }: SendEmailParams): Promise<void> {
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
      from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
      to: [to],
      subject,
      html,
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Resend error: ${response.status} ${message}`);
  }
}
