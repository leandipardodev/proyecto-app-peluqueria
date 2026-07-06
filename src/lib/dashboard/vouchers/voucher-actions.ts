"use server";

import { createServerClient } from "@/lib/supabase/server";
import { canAccessShopId, getCachedUser, getCurrentUserRole, requireShopId } from "@/lib/dashboard/auth/server";
import { revalidateDashboardSegments } from "@/lib/dashboard/shared/revalidate-dashboard";
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
      .order("gifted_to_birthday", { ascending: true });

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

    const now = new Date();
    const mm = now.getMonth();
    const dd = now.getDate();
    const today = (data || []).filter((v) => {
      const d = new Date(`${v.gifted_to_birthday}T00:00:00`);
      return d.getMonth() === mm && d.getDate() === dd;
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

export async function runVoucherReminderSweep(): Promise<ActionResult<{ updated: number }>> {
  try {
    const supabase = await createServerClient();
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    const { data: shops } = await supabase.from("shops").select("id");
    if (!shops || shops.length === 0) return { success: true, data: { updated: 0 } };

    const results = await Promise.all(
      shops.map(async (shop) => {
        const { data } = await supabase
          .from("vouchers")
          .select("id, gifted_to_birthday")
          .eq("shop_id", shop.id)
          .in("status", ["pending", "sent"]);
        if (!data) return [] as string[];
        return data
          .filter((v) => {
            const d = new Date(v.gifted_to_birthday);
            return d.getMonth() + 1 === todayMonth && d.getDate() === todayDay;
          })
          .map((v) => v.id);
      })
    );

    const dueIds = results.flat();
    if (dueIds.length === 0) return { success: true, data: { updated: 0 } };

    const { error: upErr } = await supabase
      .from("vouchers")
      .update({ status: "due_today", updated_at: new Date().toISOString() })
      .in("id", dueIds);
    if (upErr) return { success: false, error: upErr.message };
    return { success: true, data: { updated: dueIds.length } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error en sweep de vouchers" };
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

    const giftedToName = (formData.get("gifted_to_name") as string)?.trim();
    const giftedToPhone = (formData.get("gifted_to_phone") as string)?.trim() || null;
    const giftedToBirthday = (formData.get("gifted_to_birthday") as string)?.trim();
    const giftedByName = (formData.get("gifted_by_name") as string)?.trim() || null;
    const serviceName = (formData.get("service_name") as string)?.trim();
    const voucherMessage = (formData.get("voucher_message") as string)?.trim() || null;

    if (!giftedToName || !giftedToBirthday || !serviceName) {
      return { success: false, error: "Completá los campos obligatorios" };
    }

    const { error } = await supabase.from("vouchers").insert({
      shop_id: shopId,
      gifted_to_name: giftedToName,
      gifted_to_phone: giftedToPhone,
      gifted_to_birthday: giftedToBirthday,
      gifted_by_name: giftedByName,
      service_name: serviceName,
      voucher_message: voucherMessage,
      status: "pending",
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
    const { error } = await supabase
      .from("vouchers")
      .update({ reminder_sent_at: new Date().toISOString(), status: "sent", updated_at: new Date().toISOString() })
      .eq("id", voucherId)
      .eq("shop_id", shopId);
    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/vouchers"]);
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
