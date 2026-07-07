import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { getAuthSession } from "@/lib/dashboard/auth/server";

export default async function ReceiptPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const admin = await createServiceRoleClient();
  const { data: event } = await admin
    .from("shop_billing_events")
    .select("id, shop_id, event_type, payload, created_at")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || event.event_type !== "subscription_payment_applied") {
    redirect("/dashboard");
  }

  const { data: shop } = await admin
    .from("shops")
    .select("nombre, address, phone")
    .eq("id", event.shop_id)
    .maybeSingle();

  if (!shop) redirect("/dashboard");

  const payload = event.payload as { amount?: number; payment_id?: string | null };
  const amount = payload?.amount ?? 500;
  const paymentId = payload?.payment_id ?? "-";
  const date = new Date(event.created_at).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const receiptNumber = eventId.slice(0, 8).toUpperCase();

  return (
    <html>
      <head>
        <title>Recibo - {shop.nombre}</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a2e; line-height: 1.6; }
          .receipt { max-width: 720px; margin: 40px auto; padding: 48px; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7c3aed; padding-bottom: 24px; margin-bottom: 24px; }
          .shop-info h1 { font-size: 22px; font-weight: 700; color: #1a1a2e; }
          .shop-info p { font-size: 13px; color: #64748b; margin-top: 2px; }
          .badge { text-align: right; }
          .badge h2 { font-size: 16px; font-weight: 600; color: #7c3aed; }
          .badge p { font-size: 12px; color: #94a3b8; }
          .details { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
          .detail-item {}
          .detail-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 2px; }
          .detail-value { font-size: 14px; font-weight: 500; color: #1a1a2e; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
          tbody td { padding: 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
          tbody td:last-child, thead th:last-child { text-align: right; }
          .total-row td { font-weight: 700; color: #1a1a2e; border-bottom: none; padding-top: 16px; }
          .total-row td:last-child { font-size: 18px; color: #7c3aed; }
          .footer { text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 8px; }
          .print-btn { display: flex; justify-content: center; margin-bottom: 32px; }
          .print-btn button { background: #7c3aed; color: white; border: none; padding: 10px 32px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; }
          .print-btn button:hover { background: #6d28d9; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-btn { display: none; }
            .receipt { box-shadow: none; border: 1px solid #e2e8f0; margin: 20px auto; }
            @page { margin: 20mm; }
          }
        `}</style>
      </head>
      <body>
        <div className="print-btn">
          <button onClick={() => window.print()}>Imprimir / Guardar PDF</button>
        </div>
        <div className="receipt">
          <div className="header">
            <div className="shop-info">
              <h1>{shop.nombre}</h1>
              {shop.address && <p>{shop.address}</p>}
              {shop.phone && <p>{shop.phone}</p>}
            </div>
            <div className="badge">
              <h2>RECIBO</h2>
              <p>N° {receiptNumber}</p>
            </div>
          </div>

          <div className="details">
            <div className="detail-item">
              <p className="detail-label">Fecha de emisión</p>
              <p className="detail-value">{date}</p>
            </div>
            <div className="detail-item">
              <p className="detail-label">ID de pago</p>
              <p className="detail-value">{paymentId}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Suscripción mensual - {shop.nombre}</td>
                <td>${amount.toFixed(2)}</td>
              </tr>
              <tr className="total-row">
                <td>Total</td>
                <td>${amount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <div className="footer">
            <p>Este es un comprobante de pago generado por Klip.</p>
            <p>{shop.nombre} - {shop.address || ""}</p>
          </div>
        </div>
      </body>
    </html>
  );
}
