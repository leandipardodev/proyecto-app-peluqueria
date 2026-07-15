import { requireShopId } from "@/lib/dashboard/auth/server";
import { getPendingBankTransfers } from "@/lib/dashboard/appointments/pending-booking-actions";
import BankTransfersClient from "./bank-transfers-client";

export const dynamic = "force-dynamic";

export default async function BankTransfersPage() {
  const shopIdResult = await requireShopId();
  if (!shopIdResult.success || !shopIdResult.data) {
    return <div className="p-8 text-zinc-500">Acceso denegado</div>;
  }

  const result = await getPendingBankTransfers(shopIdResult.data);

  if (!result.success) {
    return <div className="p-8 text-red-500">{result.error}</div>;
  }

  return <BankTransfersClient transfers={result.data || []} shopId={shopIdResult.data} />;
}
