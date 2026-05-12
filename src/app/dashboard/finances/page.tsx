import { fetchFinanceData } from "@/lib/dashboard/finances-actions";
import FinancesClient from "./finances-client";
import { getArgentinaDateString } from "@/lib/argentina-time";

export const dynamic = "force-dynamic";

export default async function FinancesPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = getArgentinaDateString();
  const [yearStr, monthStr] = today.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const lastDay = String(new Date(year, month, 0).getDate()).padStart(2, "0");
  const defaultTo = `${today.slice(0, 7)}-${lastDay}`;
  const fromRaw = params?.from || defaultFrom;
  const toRaw = params?.to || defaultTo;
  const from = fromRaw <= toRaw ? fromRaw : toRaw;
  const to = fromRaw <= toRaw ? toRaw : fromRaw;

  let data: any = null;
  let error: string | null = null;

  const result = await fetchFinanceData(from, to);
  if (result.success) {
    data = result.data ?? null;
  } else {
    error = result.error;
  }

  return (
    <FinancesClient
      initialData={data}
      initialFrom={from}
      initialTo={to}
      initialError={error}
    />
  );
}
