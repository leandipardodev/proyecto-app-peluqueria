"use server";

import { createServerClient } from "@/lib/supabase/server";
import { canAccessShopId, createServiceRoleClient, getCachedUser, getCurrentUserRole, requireShopId } from "@/lib/dashboard/auth/server";
import { revalidateDashboardSegments } from "@/lib/dashboard/shared/revalidate-dashboard";
import { getArgentinaDateString } from "@/lib/argentina-time";
import { DEFAULT_VOUCHER_WHATSAPP_TEMPLATE } from "@/lib/dashboard/vouchers/voucher-constants";
import type { ActionResult } from "@/lib/types";
import "server-only";

export type VoucherRow = {
  id: string;
  gifted_to_name: string;
  gifted_to_phone: string | null;
  gifted_to_birthday: string;
  gifted_by_name: string | null;
  service_name: string;
  voucher_message: string | null;
  status: string;
  reminder_sent_at: string | null;
  redeemed_at: string | null;
  created_at: string;
};

export type TodayVoucherAlert = {
  id: string;
  gifted_to_name: string;
  service_name: string;
  gifted_by_name: string | null;
};

export async function fetchVouchers(shopIdOverride?: string): Promise<ActionResult<VoucherRow[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("vouchers")
      .select("id, gifted_to_name, gifted_to_phone, gifted_to_birthday, gifted_by_name, service_name, voucher_message, status, reminder_sent_at, redeemed_at, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as VoucherRow[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener vouchers" };
  }
}

export async function fetchTodayVoucherAlerts(shopIdOverride?: string): Promise<ActionResult<TodayVoucherAlert[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("vouchers")
      .select("id, gifted_to_name, service_name, gifted_by_name, gifted_to_birthday, status")
      .eq("shop_id", shopId)
      .in("status", ["pending", "sent", "due_today"])
      .limit(50);

    if (error) return { success: false, error: error.message };

    const todayMMDD = getArgentinaDateString().slice(5);
    const today = (data || []).filter((v) => {
      return (v.gifted_to_birthday ?? "").slice(5) === todayMMDD;
    });

    return {
      success: true,
      data: today.map((v) => ({
        id: v.id,
        gifted_to_name: v.gifted_to_name,
        service_name: v.service_name,
        gifted_by_name: v.gifted_by_name,
      })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener alertas de vouchers" };
  }
}

export async function fetchVoucherWhatsappTemplate(shopId: string): Promise<ActionResult<string>> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    const user = await getCachedUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };
    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("shops")
      .select("voucher_whatsapp_template")
      .eq("id", shopId)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data?.voucher_whatsapp_template || DEFAULT_VOUCHER_WHATSAPP_TEMPLATE };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener plantilla de voucher" };
  }
}

export async function updateVoucherWhatsappTemplate(shopId: string, template: string): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    const user = await getCachedUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };
    const supabase = await createServerClient();
    const { data: membership } = await supabase
      .from("shop_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .maybeSingle();
    if (!membership || membership.role !== "owner") {
      return { success: false, error: "Solo el owner del local puede realizar esta accion" };
    }
    const { error } = await supabase
      .from("shops")
      .update({ voucher_whatsapp_template: template, updated_at: new Date().toISOString() })
      .eq("id", shopId);
    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/vouchers"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar plantilla" };
  }
}

export async function createVoucher(formData: FormData, shopId: string): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    const supabase = await createServerClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return { success: false, error: "SESION_EXPIRADA" };

    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };

    const roleResult = await getCurrentUserRole(shopId);
    if (!roleResult.success || roleResult.data?.role !== "owner") {
      return { success: false, error: "Solo el owner puede crear vouchers" };
    }

    let giftedToName = (formData.get("gifted_to_name") as string)?.trim();
    let giftedToPhone = (formData.get("gifted_to_phone") as string)?.trim() || null;
    let giftedToBirthday = (formData.get("gifted_to_birthday") as string)?.trim() || null;
    const giftedByName = (formData.get("gifted_by_name") as string)?.trim() || null;
    const serviceName = (formData.get("service_name") as string)?.trim();
    const voucherMessage = (formData.get("voucher_message") as string)?.trim() || null;
    const customerId = (formData.get("customer_id") as string)?.trim() || null;
    const serviceId = (formData.get("service_id") as string)?.trim() || null;

    let resolvedCustomerId: string | null = null;
    let resolvedServiceId: string | null = null, resolvedServiceName = serviceName || "";

    // Vinculación al CRM: si eligieron cliente/servicio, validá la pertenencia al local
    // y usá los datos reales del catálogo/cliente como fuente de verdad.
    if (customerId) {
      const customerRes = await supabase
        .from("customers")
        .select("id, nombre, cumpleaños, telefono" as string)
        .eq("id", customerId)
        .eq("shop_id", shopId)
        .maybeSingle();
      const customerError = customerRes.error;
      if (customerError) return { success: false, error: customerError.message };
      const customer = (customerRes.data ?? null) as { id: string; nombre: string | null; cumpleaños: string | null; telefono: string | null } | null;
      if (!customer) return { success: false, error: "SIN_ACCESO_CLIENTE" };
      resolvedCustomerId = customer.id;
      if (!giftedToName && customer.nombre) giftedToName = customer.nombre;
      if (!giftedToBirthday) giftedToBirthday = customer.cumpleaños;
      if (!giftedToPhone && customer.telefono) giftedToPhone = customer.telefono;
    }

    if (serviceId) {
      const { data: service, error: serviceError } = await supabase
        .from("services")
        .select("id, name")
        .eq("id", serviceId)
        .eq("shop_id", shopId)
        .maybeSingle();
      if (serviceError) return { success: false, error: serviceError.message };
      if (!service) return { success: false, error: "SIN_ACCESO_SERVICIO" };
      resolvedServiceId = service.id;
      resolvedServiceName = service.name;
    }

    if (!giftedToName || !giftedToBirthday || !resolvedServiceName) {
      return { success: false, error: "Completá los campos obligatorios" };
    }

    const { error } = await supabase.from("vouchers").insert({
      shop_id: shopId,
      gifted_to_name: giftedToName,
      gifted_to_phone: giftedToPhone,
      gifted_to_birthday: giftedToBirthday,
      gifted_by_name: giftedByName,
      service_name: resolvedServiceName,
      voucher_message: voucherMessage,
      status: "pending",
      ...(resolvedCustomerId ? { customer_id: resolvedCustomerId } : {}),
      ...(resolvedServiceId ? { service_id: resolvedServiceId } : {}),
    });

    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/vouchers", "/calendar"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear voucher" };
  }
}

export async function markVoucherReminderSent(voucherId: string, shopId: string): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    const user = await getCachedUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };
    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };
    const supabase = await createServerClient();
    const { data: updated, error } = await supabase
      .from("vouchers")
      .update({ reminder_sent_at: new Date().toISOString(), status: "sent", updated_at: new Date().toISOString() })
      .eq("id", voucherId)
      .eq("shop_id", shopId)
      .select("service_name, gifted_to_name")
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/vouchers"]);

    try {
      const admin = await createServiceRoleClient();
      await admin.from("notifications").upsert(
        [
          {
            shop_id: shopId,
            type: "voucher_enviado",
            category: "action" as const,
            title: "Voucher enviado",
            description: updated
              ? `Voucher de ${updated.service_name} enviado a ${updated.gifted_to_name}`
              : "Voucher enviado por WhatsApp",
            href: "/dashboard/fidelizacion",
            entity_key: `voucher:${voucherId}`,
            created_at: new Date().toISOString(),
          },
        ],
        { onConflict: "shop_id,entity_key", ignoreDuplicates: true }
      );
    } catch {
      // Best-effort: el registro de la notificación no bloquea la acción.
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar voucher" };
  }
}

export async function markVoucherRedeemed(voucherId: string, shopId: string): Promise<ActionResult> {
  try {
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    const user = await getCachedUser();
    if (!user) return { success: false, error: "SESION_EXPIRADA" };
    const allowed = await canAccessShopId(user.id, shopId);
    if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };
    const roleResult = await getCurrentUserRole(shopId);
    if (!roleResult.success || roleResult.data?.role !== "owner") {
      return { success: false, error: "Solo el owner puede canjear vouchers" };
    }
    const supabase = await createServerClient();
    const { error } = await supabase
      .from("vouchers")
      .update({ redeemed_at: new Date().toISOString(), status: "redeemed", updated_at: new Date().toISOString() })
      .eq("id", voucherId)
      .eq("shop_id", shopId);
    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/vouchers"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al canjear voucher" };
  }
}
