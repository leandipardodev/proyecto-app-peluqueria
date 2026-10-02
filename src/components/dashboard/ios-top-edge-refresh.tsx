"use client";

import { useEffect } from "react";

const MAX_INTENTOS = 16;
const RETRY_MS = 250;

/**
 * iOS 27 deja la franja superior de las web apps instaladas con un blur cacheado
 * al lanzar, y no hay ninguna API para apagarlo: `theme-color` no se soporta
 * desde iOS 26 y `apple-mobile-web-app-status-bar-style` esta deprecado y iOS 27
 * lo ignora. Solo aparece en la PWA instalada y solo en vertical, y es nuevo en
 * el release final (en el RC no pasaba).
 *
 * Lo que si esta reportado es como se comporta: es una rasterizacion cacheada,
 * no un filtro vivo. Scrollear la limpia y no vuelve hasta que se cierra y
 * reabre la app; en las apps cuyo contenido no scrollea nunca se va. Por eso
 * toca invalidarla una vez, y un scroll de 1px alcanza.
 *
 * Se hace cuando la pagina ya scrollea, y la posicion se restaura en el frame
 * siguiente para que el usuario no vea nada. Reintenta mientras el contenido
 * sigue skeleateando, que al arrancar `main` todavia no tiene rango.
 */
export default function IosTopEdgeRefresh() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.body.classList.contains("ios-standalone")) return;

    let cancelado = false;
    let timeout = 0;

    const intentar = (intento: number) => {
      if (cancelado) return;
      const scroller = document.querySelector("main");
      const max = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;

      if (!scroller || max <= 4) {
        if (intento < MAX_INTENTOS) {
          timeout = window.setTimeout(() => intentar(intento + 1), RETRY_MS);
        }
        return;
      }

      const y = scroller.scrollTop;
      scroller.scrollTop = 1;
      requestAnimationFrame(() => {
        if (!cancelado) scroller.scrollTop = y;
      });
    };

    timeout = window.setTimeout(() => intentar(0), 0);

    return () => {
      cancelado = true;
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}