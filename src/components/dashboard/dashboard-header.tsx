"use client";

import { Menu, X, Search } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DashboardSidebar from "./dashboard-sidebar";
import { playPop } from "@/lib/sound";

interface DashboardHeaderProps {
  shopName: string;
  userName: string;
  onLogout: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function DashboardHeader({
  shopName,
  userName,
  onLogout,
}: DashboardHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  function handleMobileOpen() {
    playPop();
    setMobileOpen(true);
  }

  useEffect(() => {
    if (searchFocused && searchRef.current) {
      searchRef.current.focus();
    }
  }, [searchFocused]);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center gap-4 bg-white/10 dark:bg-black/10 backdrop-blur-xl border-b border-white/20 dark:border-white/10 px-4 py-2.5 lg:px-6 transition-colors">
        <button
          onClick={handleMobileOpen}
          className="lg:hidden p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5 transition-all cursor-pointer select-none"
        >
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </button>

        <h2 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white tracking-tight shrink-0">
          {shopName}
        </h2>

        <div className="hidden sm:flex flex-1 justify-center">
          <div
            className={`relative transition-all duration-300 ease-out ${
              searchFocused ? "w-80" : "w-56"
            }`}
          >
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar turnos, clientes..."
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 pl-9 pr-4 py-2 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <div
            className="w-9 h-9 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-sm font-semibold text-violet-700 dark:text-violet-300 shrink-0 select-none"
            title={userName}
          >
            {getInitials(userName)}
          </div>
        </div>
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
