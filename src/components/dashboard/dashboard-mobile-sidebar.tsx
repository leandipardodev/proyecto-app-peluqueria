"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import { X } from "lucide-react";
import DashboardSidebar from "./dashboard-sidebar";

type Props = {
  open: boolean;
  onClose: () => void;
  userName: string;
  onLogout: () => void;
};

export default function DashboardMobileSidebar({ open, onClose, userName, onLogout }: Props) {
  const [showBlur, setShowBlur] = useState(false);
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      const t = setTimeout(() => setShowBlur(true), 2000);
      return () => {
        document.body.style.overflow = "";
        clearTimeout(t);
        setShowBlur(false);
      };
    } else {
      document.body.style.overflow = "";
      setShowBlur(false);
    }
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] min-[1367px]:hidden overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="absolute inset-0 bg-black/20"
            style={{
              backdropFilter: showBlur ? "blur(2px)" : "blur(0px)",
              WebkitBackdropFilter: showBlur ? "blur(2px)" : "blur(0px)",
              transition: "backdrop-filter 1s ease-out, -webkit-backdrop-filter 1s ease-out",
            }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-y-0 -left-4 w-[17rem] pl-4 bg-gradient-to-b from-white via-white to-zinc-50/90 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 shadow-2xl shadow-black/15 dark:shadow-black/60 flex flex-col max-h-full"
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
                onLogout={onLogout}
                onNavigate={onClose}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
