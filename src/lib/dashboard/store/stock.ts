import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = SupabaseClient<Database>;

export async function restoreOrderStock(admin: AdminClient, shopId: string, orderId: string): Promise<void> {
  const { data: items } = await admin
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", orderId);

  for (const item of items || []) {
    if (!item.product_id) continue;
    await admin.rpc("restore_stock", {
      p_stock_id: item.product_id,
      p_shop_id: shopId,
      p_qty: item.quantity,
    });
  }
}
