"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function DashboardPageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    setShowOverlay(true);
    const timer = setTimeout(() => setShowOverlay(false), 260);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div className="relative min-h-0">
      <motion.div
        key={pathname}
        initial={{ opacity: 0.94, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>

      <AnimatePresence>
        {showOverlay && (
          <motion.div
            initial={{ opacity: 0.22 }}
            animate={{ opacity: 0.08 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          >
            <div
              className="absolute -inset-x-20 top-0 h-full animate-[dashboardShimmer_0.9s_ease-out]"
              style={{
                background:
                  "linear-gradient(100deg, transparent 35%, rgba(255,255,255,0.5) 50%, transparent 65%)",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes dashboardShimmer {
          0% { transform: translateX(-55%); }
          100% { transform: translateX(55%); }
        }
      `}</style>
    </div>
  );
}
