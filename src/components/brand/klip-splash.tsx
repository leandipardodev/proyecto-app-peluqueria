"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { getAppReadyEventName, isAppReady } from "@/lib/app-boot";

/** Piso: evita que el logo aparezca 200ms y se vea como un glitch. */
const MIN_VISIBLE_MS = 900;
/** Techo: si nada dispara la señal, el splash se va igual. Nunca trapear al usuario. */
const MAX_VISIBLE_MS = 6000;

/**
 * Logo de Klip dibujandose mientras arranca el dashboard.
 *
 * Vive en el root layout a proposito, no en `dashboard/layout.tsx`: el root no
 * tiene ningun `await`, asi que React puede hacer flush de esta salida antes de
 * que resuelva el `getCachedUser()` del dashboard. Adentro del layout del
 * dashboard esperaria a la misma query que esta tapando.
 *
 * Solo en `/dashboard`. En el resto no aporta nada y suma 900ms, y en
 * `/book/[slug]` —que es la pagina publica— eso es una conversion menos.
 *
 * Es un Server Component igual: pinta con el primer flush del HTML, sin ningun
 * request extra (por eso el SVG va inline y no en `public/`).
 */
export default function KlipSplash() {
  const pathname = usePathname();
  const isDashboard = pathname.startsWith("/dashboard");

  const [ready, setReady] = useState(false);
  const [present, setPresent] = useState(true);

  useEffect(() => {
    if (!isDashboard) {
      // Si arranco en otra ruta y despues navego al dashboard, el splash no
      // debe aparecer: es solo para la carga en frio de la PWA.
      setPresent(false);
      return;
    }
    if (isAppReady()) {
      setReady(true);
      return;
    }
    const onReady = () => setReady(true);
    window.addEventListener(getAppReadyEventName(), onReady);
    return () => window.removeEventListener(getAppReadyEventName(), onReady);
  }, [isDashboard]);

  // El piso se cuenta desde la hidratacion, no desde el primer paint. Es lo
  // que importa: la hidratacion siempre llega despues del paint, asi que el
  // logo igual se vio `MIN_VISIBLE_MS` como minimo.
  useEffect(() => {
    if (!isDashboard || !ready) return;
    const id = window.setTimeout(() => setPresent(false), MIN_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [isDashboard, ready]);

  useEffect(() => {
    if (!isDashboard) return;
    const id = window.setTimeout(() => setPresent(false), MAX_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [isDashboard]);

  if (!isDashboard) return null;

  return (
    <AnimatePresence>
      {present && (
        <motion.div
          key="klip-splash"
          role="status"
          aria-label="Cargando Klip"
          // `initial={false}` deja que entre ya opaco: pintar el logo de golpe es
          // justamente lo que se quiere en un splash. La salida si se anima.
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.22, ease: "easeOut" } }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-black"
        >
          <div className="relative flex items-center justify-center">
            <span
              aria-hidden="true"
              className="klip-splash-glow pointer-events-none absolute h-[150%] w-[150%] rounded-full dark:hidden"
              style={{
                background:
                  "radial-gradient(circle, rgba(0,113,227,0.30) 0%, rgba(0,113,227,0.11) 42%, transparent 68%)",
              }}
            />
            <span
              aria-hidden="true"
              className="klip-splash-glow pointer-events-none absolute hidden h-[150%] w-[150%] rounded-full dark:block"
              style={{
                background:
                  "radial-gradient(circle, rgba(94,168,255,0.26) 0%, rgba(94,168,255,0.10) 42%, transparent 68%)",
              }}
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 1192 880"
              preserveAspectRatio="xMidYMid meet"
              className="relative h-auto w-[min(72vw,22rem)] text-[#0071E3] dark:text-[#5da8ff]"
              fill="none"
            >
              <g transform="translate(0,880) scale(0.1,-0.1)">
                <path className="klip-splash-elem" d="M4410 4755 l0 -1675 353 2 352 3 0 1185 c0 652 -1 1404 -3 1673 l-3 487 -350 0 -349 0 0 -1675z" />
                <path className="klip-splash-elem" d="M5733 6412 c-102 -36 -195 -121 -241 -220 -24 -51 -27 -68 -27 -172 0 -104 3 -121 27 -173 37 -79 114 -157 196 -198 65 -33 71 -34 182 -34 110 0 118 2 177 33 110 57 177 131 214 240 21 60 27 171 14 232 -23 106 -113 218 -219 272 -55 29 -71 32 -166 35 -83 3 -116 0 -157 -15z" />
                <path className="klip-splash-elem" d="M1680 4665 l0 -1585 363 2 362 3 5 682 c4 482 9 686 17 694 8 8 31 -19 88 -103 89 -131 532 -803 715 -1085 l125 -193 433 0 c237 0 432 3 432 7 0 9 -149 230 -167 248 -7 8 -13 17 -13 21 0 14 -173 264 -183 264 -6 0 -7 3 -4 7 4 3 1 13 -6 22 -8 9 -48 71 -91 139 -43 67 -82 122 -87 122 -5 0 -9 5 -9 11 0 12 -60 103 -72 107 -4 2 -8 8 -8 14 0 17 -142 228 -153 228 -6 0 -8 3 -4 6 6 7 -51 96 -65 102 -4 2 -8 8 -8 13 0 15 -132 209 -142 209 -5 0 -7 4 -4 9 3 5 -1 11 -9 15 -8 3 -15 12 -15 21 0 8 -5 15 -10 15 -6 0 -9 3 -9 8 3 20 -2 32 -12 26 -14 -8 4 27 41 81 125 180 970 1458 970 1465 0 6 -149 10 -412 10 l-413 0 -137 -208 c-75 -114 -243 -369 -373 -567 -313 -476 -386 -585 -395 -590 -16 -10 -20 127 -20 728 0 416 -3 626 -10 622 -5 -3 -10 -1 -10 4 0 8 -112 11 -355 11 l-355 0 0 -1585z" />
                <path className="klip-splash-elem" d="M7785 5356 c-160 -32 -286 -99 -395 -210 -36 -36 -68 -66 -72 -66 -4 0 -9 53 -10 118 l-3 117 -337 3 -338 2 -1 -52 c-4 -165 3 -3244 7 -3250 7 -11 655 -10 672 0 10 7 13 118 12 539 0 549 5 703 24 703 6 0 40 -22 75 -50 83 -65 198 -124 297 -152 68 -20 101 -23 239 -22 133 0 174 4 240 22 409 112 698 463 771 937 21 132 13 384 -15 505 -68 297 -204 521 -408 674 -171 129 -335 185 -558 192 -86 2 -154 -1 -200 -10z m175 -628 c144 -53 254 -183 293 -348 48 -202 22 -382 -78 -532 -104 -156 -265 -226 -455 -197 -191 29 -342 176 -395 384 -35 137 -11 351 52 468 68 125 202 224 333 246 74 13 183 3 250 -21z" />
                <path className="klip-splash-elem" d="M5520 4200 l0 -1120 350 0 350 0 0 1120 0 1120 -350 0 -350 0 0 -1120z" />
              </g>
            </svg>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}