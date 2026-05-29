import { fetchFinanceData } from "@/lib/dashboard/finances-actions";
import FinancesClient from "@/app/dashboard/finances/finances-client";
import { getArgentinaDateString } from "@/lib/argentina-time";
import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth-server";
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

  const query = await searchParams;
  const today = getArgentinaDateString();
  const defaultFrom = today;
  const defaultTo = today;
  const fromRaw = query?.from || defaultFrom;
  const toRaw = query?.to || defaultTo;
  const from = fromRaw <= toRaw ? fromRaw : toRaw;
  const to = fromRaw <= toRaw ? toRaw : fromRaw;

  const result = await fetchFinanceData(from, to, shopId);

  return (
    <FinancesClient
      shopId={shopId}
      initialData={result.success ? result.data ?? null : null}
      initialFrom={from}
      initialTo={to}
      initialError={result.success ? null : result.error}
    />
  );
}
