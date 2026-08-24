"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DashboardSidebar from "./dashboard-sidebar";

type Props = {
  open: boolean;
  onClose: () => void;
  userName: string;
};

export default function DashboardMobileSidebar({ open, onClose, userName }: Props) {
  const [playKey, setPlayKey] = useState(0);
  const backdropRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const blurRef = useRef(0);

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

    el.animate(
      [
        { backgroundColor: open ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.2)" },
        { backgroundColor: open ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0)" },
      ],
      { duration: 300, easing: "ease", fill: "forwards" },
    );
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
    document.body.style.overflow = "";
  }, [open]);

  return (
    <>
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
            <div className="ml-4 flex flex-col items-start -translate-y-3">
              {/* Logo flotando fuera del panel */}
              <motion.button
                type="button"
                onClick={() => setPlayKey((k) => k + 1)}
                whileTap={{ scale: 0.94 }}
                className="relative z-10 ml-3 mb-3 inline-flex cursor-pointer select-none"
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
              />
            </div>
          </motion.div>
            </div>
        </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
