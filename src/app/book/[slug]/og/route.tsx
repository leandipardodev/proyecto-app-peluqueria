import { getShopOgData, renderShopCard } from "@/lib/booking/shop-og";

/**
 * Preview social del local, 1200x630.
 *
 * Se declara como route y no con la convención `opengraph-image.tsx` porque
 * Next reserva ese nombre de archivo para su propia metadata, y hace falta una
 * URL estable y sin hash para poder reutilizarla en el `image` del JSON-LD
 * `LocalBusiness`. Twitter/X cae a `og:image` cuando no se declara
 * `twitter.images`, así que esta única route cubre ambos.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderShopCard(await getShopOgData(slug));
}