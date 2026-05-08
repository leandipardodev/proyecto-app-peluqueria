import type { Metadata } from "next";
import { createServerClient } from "@supabase/ssr";

interface BookLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: BookLayoutProps): Promise<Metadata> {
  const { slug } = await params;
  const adminClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll() { return []; }, setAll() {} },
    }
  );

  const { data: shop } = await adminClient
    .from("shops")
    .select("name")
    .eq("slug", slug)
    .single();

  return {
    title: shop ? `${shop.name} - Reservar Turno` : "Reservar Turno",
    description: "Reservá tu turno online",
  };
}

export default async function BookLayout({
  children,
}: BookLayoutProps) {
  return <>{children}</>;
}
