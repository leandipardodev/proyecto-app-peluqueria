import { sendEmailWithResend } from "@/lib/email/resend";

export async function sendAppointmentConfirmationEmail(params: {
  to: string;
  customerName: string;
  shopName: string;
  serviceName: string;
  startTime: string;
  replyTo?: string;
}): Promise<void> {
  const appointmentDate = new Date(params.startTime);
  const dateLabel = appointmentDate.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const timeLabel = appointmentDate.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });

  await sendEmailWithResend({
    to: params.to,
    subject: `Confirmado! Tu turno el ${dateLabel} a las ${timeLabel}`,
    replyTo: params.replyTo,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
        <h1 style="font-size:22px;margin:0 0 12px;">Tu turno fue reservado</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Hola ${params.customerName}, ya confirmamos tu reserva.</p>
        <p style="font-size:15px;line-height:1.6;margin:0;">
          <strong>Local:</strong> ${params.shopName}<br/>
          <strong>Servicio:</strong> ${params.serviceName}<br/>
          <strong>Fecha y hora:</strong> ${dateLabel} a las ${timeLabel}
        </p>
        <p style="font-size:12px;color:#6b7280;margin-top:18px;">Klip - no-reply@send.klip.com.ar</p>
      </div>
    `,
  });
}

export async function scheduleAppointmentReminderEmail(params: {
  to: string;
  customerName: string;
  shopName: string;
  serviceName: string;
  shopAddress?: string;
  startTime: string;
  replyTo?: string;
}): Promise<void> {
  const reminderDate = new Date(new Date(params.startTime).getTime() - 3 * 60 * 60 * 1000);
  if (reminderDate <= new Date()) {
    return;
  }

  const appointmentDate = new Date(params.startTime);
  const dateLabel = appointmentDate.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const timeLabel = appointmentDate.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });

  const mapsUrl = params.shopAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.shopAddress)}`
    : null;
  const locationLine = params.shopAddress
    ? `<p style="font-size:14px;line-height:1.6;margin:4px 0 14px;"><strong>Direccion:</strong> ${params.shopAddress}</p>`
    : "";
  const mapsButton = mapsUrl
    ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0071E3;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:999px;font-size:13px;font-weight:600;">Ver ubicacion en Google Maps</a>`
    : "";

  await sendEmailWithResend({
    to: params.to,
    subject: `Recordatorio: Tu turno es el ${dateLabel} a las ${timeLabel}`,
    replyTo: params.replyTo,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
        <h1 style="font-size:22px;margin:0 0 12px;">Recordatorio de turno</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Hola ${params.customerName}, te recordamos que tenes un turno proximamente.</p>
        <p style="font-size:15px;line-height:1.6;margin:0;">
          <strong>Local:</strong> ${params.shopName}<br/>
          <strong>Servicio:</strong> ${params.serviceName}<br/>
          <strong>Fecha y hora:</strong> ${dateLabel} a las ${timeLabel}
        </p>
        ${locationLine}
        ${mapsButton}
        <p style="font-size:12px;color:#6b7280;margin-top:18px;">Klip - no-reply@send.klip.com.ar</p>
      </div>
    `,
  });
}
