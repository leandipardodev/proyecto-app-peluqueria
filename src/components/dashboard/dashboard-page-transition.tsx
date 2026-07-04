"use client";

import { motion } from "framer-motion";
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
      <motion.div
        initial={{ opacity: 0.98 }}
        animate={{ opacity: 1 }}
        transition={{ duration: performanceMode ? 0.09 : FADE_DURATION, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </div>
  );
}