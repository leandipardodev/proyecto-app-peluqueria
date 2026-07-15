import { sendEmailWithResend } from "@/lib/email/resend";
import { BILLING_LABELS } from "@/lib/billing/plans";
import { getBillingPrice } from "@/lib/admin/site-settings";

type DunningParams = {
  to: string;
  shopName: string;
  shopSlug: string;
  daysRemaining: number;
};

function renewalUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://klip.com.ar";
  return `${base.replace(/\/+$/, "")}/dashboard/${slug}/business?tab=billing`;
}

function layout(content: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
      ${content}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;" />
      <p style="font-size:12px;color:#6b7280;margin:0;">Klip Turnos — no-reply@send.klip.com.ar</p>
    </div>
  `;
}

function button(href: string, label: string): string {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0071E3;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin:16px 0;">${label}</a>`;
}

export async function sendDunning7Days(params: DunningParams): Promise<void> {
  const price = await getBillingPrice();
  const label = BILLING_LABELS.monthly;
  await sendEmailWithResend({
    to: params.to,
    subject: `Tu suscripcion de ${params.shopName} vence en 7 dias`,
    html: layout(`
      <h1 style="font-size:22px;margin:0 0 12px;">Tu suscripcion esta por vencer</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Hola, la suscripcion de <strong>${params.shopName}</strong> vence en 7 dias.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Para seguir operando sin interrupciones, renovala antes del vencimiento.</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">Plan ${label}: $${price.toLocaleString("es-AR")}/mes</p>
      ${button(renewalUrl(params.shopSlug), "Renovar suscripcion")}
    `),
  });
}

export async function sendDunning3Days(params: DunningParams): Promise<void> {
  const price = await getBillingPrice();
  await sendEmailWithResend({
    to: params.to,
    subject: `La suscripcion de ${params.shopName} vence en 3 dias`,
    html: layout(`
      <h1 style="font-size:22px;margin:0 0 12px;">Vence en 3 dias</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">La suscripcion de <strong>${params.shopName}</strong> vence en 3 dias.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Si no renovas, tu local entrara en periodo de gracia por 2 dias y luego se desactivara.</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">$ ${price.toLocaleString("es-AR")}/mes</p>
      ${button(renewalUrl(params.shopSlug), "Renovar ahora")}
    `),
  });
}

export async function sendDunning1Day(params: DunningParams): Promise<void> {
  await sendEmailWithResend({
    to: params.to,
    subject: `URGENTE: ${params.shopName} vence manana`,
    html: layout(`
      <h1 style="font-size:22px;margin:0 0 12px;">Vence manana</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">La suscripcion de <strong>${params.shopName}</strong> vence manana.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Despues del vencimiento tenes 2 dias de gracia. Si no renovas, el local se desactivara y no podras recibir turnos.</p>
      ${button(renewalUrl(params.shopSlug), "Renovar ahora")}
    `),
  });
}

export async function sendDunningExpired(params: DunningParams): Promise<void> {
  const price = await getBillingPrice();
  await sendEmailWithResend({
    to: params.to,
    subject: `${params.shopName} vencio — periodo de gracia activo`,
    html: layout(`
      <h1 style="font-size:22px;margin:0 0 12px;">Suscripcion vencida</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">La suscripcion de <strong>${params.shopName}</strong> vencio.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Todavia tenes 2 dias de gracia para renovar sin perder datos. Despues de ese plazo, el local se desactivara.</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">$ ${price.toLocaleString("es-AR")}/mes</p>
      ${button(renewalUrl(params.shopSlug), "Reactivar suscripcion")}
    `),
  });
}

export async function sendDunningGraceLastDay(params: DunningParams): Promise<void> {
  await sendEmailWithResend({
    to: params.to,
    subject: `ULTIMO AVISO: ${params.shopName} se desactivara manana`,
    html: layout(`
      <h1 style="font-size:22px;margin:0 0 12px;">Ultimo dia de gracia</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Manana <strong>${params.shopName}</strong> se desactivara por falta de pago.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Tus datos y los de tus clientes se conservaran, pero el booking publico y el dashboard quedaran bloqueados hasta que renueves.</p>
      ${button(renewalUrl(params.shopSlug), "Reactivar ahora")}
    `),
  });
}
