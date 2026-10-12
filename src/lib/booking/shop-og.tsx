import { cache } from "react";
import { ImageResponse } from "next/og";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";

export type ShopOgService = { name: string; price: number | null; hide_price: boolean };

export type ShopOgData = {
  nombre: string;
  localidad: string | null;
  logoUrl: string | null;
  services: ShopOgService[];
};

/**
 * Datos del local para el preview social. Van aparte del `page.tsx` porque la
 * route `/book/[slug]/og` corre como su propia request y no comparte el árbol
 * de la página. `cache()` evita el doble fetch entre la metadata y el JSON-LD.
 */
export const getShopOgData = cache(async function getShopOgData(slug: string): Promise<ShopOgData | null> {
  try {
    const admin = await createServiceRoleClient();
    const { data: shop } = await admin
      .from("shops")
      .select("id, nombre, localidad")
      .eq("slug", slug)
      .maybeSingle();
    if (!shop) return null;

    const [{ data: theme }, { data: services }] = await Promise.all([
      admin.from("shop_booking_theme").select("logo_url").eq("shop_id", shop.id).maybeSingle(),
      admin
        .from("services")
        .select("name, price, hide_price")
        .eq("shop_id", shop.id)
        .order("name", { ascending: true })
        .limit(4),
    ]);

    return {
      nombre: shop.nombre,
      localidad: shop.localidad || null,
      logoUrl: (theme?.logo_url as string | null) || null,
      services: (services || []) as ShopOgService[],
    };
  } catch {
    return null;
  }
});

function formatPrice(price: number | null): string {
  if (typeof price !== "number" || price <= 0) return "";
  return ` desde $${price.toLocaleString("es-AR")}`;
}

/**
 * Card 1200x630 del preview de un local.
 *
 * El preview es la superficie de crecimiento de un producto que se reparte por
 * link y QR: cuando el dueño comparte su link en Instagram o el cliente se lo
 * reenvía por WhatsApp, esto es lo único que ven. Antes mostraba el hero
 * publicitario de Klip, así que la viralidad del local terminaba en la marca
 * en vez de en el local.
 */
export function renderShopCard(data: ShopOgData | null): ImageResponse {
  const nombre = data?.nombre?.trim() || "Klip";
  const city = data?.localidad?.trim() || "";
  const highlights = (data?.services || [])
    .filter((s) => s.name?.trim() && !s.hide_price)
    .slice(0, 2)
    .map((s) => `${s.name.trim()}${formatPrice(s.price)}`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#ffffff",
          backgroundImage: "linear-gradient(135deg, #ffffff 0%, #f4f4f5 55%, #e4e4e7 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24, height: 260 }}>
          {data?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.logoUrl}
              alt=""
              width={200}
              height={200}
              style={{ objectFit: "contain", maxHeight: 220, maxWidth: 320 }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 200,
                height: 200,
                borderRadius: 40,
                backgroundColor: "#18181b",
                color: "#ffffff",
                fontSize: 68,
                fontWeight: 700,
              }}
            >
              {nombre.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontSize: nombre.length > 26 ? 60 : 74,
              fontWeight: 800,
              color: "#101625",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            {nombre}
          </div>

          {city ? (
            <div style={{ display: "flex", fontSize: 34, color: "#52525b" }}>{city}</div>
          ) : null}

          {highlights.length ? (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
              {highlights.map((label) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    padding: "12px 22px",
                    borderRadius: 999,
                    backgroundColor: "#ffffff",
                    border: "2px solid #e4e4e7",
                    fontSize: 28,
                    color: "#18181b",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "#71717a" }}>
          <span style={{ display: "flex" }}>Reservá online con</span>
          <span style={{ display: "flex", fontWeight: 700, color: "#18181b", letterSpacing: "0.04em" }}>
            KLIP
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}