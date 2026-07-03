"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createServiceRoleClient, getAuthSession, getShopIdBySlug, getCurrentUserRole, requireShopId } from "@/lib/dashboard/auth-server";
import { createServerClient } from "@/lib/supabase/server";
import { DEFAULT_BOOKING_TEMPLATE, BOOKING_TEMPLATE_PRESETS, type BookingTemplateId } from "@/lib/booking/theme-presets";
import type { ActionResult } from "@/lib/types";

export type BookingThemeData = {
  shop_id: string;
  template_id: BookingTemplateId;
  section_order: string[];
  section_service_order: string[];
  logo_url: string | null;
  logo_storage_path: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  about_title: string | null;
  about_text: string | null;
};

async function createAdminClient() {
  return createServiceRoleClient();
}

async function resolveShopIdFromOptionalSlug(shopSlug?: string): Promise<ActionResult<string>> {
  const normalizedSlug = (shopSlug || "").trim().toLowerCase();
  if (!normalizedSlug) return requireShopId();

  const session = await getAuthSession();
  if (!session) return { success: false, error: "SESION_EXPIRADA" };

  const fromSlug = await getShopIdBySlug(normalizedSlug, session.user.id);
  if (!fromSlug) return { success: false, error: "LOCAL_INVALIDO" };
  return { success: true, data: fromSlug };
}

function normalizeTemplateId(value: string | null | undefined): BookingTemplateId {
  if (value && (BOOKING_TEMPLATE_PRESETS as readonly { id: string }[]).some((p) => p.id === value)) {
    return value as BookingTemplateId;
  }
  return DEFAULT_BOOKING_TEMPLATE;
}

export async function fetchBookingTheme(shopIdOverride?: string, shopSlugOverride?: string): Promise<ActionResult<BookingThemeData | null>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await resolveShopIdFromOptionalSlug(shopSlugOverride);
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("shop_booking_theme")
      .select("shop_id, template_id, section_order, section_service_order, logo_url, logo_storage_path, hero_title, hero_subtitle, about_title, about_text")
      .eq("shop_id", shopId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: true, data: null };

    return {
      success: true,
      data: {
        shop_id: data.shop_id,
        template_id: normalizeTemplateId(data.template_id as string),
        section_order: Array.isArray((data as { section_order?: string[] }).section_order)
          ? (((data as { section_order?: string[] }).section_order || [])
              .map((item) => String(item || "").trim())
              .filter(Boolean))
          : ["General"],
        section_service_order: Array.isArray((data as { section_service_order?: string[] }).section_service_order)
          ? (((data as { section_service_order?: string[] }).section_service_order || [])
              .map((item) => String(item || "").trim())
              .filter(Boolean))
          : [],
        logo_url: data.logo_url || null,
        logo_storage_path: data.logo_storage_path || null,
        hero_title: data.hero_title || null,
        hero_subtitle: data.hero_subtitle || null,
        about_title: data.about_title || null,
        about_text: data.about_text || null,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar personalizacion de /book" };
  }
}

export async function upsertBookingTheme(input: {
  templateId: BookingTemplateId;
  shopSlug?: string;
  sectionOrder?: string[];
  sectionServiceOrder?: string[];
  heroTitle?: string;
  heroSubtitle?: string;
  aboutTitle?: string;
  aboutText?: string;
}): Promise<ActionResult> {
  try {
    const shopIdResult = await resolveShopIdFromOptionalSlug(input.shopSlug);
    if (!shopIdResult.success || !shopIdResult.data) return { success: false, error: "LOCAL_INVALIDO" };
    const shopId = shopIdResult.data;

    // Verify owner role
    const roleResult = await getCurrentUserRole(shopId);
    if (!roleResult.success || !roleResult.data || roleResult.data.role !== "owner") {
      return { success: false, error: "Solo el owner del local puede modificar el tema" };
    }

    const admin = await createAdminClient();

    const { error } = await admin.from("shop_booking_theme").upsert(
      {
        shop_id: shopId,
        template_id: normalizeTemplateId(input.templateId),
        section_order: (() => {
          const normalized = (input.sectionOrder || [])
            .map((item) => String(item || "").trim())
            .filter(Boolean);
          return normalized.length > 0 ? normalized : ["General"];
        })(),
        section_service_order: (input.sectionServiceOrder || [])
          .map((item) => String(item || "").trim())
          .filter(Boolean),
        hero_title: input.heroTitle?.trim() || null,
        hero_subtitle: input.heroSubtitle?.trim() || null,
        about_title: input.aboutTitle?.trim() || null,
        about_text: input.aboutText?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop_id" },
    );

    if (error) return { success: false, error: error.message };
    const { data: shopData } = await admin.from("shops").select("slug").eq("id", shopId).maybeSingle();
    const slug = shopData?.slug as string | undefined;
    if (slug) {
      revalidatePath(`/book/${slug}`);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar tema de /book" };
  }
}

export async function uploadBookingLogo(formData: FormData): Promise<ActionResult<{ logoUrl: string; storagePath: string }>> {
  try {
    const shopSlug = String(formData.get("shopSlug") || "").trim();
    const shopIdResult = await resolveShopIdFromOptionalSlug(shopSlug);
    if (!shopIdResult.success || !shopIdResult.data) return { success: false, error: "LOCAL_INVALIDO" };
    const shopId = shopIdResult.data;

    // Verify owner role
    const roleResult = await getCurrentUserRole(shopId);
    if (!roleResult.success || !roleResult.data || roleResult.data.role !== "owner") {
      return { success: false, error: "Solo el owner del local puede modificar el logo" };
    }

    const admin = await createAdminClient();

    const file = formData.get("logo") as File | null;
    if (!file || file.size === 0) return { success: false, error: "Selecciona una imagen de logo" };
    if (file.size > 2 * 1024 * 1024) return { success: false, error: "El logo supera 2MB" };
    if (!file.type.startsWith("image/")) return { success: false, error: "Archivo de imagen invalido" };

    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "png";
    const safeExt = ["png", "jpg", "jpeg", "webp", "svg"].includes(ext) ? ext : "png";

    // Read and optionally resize image via sharp
    const buffer = Buffer.from(await file.arrayBuffer());
    const MAX_DIMENSION = 1024;
    let processedBuffer: Buffer = buffer;
    let finalContentType = file.type;
    let finalExt = safeExt;

    // Skip sharp for SVG — it handles SVG input poorly for output
    if (safeExt !== "svg") {
      const metadata = await sharp(buffer).metadata();
      if (metadata.width && metadata.height && (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION)) {
        processedBuffer = await sharp(buffer)
          .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
        finalContentType = "image/webp";
        finalExt = "webp";
      }
    }

    const storagePath = `shops/${shopId}/branding/logo.${finalExt}`;

    const uploadRes = await admin.storage.from("booking-assets").upload(storagePath, processedBuffer, { upsert: true, contentType: finalContentType });
    if (uploadRes.error) return { success: false, error: uploadRes.error.message };

    const { data: publicData } = admin.storage.from("booking-assets").getPublicUrl(storagePath);
    const logoUrl = publicData.publicUrl;

    const { error } = await admin.from("shop_booking_theme").upsert(
      {
        shop_id: shopId,
        logo_url: logoUrl,
        logo_storage_path: storagePath,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop_id" },
    );
    if (error) return { success: false, error: error.message };

    const { data: shopData } = await admin.from("shops").select("slug").eq("id", shopId).maybeSingle();
    const slug = shopData?.slug as string | undefined;
    if (slug) {
      revalidatePath(`/book/${slug}`);
    }

    return { success: true, data: { logoUrl, storagePath } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al subir logo" };
  }
}
