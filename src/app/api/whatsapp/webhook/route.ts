import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: false, error: "verify_token invalido" }, { status: 403 });
}

type StatusRow = { meta_message_id?: string | null; status?: string };

export async function POST(request: NextRequest) {
  let payload: {
    object?: string;
    entry?: {
      id?: string;
      changes?: {
        field?: string;
        value?: {
          messaging_product?: string;
          metadata?: { phone_number_id?: string };
          messages?: { id?: string; from?: string; text?: { body?: string } }[];
          statuses?: { id?: string; status?: string; errors?: { code?: number }[] }[];
          errors?: { code?: number; title?: string }[];
        } | null;
      }[];
    }[];
  } = {};

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (payload.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  if (!payload.entry?.length) return NextResponse.json({ ok: true }, { status: 200 });

  const admin = await createServiceRoleClient();

  for (const entry of payload.entry) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      // actualizacion de estados de entrega/lectura
      if (change.field === "message_statuses" && Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          if (!status.id) continue;
          const errorText = status.errors
            ?.map((e) => `error ${e.code}`)
            .join(", ");
          await admin
            .from("whatsapp_messages")
            .update({
              status: status.status || "unknown",
              error: errorText || null,
              updated_at: new Date().toISOString(),
            })
            .eq("meta_message_id", status.id);
        }
        continue;
      }

      // mensajes entrantes: el numero del local lo identifica
      if (change.field === "messages") {
        const from = value.messages?.[0]?.from;
        if (from) {
          const { data: shop } = await admin
            .from("shops")
            .select("id")
            .eq("wa_phone_number_id", value.metadata?.phone_number_id || "")
            .maybeSingle();
          if (shop?.id) {
            await admin.from("whatsapp_messages").insert({
              shop_id: shop.id,
              message_type: "inbound",
              template_name: "inbound",
              category: "inbound",
              to_phone: from,
              status: "received",
            });
          }
        }
        continue;
      }

      // errores generales del webhook
      if (Array.isArray(value.errors) && value.errors.length > 0) {
        const { data: shop } = await admin
          .from("shops")
          .select("id")
          .eq("wa_phone_number_id", value.metadata?.phone_number_id || "")
          .maybeSingle();
        if (shop?.id) {
          const row = (await admin
            .from("whatsapp_messages")
            .select("meta_message_id, status")
            .eq("shop_id", shop.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()) as { data: StatusRow | null };
          if (row.data?.meta_message_id) {
            await admin
              .from("whatsapp_messages")
              .update({ status: "failed", error: value.errors.map((e) => e.code).join(","), updated_at: new Date().toISOString() })
              .eq("meta_message_id", row.data.meta_message_id);
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}