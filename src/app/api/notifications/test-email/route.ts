import { NextResponse } from "next/server";
import { sendEmailWithResend } from "@/lib/email/resend";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const expectedToken = process.env.TEST_EMAIL_TOKEN;
    if (expectedToken) {
      const provided = request.headers.get("x-test-email-token");
      if (provided !== expectedToken) {
        return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
      }
    }

    const targetEmail = "leandro@klip.com.ar";
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Klip <no-reply@send.klip.com.ar>";

    await sendEmailWithResend({
      to: targetEmail,
      subject: "Test notificaciones Klip",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;padding:24px;color:#111827;">
          <h1 style="font-size:20px;margin:0 0 10px;">Prueba de correo Klip</h1>
          <p style="font-size:14px;line-height:1.6;margin:0 0 10px;">Este mail confirma que el servicio de envio esta activo.</p>
          <p style="font-size:12px;color:#6b7280;margin:0;">Enviado desde: ${fromEmail}</p>
          <p style="font-size:12px;color:#6b7280;margin:0;">Fecha: ${new Date().toISOString()}</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, to: targetEmail, from: fromEmail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
