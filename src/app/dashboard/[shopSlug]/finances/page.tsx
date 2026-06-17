import {
  fetchFinanceData,
  fetchStaffProduction,
  fetchCashSession,
  fetchCashMovements,
  fetchCashSessionsHistory,
  fetchStaffLiquidations,
} from "@/lib/dashboard/finances-actions";
import FinancesClient from "@/app/dashboard/finances/finances-client";
import { getArgentinaDateString } from "@/lib/argentina-time";
import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth-server";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopFinancesPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopSlug: string }>;
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");

  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("shop_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("shop_id", shopId)
    .maybeSingle();
  const role = membership?.role ?? "staff";

  const query = await searchParams;
  const today = getArgentinaDateString();
  const defaultFrom = today;
  const defaultTo = today;
  const fromRaw = query?.from || defaultFrom;
  const toRaw = query?.to || defaultTo;
  const from = fromRaw <= toRaw ? fromRaw : toRaw;
  const to = fromRaw <= toRaw ? toRaw : fromRaw;

  const [result, staffResult, cashResult, movesResult, historyResult, liqResult] = await Promise.all([
    fetchFinanceData(from, to, shopId),
    fetchStaffProduction(from, to, shopId),
    fetchCashSession(shopId),
    fetchCashMovements(from, to, shopId),
    fetchCashSessionsHistory(from, to, shopId),
    fetchStaffLiquidations(from, to, shopId),
  ]);

  return (
    <FinancesClient
      role={role}
      userId={user.id}
      shopId={shopId}
      initialData={result.success ? result.data ?? null : null}
      initialStaffProduction={staffResult.success ? staffResult.data ?? [] : []}
      initialCashSession={cashResult.success ? cashResult.data ?? null : null}
      initialCashMovements={movesResult.success ? movesResult.data ?? [] : []}
      initialCashSessionsHistory={historyResult.success ? historyResult.data ?? [] : []}
      initialStaffLiquidations={liqResult.success ? liqResult.data ?? [] : []}
      initialFrom={from}
      initialTo={to}
      initialError={result.success ? null : result.error}
    />
  );
}
