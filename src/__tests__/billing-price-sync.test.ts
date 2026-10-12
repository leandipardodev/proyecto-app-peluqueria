import { describe, it, expect } from "vitest";
import { needsPriceSync } from "@/app/api/cron/billing-price-sync/route";

/**
 * El monto del preapproval se manda UNA sola vez, al suscribirse. Si el admin
 * cambia el precio, los clientes que ya estaban suscritos siguen pagando el
 * viejo: por eso el cron `billing-price-sync` compara y actualiza.
 *
 * Este helper decide si hay algo que sincronizar. Que NO confunda una
 * suscripción real con una que hay que tocar es lo único que importa acá: si
 * dice que sí cuando no hay diferencia, ensucia MP con updates en cada corrida;
 * si dice que no cuando hay diferencia, el cliente sigue pagando el precio viejo
 * y nadie se entera.
 */
describe("needsPriceSync", () => {
  it("detecta el precio viejo", () => {
    // El caso real: se creo a 25000, hoy vale 15000.
    expect(needsPriceSync(25000, 15000)).toBe(true);
    expect(needsPriceSync(9500, 15000)).toBe(true);
    expect(needsPriceSync(15000, 25000)).toBe(true);
  });

  it("no toca una suscripción que ya está al precio", () => {
    expect(needsPriceSync(15000, 15000)).toBe(false);
  });

  it("tolera el ruido de coma flotante del mismo monto", () => {
    // MP guarda con 2 decimales; el precio puede venir con ruido de float.
    // Sin redondear antes de comparar, 15000.004 se detectaba como cambio.
    expect(needsPriceSync(15000.004, 15000)).toBe(false);
    expect(needsPriceSync(15000, 15000.004)).toBe(false);
  });

  it("un centavo de diferencia SI es un cambio de precio", () => {
    // Son dos centavos distintos de verdad. Sincronizar de mas es barato
    // (un update al preapproval) y sincronizar de menos deja al cliente
    // pagando el precio viejo.
    expect(needsPriceSync(14999.99, 15000)).toBe(true);
    expect(needsPriceSync(15000, 14999.99)).toBe(true);
  });

  it("no inventa sincronización cuando MP no devuelve el monto", () => {
    // Un preapproval sin `auto_recurring` no se puede comparar. Actualizarlo a
    // ciegas sería peor que dejarlo.
    expect(needsPriceSync(null, 15000)).toBe(false);
    expect(needsPriceSync(undefined, 15000)).toBe(false);
    expect(needsPriceSync(0, 15000)).toBe(false);
    expect(needsPriceSync(Number.NaN, 15000)).toBe(false);
  });
});