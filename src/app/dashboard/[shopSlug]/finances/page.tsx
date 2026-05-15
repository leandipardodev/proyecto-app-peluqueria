import { fetchFinanceData } from "@/lib/dashboard/finances-actions";
import FinancesClient from "@/app/dashboard/finances/finances-client";
import { getArgentinaDateString } from "@/lib/argentina-time";
import { getAuthSession, getShopIdBySlug } from "@/lib/dashboard/auth-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopFinancesPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopSlug: string }>;
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  const { shopSlug } = await params;
  const shopId = await getShopIdBySlug(shopSlug, session.user.id);
  if (!shopId) redirect("/dashboard");

  const query = await searchParams;
  const today = getArgentinaDateString();
  const [yearStr, monthStr] = today.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const lastDay = String(new Date(year, month, 0).getDate()).padStart(2, "0");
  const defaultTo = `${today.slice(0, 7)}-${lastDay}`;
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
