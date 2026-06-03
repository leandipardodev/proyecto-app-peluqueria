"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
              <div className="inline-flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-[#0071E3]">Klip</span>
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
