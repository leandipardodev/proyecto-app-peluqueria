import { fetchBusinessData } from "@/lib/dashboard/business-actions";
import BusinessClient from "./business-client";

export const dynamic = "force-dynamic";

export default async function BusinessPage() {
  let data: any = null;
  let error: string | null = null;

  const result = await fetchBusinessData();
  if (result.success) {
    data = result.data ?? null;
  } else {
    error = result.error;
  }

  return <BusinessClient initialData={data} initialError={error} />;
}
