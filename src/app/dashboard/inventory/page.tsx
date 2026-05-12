import { fetchStockItems } from "@/lib/dashboard/inventory-actions";
import StockTable from "@/components/inventory/stock-table";
import AddProductModal from "@/components/inventory/add-product-modal";
import InventoryPageClient from "@/components/inventory/inventory-page-client";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  let items: any[] = [];

  const result = await fetchStockItems();
  if (result.success) {
    items = result.data ?? [];
  } else {
    console.error("[InventoryPage] Error:", result.error);
  }

  return <InventoryPageClient initialItems={items} />;
}
