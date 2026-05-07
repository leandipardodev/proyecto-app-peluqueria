import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";

interface BookLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: BookLayoutProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerClient();

  const { data: shop } = await supabase
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
  return (
    <html lang="es">
      <body className="antialiased bg-gray-50">{children}</body>
    </html>
  );
}
