"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { usePerformanceMode } from "@/lib/use-performance-mode";
import { getDashboardNavTransitionEventName } from "@/lib/dashboard/nav-transition";

const NAV_EVENT = getDashboardNavTransitionEventName();
const FADE_DURATION = 0.18;

export default function DashboardPageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [glassVisible, setGlassVisible] = useState(false);
  const { performanceMode } = usePerformanceMode();

  useEffect(() => {
    const onStart = () => setGlassVisible(true);
    window.addEventListener(NAV_EVENT, onStart);
    return () => window.removeEventListener(NAV_EVENT, onStart);
  }, []);

  useEffect(() => {
    if (!glassVisible) return;
    let rafA = 0;
    let rafB = 0;
    rafA = window.requestAnimationFrame(() => {
      rafB = window.requestAnimationFrame(() => setGlassVisible(false));
    });
    return () => {
      window.cancelAnimationFrame(rafA);
      window.cancelAnimationFrame(rafB);
    };
  }, [pathname, glassVisible]);

  return (
    <div className="relative min-h-0 isolate">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          initial={performanceMode ? { opacity: 1 } : { opacity: 0.98 }}
          animate={{ opacity: 1 }}
          exit={performanceMode ? { opacity: 0.99 } : { opacity: 0.96 }}
          transition={{ duration: performanceMode ? 0.09 : FADE_DURATION, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {glassVisible && !performanceMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: FADE_DURATION, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-3xl"
          >
            <div className="absolute inset-0 border border-white/10 bg-white/5 backdrop-blur-md dark:bg-black/5" />
            <div className="absolute -left-24 -top-16 h-56 w-56 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/15" />
            <div className="absolute -right-24 bottom-0 h-64 w-64 rounded-full bg-cyan-200/20 blur-3xl dark:bg-cyan-500/15" />
            <div className="absolute left-1/3 top-1/2 h-44 w-44 -translate-y-1/2 rounded-full bg-white/20 blur-3xl dark:bg-white/10" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
