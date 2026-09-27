/**
 * Credenciales de Mercado Pago para los cobros que le pertenecen al LOCAL.
 *
 * Regla que este modulo existe para hacer explicita:
 *
 *   El dinero de las senas, del carrito y de los links de pago es del LOCAL.
 *   El token que lo cobra es el suyo (el que guardado OAuth en
 *   `shops.mp_access_token`), NUNCA el de la plataforma.
 *
 * Antes estos flujos caian a `process.env.MP_ACCESS_TOKEN` cuando el local no
 * tenia token. Como `MP_ACCESS_TOKEN` es una variable obligatoria, la guarda
 * "si no hay token, error" era inalcanzable y el resultado era que la sena de
 * los locales sin conectar entraba en la cuenta de Klip. No hay ledger que le
 * devuelva esa plata al local: se perdia.
 *
 * La excepcion es la suscripcion al plan de Klip, que si es de Klip por
 * diseno (Klip es merchant of record y necesita el dinero para pagar
 * comisiones de referidos). Eso vive en /api/billing/* y usa el token de la
 * plataforma a proposito. Este modulo no aplica ahi.
 */

export const SHOP_MP_NOT_CONNECTED =
  "Este local todavia no conecto su cuenta de Mercado Pago. " +
  "El cliente no puede pagar online hasta que el local la conecte desde Mi Negocio.";

export type ShopMpTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; error: string };

/**
 * Token del local para cobrarle a su cliente. Sin fallback a la plataforma: si
 * el local no conecto su cuenta, el cobro no se puede hacer y se dice por que.
 */
export function resolveShopMpToken(
  shop: { mp_access_token?: unknown } | null | undefined,
): ShopMpTokenResult {
  const accessToken = typeof shop?.mp_access_token === "string" ? shop.mp_access_token.trim() : "";
  if (!accessToken) {
    return { ok: false, error: SHOP_MP_NOT_CONNECTED };
  }
  return { ok: true, accessToken };
}

/**
 * URL de notificacion para cobros del local.
 *
 * El `shop_id` no es opcional: el webhook resuelve que token usar a partir de
 * ese parametro, y `payment.get` sobre el token equivocado devuelve 404 porque
 * el pago pertenece a la cuenta del local. Sin el parametro, el webhook usaba
 * el token de la plataforma, fallaba con 500 y el turno quedaba sin confirmar
 * para siempre aunque la plata hubiera entrado.
 *
 * Unir con `?` a mano es fragil: si alguien cambia la URL base o agrega otro
 * query, el shop_id se pierde en silencio. Se arma aca en un solo lugar.
 */
export function buildShopNotificationUrl(baseUrl: string, shopId: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  return `${root}/api/payments/mercadopago-webhook?shop_id=${encodeURIComponent(shopId)}`;
}
