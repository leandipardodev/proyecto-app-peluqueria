import { sendEmailWithResend } from "@/lib/email/resend";

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    dateLabel: d.toLocaleDateString("es-AR", {
      weekday: "long", day: "2-digit", month: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    }),
    timeLabel: d.toLocaleTimeString("es-AR", {
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    }),
  };
}

function toGoogleCalendarUrl(title: string, startIso: string, endIso: string, location: string | undefined, details: string) {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(startIso)}/${fmt(endIso)}`,
    details,
  });
  if (location) params.set("location", location);
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

function toWhatsAppUrl(phone: string | undefined, text: string) {
  if (!phone) return null;
  const clean = phone.replace(/^\+/, "").replace(/\D/g, "");
  if (clean.length < 7) return null;
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

function buildAppointmentEmailHtml(params: {
  customerName: string;
  shopName: string;
  serviceName: string;
  shopAddress?: string;
  mapsUrl?: string;
  shopPhone?: string;
  instagramUrl?: string;
  whatsappUrl?: string;
  dateLabel: string;
  timeLabel: string;
  calendarUrl?: string | null;
}) {
  const mapsUrl = params.mapsUrl || (params.shopAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.shopAddress)}`
    : null);

  const locationLine = params.shopAddress
    ? `<p style="font-size:13px;color:#6b7280;margin:0 0 2px;">${params.shopAddress}</p>`
    : "";

  const mapsButton = mapsUrl
    ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;margin-top:10px;">Ver en Google Maps</a>`
    : "";

  const whatsappButton = params.whatsappUrl
    ? `<a href="${params.whatsappUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;margin:4px;">Contactar por WhatsApp</a>`
    : "";

  const instagramButton = params.instagramUrl
    ? `<a href="${params.instagramUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#ffffff;color:#262626;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid #dbdbdb;margin:4px;">Instagram</a>`
    : "";

  const calendarButton = params.calendarUrl
    ? `<a href="${params.calendarUrl}" target="_blank" rel="noopener noreferrer" style="display:block;background:#ffffff;color:#1a73e8;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid #1a73e8;text-align:center;margin-top:16px;">Agregar a Google Calendar</a>`
    : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#f4f4f6;">
      <div style="background:#111827;padding:28px 24px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;">Turno Confirmado</h1>
        <p style="color:#9ca3af;font-size:14px;margin:6px 0 0;">${params.shopName}</p>
      </div>
      <div style="background:#ffffff;padding:24px;">
        <p style="font-size:15px;line-height:1.5;color:#111827;margin:0 0 16px;">Hola <strong>${params.customerName}</strong>, tu turno fue reservado con exito.</p>
        <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:16px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="color:#6b7280;padding:3px 0;width:72px;">Servicio</td><td style="padding:3px 0;font-weight:600;">${params.serviceName}</td></tr>
            <tr><td style="color:#6b7280;padding:3px 0;">Fecha</td><td style="padding:3px 0;font-weight:600;">${params.dateLabel}</td></tr>
            <tr><td style="color:#6b7280;padding:3px 0;">Horario</td><td style="padding:3px 0;font-weight:600;">${params.timeLabel}</td></tr>
          </table>
        </div>
        ${locationLine ? `
        <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:16px;text-align:center;">
          ${locationLine}
          ${mapsButton}
        </div>` : ""}
        ${whatsappButton || instagramButton ? `
        <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:16px;text-align:center;">
          <p style="font-size:13px;font-weight:600;color:#111827;margin:0 0 8px;">Contactanos</p>
          ${whatsappButton}
          ${instagramButton}
        </div>` : ""}
        ${calendarButton}
      </div>
      <div style="background:#f4f4f6;padding:20px 24px;text-align:center;border-radius:0 0 12px 12px;">
        <p style="font-size:11px;color:#9ca3af;margin:0;">${params.shopName}</p>
      </div>
    </div>`;
}

export type EmailParams = {
  to: string;
  customerName: string;
  shopName: string;
  serviceName: string;
  shopAddress?: string;
  startTime: string;
  endTime: string;
  mapsUrl?: string;
  shopPhone?: string;
  instagramUrl?: string;
  whatsappUrl?: string;
};

export async function sendAppointmentConfirmationEmail(params: EmailParams) {
  const { dateLabel, timeLabel } = formatDate(params.startTime);
  const calendarUrl = params.endTime
    ? toGoogleCalendarUrl(
        `Turno en ${params.shopName}`,
        params.startTime,
        params.endTime,
        params.shopAddress,
        `Servicio: ${params.serviceName}`
      )
    : null;

  await sendEmailWithResend({
    to: params.to,
    subject: `Confirmado! Tu turno el ${dateLabel} a las ${timeLabel}`,
    html: buildAppointmentEmailHtml({
      customerName: params.customerName,
      shopName: params.shopName,
      serviceName: params.serviceName,
      shopAddress: params.shopAddress,
      mapsUrl: params.mapsUrl,
      shopPhone: params.shopPhone,
      instagramUrl: params.instagramUrl,
      whatsappUrl: params.whatsappUrl,
      dateLabel,
      timeLabel,
      calendarUrl,
    }),
  });
}

export async function scheduleAppointmentReminderEmail(params: EmailParams) {
  const reminderDate = new Date(new Date(params.startTime).getTime() - 3 * 60 * 60 * 1000);
  if (reminderDate <= new Date()) return;

  const { dateLabel, timeLabel } = formatDate(params.startTime);
  const calendarUrl = params.endTime
    ? toGoogleCalendarUrl(
        `Turno en ${params.shopName}`,
        params.startTime,
        params.endTime,
        params.shopAddress,
        `Servicio: ${params.serviceName}`
      )
    : null;

  await sendEmailWithResend({
    to: params.to,
    subject: `Recordatorio: Tu turno es el ${dateLabel} a las ${timeLabel}`,
    scheduledAt: reminderDate.toISOString(),
    html: buildAppointmentEmailHtml({
      customerName: params.customerName,
      shopName: params.shopName,
      serviceName: params.serviceName,
      shopAddress: params.shopAddress,
      mapsUrl: params.mapsUrl,
      shopPhone: params.shopPhone,
      instagramUrl: params.instagramUrl,
      whatsappUrl: params.whatsappUrl,
      dateLabel,
      timeLabel,
      calendarUrl,
    }),
  });
}
