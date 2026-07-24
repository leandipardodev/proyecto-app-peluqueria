"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import { X } from "lucide-react";
import DashboardSidebar from "./dashboard-sidebar";

type Props = {
  open: boolean;
  onClose: () => void;
  userName: string;
};

export default function DashboardMobileSidebar({ open, onClose, userName }: Props) {
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
            className="fixed inset-0 z-[70] min-[1367px]:hidden overflow-hidden pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              className="absolute inset-y-0 -left-4 w-[17rem] pl-4 bg-gradient-to-b from-white via-white to-zinc-50/90 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 shadow-2xl shadow-black/15 dark:shadow-black/60 flex flex-col max-h-full pointer-events-auto"
              initial={{ x: -280, opacity: 0, scale: 0.96 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: -280, opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: [0.32, 0, 0.67, 0] } }}
              transition={{ type: "spring", damping: 20, stiffness: 250, mass: 0.8 }}
            >
            <div className="flex items-center justify-between px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] border-b border-white/20 dark:border-white/10 bg-white/30 dark:bg-black/30 backdrop-blur-3xl shrink-0">
              <div
                onClick={() => {
                  const els = document.querySelectorAll<HTMLSpanElement>("#klip-mobile-logo span");
                  els.forEach((el, i) => {
                    const angle = Math.random() * Math.PI * 2;
                    const distance = 60 + Math.random() * 100;
                    animate(el,
                      { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, rotate: (Math.random() - 0.5) * 360 },
                      { duration: 0.25, delay: i * 0.04, ease: "easeOut" },
                    ).then(() => {
                      animate(el,
                        { x: 0, y: 0, rotate: 0 },
                        { type: "spring", stiffness: 250, damping: 7, mass: 0.6 },
                      );
                    });
                  });
                }}
                className="inline-flex items-center gap-2 cursor-pointer select-none"
              >
                <span id="klip-mobile-logo" className="text-xl font-bold tracking-tight text-[#0071E3]">Klip</span>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-all cursor-pointer select-none"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <DashboardSidebar
                userName={userName}
                showBrand={false}
              />
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
