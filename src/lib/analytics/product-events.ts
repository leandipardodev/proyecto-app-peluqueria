import type { Json } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";

export type ProductEventType =
  | "trial_started"
  | "first_staff_added"
  | "first_service_published"
  | "first_booking_confirmed"
  | "subscription_paid"
  | "subscription_canceled";

type TrackOptions = {
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

const FIRST_EVENT_KEY: Partial<Record<ProductEventType, string>> = {
  first_staff_added: "first_staff_added",
  first_service_published: "first_service_published",
  first_booking_confirmed: "first_booking_confirmed",
};

export async function trackProductEvent(shopId: string, eventType: ProductEventType, options?: TrackOptions): Promise<boolean> {
  try {
    const admin = await createServiceRoleClient();
    const onceKey = FIRST_EVENT_KEY[eventType];

    if (onceKey) {
      const { error: markerError } = await admin.from("product_event_markers").insert({
        shop_id: shopId,
        marker_key: onceKey,
      });

      if (markerError) {
        const isUnique = markerError.code === "23505";
        if (isUnique) return true;
        return false;
      }
    }

    const { error } = await admin.from("product_events").insert({
      shop_id: shopId,
      event_type: eventType,
      actor_user_id: options?.actorUserId ?? null,
      metadata: (options?.metadata ?? {}) as Json,
    });

    return !error;
  } catch {
    return false;
  }
}
