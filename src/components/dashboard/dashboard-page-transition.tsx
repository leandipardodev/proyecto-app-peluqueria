"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isPerfModeOn } from "@/lib/use-performance-mode";

const REVEAL_MS = 420;
const REVEAL_MS_PERF = 140;
const REVEAL_SHIFT_PX = 12;
const REVEAL_DELAY_MS = 70;

/**
 * Entrada suave del contenido de cada seccion del dashboard.
 *
 * Antes el `initial` vivia en un `motion.div` sin `key`: framer lo corria una
 * sola vez, cuando se descargaba el chunk, y no volvia a correr al navegar. Por
 * eso el contenido aparecia de golpe.
 *
 * Dos decisiones:
 *
 * - **Espera a que la seccion este cargada.** Con navegacion del lado del
 *   cliente la ruta cambia antes de que llegue la data, y animar en ese momento
 *   es animar el skeleton: el contenido real seguia apareciendo de golpe. Cada
 *   `loading.tsx` marca su raiz con `data-dashboard-skeleton` y el reveal se
 *   dispara cuando ese elemento sale del DOM. Sin skeleton (recarga profunda,
 *   o navegacion con el payload ya cacheado) entra en el siguiente frame.
 *
 * - **Usa la Web Animations API y no framer.** No hace falta remontar a los
 *   hijos para repetirla, y con `fill: "backwards"` la transformacion se
 *   descarta sola al terminar: durante la animacion un `transform` en un
 *   ancestro convierte al bloque en containing block de los `position: fixed`
 *   que viven dentro de la pagina. Son 420ms, y en ese rato no hay ningun popover
 *   abierto, asi que el riesgo es nulo.
 */
export default function DashboardPageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const revealedRef = useRef(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    revealedRef.current = false;

    const reveal = () => {
      if (revealedRef.current) return;
      revealedRef.current = true;
      const perf = isPerfModeOn();
      wrapper.animate(
        [
          { opacity: 0, transform: `translate3d(0, ${REVEAL_SHIFT_PX}px, 0)` },
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: perf ? REVEAL_MS_PERF : REVEAL_MS,
          // El retardo le da al ojo un respiro entre "llego la data" y
          // "se acomoda". Sin el, la animacion arranca en el mismo frame en que
          // se pinta el contenido y no se percibe como entrada.
          delay: REVEAL_DELAY_MS,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
        },
      );
    };

    const hasSkeleton = () => !!wrapper.querySelector("[data-dashboard-skeleton]");

    if (!hasSkeleton()) {
      const raf = requestAnimationFrame(reveal);
      return () => cancelAnimationFrame(raf);
    }

    const observer = new MutationObserver(() => {
      if (hasSkeleton()) return;
      observer.disconnect();
      reveal();
    });
    observer.observe(wrapper, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <div ref={wrapperRef} className="relative min-h-0 isolate">
      {children}
    </div>
  );
}
