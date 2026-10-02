"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import DashboardSidebar from "./dashboard-sidebar";

type Props = {
  open: boolean;
  onClose: () => void;
  userName: string;
};

// Duracion del desvanecido del backdrop (mismo `duration` de la animacion
// WAAPI de abajo). El nodo se saca del documento recien despues.
const BACKDROP_EXIT_MS = 300;

export default function DashboardMobileSidebar({ open, onClose, userName }: Props) {
  const [playKey, setPlayKey] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [backdropAlive, setBackdropAlive] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const blurRef = useRef(0);
  const waapiRef = useRef<Animation | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const el = backdropRef.current;
    if (!el) return;

    const target = open ? 12 : 0;
    const start = blurRef.current;
    const diff = target - start;
    const duration = open ? 1400 : 700;
    const startTime = performance.now();

    const current = el;

    function step(now: number) {
      // El backdrop se desmonta al terminar su desvanecido de salida; el rAF
      // puede sobrevivirlo y escribiria el estilo sobre un nodo huérfano.
      if (!current.isConnected) { rafRef.current = 0; return; }
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const value = start + diff * ease;
      current.style.backdropFilter = `blur(${value}px)`;
      current.style.setProperty("-webkit-backdrop-filter", `blur(${value}px)`);
      blurRef.current = value;
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);

    // Sin cancelar la anterior se acumulan (fill: "forwards") y cada apertura
    // deja otra animacion viva sobre el mismo elemento.
    waapiRef.current?.cancel();
    waapiRef.current = el.animate(
      [
        { backgroundColor: open ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.15)" },
        { backgroundColor: open ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0)" },
      ],
      { duration: 300, easing: "ease", fill: "forwards" },
    );

    // Sin este cleanup el rAF de apertura (1400ms) sigue corriendo contra un
    // nodo que ya no pertenece al documento si el header se desmonta con el
    // menu abierto.
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
    // `backdropAlive` va en las deps y no solo `open`: el nodo del backdrop no
    // esta en el documento hasta que el efecto de abajo lo monta, asi que con
    // solo `open` este efecto corria una vez con `backdropRef.current` en null
    // y no volvia a correr. La primera vez que se abria el menu el backdrop
    // salia sin dim y sin rampa de blur, y recien del segundo abrir en adelante
    // se veia bien.
  }, [open, backdropAlive]);

  // El backdrop tiene que sobrevivir al desvanecido de salida, pero con el menu
  // cerrado no puede quedar una capa `backdrop-filter` de pantalla completa en
  // el documento: es una compositing layer del tamano del viewport, y `blur(0px)`
  // sigue creando backdrop root. Se la saca del documento, no se la oculta.
  useEffect(() => {
    if (open) { setBackdropAlive(true); return; }
    const id = window.setTimeout(() => setBackdropAlive(false), BACKDROP_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
    document.body.style.overflow = "";
  }, [open]);

  // Escape cierra. Sin esto el menu abierto solo se cerraba tocando el backdrop
  // o navegando: dos acciones que no son obvias con teclado.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // El drawer tiene que vivir en el contexto de apilamiento de la raiz. Renderizado
  // dentro del header queda atrapado en el `relative z-10` de `dashboard/layout.tsx`,
  // asi que sus z-[65]/z-[70] valian 10 contra la raiz: cualquier overlay portéado a
  // `document.body` (BaseModal, ConfirmDialog, Sheet, tutoriales) se paints encima y
  // se queda con los toques del menu, que queda abierto y muerto.
  if (!mounted) return null;

  return createPortal(
    <>
      {backdropAlive && (
        <div
          ref={backdropRef}
          className="fixed inset-0 z-[65] min-[1367px]:hidden"
          style={{
            backdropFilter: "blur(0px)",
            WebkitBackdropFilter: "blur(0px)",
            backgroundColor: "rgba(0,0,0,0)",
            pointerEvents: open ? "auto" : "none",
          }}
          onClick={onClose}
        />
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-drawer"
            className="fixed inset-0 z-[70] min-[1367px]:hidden flex items-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1], delay: 0.04 } }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="ml-4 my-4 flex flex-col items-start -translate-y-3">
              {/* Logo flotando fuera del panel */}
              <motion.button
                type="button"
                onClick={() => setPlayKey((k) => k + 1)}
                whileTap={{ scale: 0.94 }}
                className="pointer-events-auto relative z-10 ml-3 mb-3 inline-flex cursor-pointer select-none"
                aria-label="Klip"
              >
                {["K", "l", "i", "p"].map((ch, i) => (
                  <motion.span
                    key={`${playKey}-${i}`}
                    initial={{ y: -22, opacity: 0, rotate: i % 2 ? 8 : -8, filter: "blur(4px)" }}
                    animate={{ y: 0, opacity: 1, rotate: 0, filter: "blur(0px)" }}
                    transition={{ delay: 0.08 + i * 0.055, type: "spring", stiffness: 420, damping: 17 }}
                    className="inline-block text-2xl font-bold tracking-tight text-[#0071E3]"
                  >
                    {ch}
                  </motion.span>
                ))}
              </motion.button>

            <motion.div
              className="relative w-[17rem] max-h-[72dvh] rounded-3xl overflow-hidden bg-gradient-to-b from-white via-white to-zinc-50/90 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 border border-white/40 dark:border-white/10 shadow-2xl shadow-black/25 dark:shadow-black/60 flex flex-col pointer-events-auto"
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{
                x: -340,
                opacity: 0,
                transition: { duration: 0.26, ease: [0.4, 0, 1, 1] },
              }}
              transition={{ type: "spring", damping: 20, stiffness: 250, mass: 0.8 }}
            >
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
              <DashboardSidebar
                userName={userName}
                showBrand={false}
                showUser={false}
                onNavigate={onClose}
              />
            </div>
          </motion.div>
            </div>
        </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
