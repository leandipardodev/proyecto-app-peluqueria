"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { usePerformanceMode } from "@/lib/use-performance-mode";

type TransitionPreset = {
  enterDuration: number;
  exitDuration: number;
  overlayDuration: number;
  enterY: number;
  exitY: number;
  enterBlur: number;
  exitBlur: number;
};

const PRESETS: Record<"snappy" | "cinematic", TransitionPreset> = {
  snappy: {
    enterDuration: 0.16,
    exitDuration: 0.12,
    overlayDuration: 0.14,
    enterY: 6,
    exitY: -4,
    enterBlur: 1.2,
    exitBlur: 1,
  },
  cinematic: {
    enterDuration: 0.26,
    exitDuration: 0.2,
    overlayDuration: 0.22,
    enterY: 12,
    exitY: -8,
    enterBlur: 2.4,
    exitBlur: 1.8,
  },
};

const ACTIVE_PRESET: keyof typeof PRESETS = "cinematic";

export default function DashboardPageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const { performanceMode } = usePerformanceMode();
  const preset = PRESETS[ACTIVE_PRESET];

  useEffect(() => {
    const onStart = () => setIsNavigating(true);
    window.addEventListener("dashboard:nav-start", onStart);
    return () => window.removeEventListener("dashboard:nav-start", onStart);
  }, []);

  useEffect(() => {
    if (!isNavigating) return;
    const timer = setTimeout(() => setIsNavigating(false), performanceMode ? 80 : 260);
    return () => clearTimeout(timer);
  }, [isNavigating, pathname, performanceMode]);

  return (
    <div className="relative min-h-0 isolate">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          initial={performanceMode ? { opacity: 1 } : { opacity: 0.94, y: preset.enterY, filter: `blur(${preset.enterBlur}px)` }}
          animate={performanceMode ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={performanceMode ? { opacity: 0.98 } : { opacity: 0, y: preset.exitY, filter: `blur(${preset.exitBlur}px)` }}
          transition={
            performanceMode
              ? { duration: 0.08 }
              : {
                  duration: preset.enterDuration,
                  ease: [0.22, 1, 0.36, 1],
                }
          }
        >
          {children}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {isNavigating && !performanceMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.12 }}
            exit={{ opacity: 0 }}
            transition={{ duration: preset.overlayDuration, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl z-10"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
