"use client";

import { useEffect } from "react";
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
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="fixed inset-0 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-y-0 left-0 w-64 shadow-xl dark:shadow-black/40"
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300, transition: { duration: 0.2, ease: "easeIn" } }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div className="flex items-center justify-between px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] border-b border-white/20 dark:border-white/10 bg-white/30 dark:bg-black/30 backdrop-blur-3xl">
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
            <DashboardSidebar
              userName={userName}
              showBrand={false}
              onLogout={onLogout}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
