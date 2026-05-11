"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DashboardSidebar from "./dashboard-sidebar";

interface DashboardHeaderProps {
  shopName: string;
  userName: string;
  onLogout: () => void;
}

export default function DashboardHeader({
  shopName,
  userName,
  onLogout,
}: DashboardHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center gap-3 bg-white/30 dark:bg-black/30 backdrop-blur-3xl border-b border-white/20 dark:border-white/10 px-6 py-3 lg:px-8 transition-colors">
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5 transition-all cursor-pointer select-none"
        >
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </button>

        <h2 className="text-lg font-semibold text-gray-800 dark:text-white tracking-tight">{shopName}</h2>
      </header>

      <AnimatePresence>
        {mobileOpen && (
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
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="fixed inset-y-0 left-0 w-64 shadow-xl dark:shadow-black/40"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300, transition: { duration: 0.2, ease: "easeIn" } }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/20 dark:border-white/10 bg-white/30 dark:bg-black/30 backdrop-blur-3xl">
                <h1 className="text-xl font-bold text-violet-700 tracking-tight">Klip</h1>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-all cursor-pointer select-none"
                >
                  <X className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>
              <DashboardSidebar
                userName={userName}
                onLogout={() => {
                  setMobileOpen(false);
                  onLogout();
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
