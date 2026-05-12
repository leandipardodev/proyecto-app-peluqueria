import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";

interface BookLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: BookLayoutProps): Promise<Metadata> {
  const { slug } = await params;
  const adminClient = await createServiceRoleClient();

  const { data: shop } = await adminClient
    .from("shops")
    .select("nombre")
    .eq("slug", slug)
    .single();

  return {
    title: shop ? `${shop.nombre} - Reservar Turno` : "Reservar Turno",
    description: "Reservá tu turno online",
  };
}

export default async function BookLayout({
  children,
}: BookLayoutProps) {
  return <>{children}</>;
}
