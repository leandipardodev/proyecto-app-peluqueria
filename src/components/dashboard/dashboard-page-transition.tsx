"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { usePerformanceMode } from "@/lib/use-performance-mode";

const FADE_DURATION = 0.18;

export default function DashboardPageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { performanceMode } = usePerformanceMode();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return (
    <div className="relative min-h-0 isolate">
      <AnimatePresence mode="sync" initial={false}>
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
    </div>
  );
}
