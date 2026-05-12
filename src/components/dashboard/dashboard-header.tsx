"use client";

import { Menu, X, Search, Bell, BellOff, Moon, Sun } from "lucide-react";
import { useState, useRef, useEffect, useTransition, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DashboardSidebar from "./dashboard-sidebar";
import { playPop } from "@/lib/sound";
import { useRouter } from "next/navigation";
import { globalSearch, type GlobalSearchResult } from "@/lib/dashboard/global-search-actions";
import { useDarkMode } from "@/lib/use-dark-mode";
import { isMuted, setMuted } from "@/lib/sound";
import { supabase } from "@/lib/supabase";

interface DashboardHeaderProps {
  shopName: string;
  userName: string;
  userEmail: string;
  onLogout: () => Promise<void>;
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
  userEmail,
  onLogout,
}: DashboardHeaderProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutPending, startLogoutTransition] = useTransition();
  const [menuLoading, setMenuLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [accountRole, setAccountRole] = useState<string | null>(null);
  const [planExpiry, setPlanExpiry] = useState<string | null>(null);
  const [shopActive, setShopActive] = useState<boolean | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const { dark, toggle: toggleDark } = useDarkMode();

  function handleMobileOpen() {
    playPop();
    setMobileOpen(true);
  }

  useEffect(() => {
    if (searchFocused && searchRef.current) {
      searchRef.current.focus();
    }
  }, [searchFocused]);

  useEffect(() => {
    if (!searchFocused) return;
    function handleClickOutside(e: MouseEvent) {
      if (!searchBoxRef.current) return;
      if (!searchBoxRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchFocused]);

  useEffect(() => {
    setSoundEnabled(!isMuted());
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (!avatarMenuRef.current) return;
      if (!avatarMenuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    let cancelled = false;

    async function loadMenuData() {
      setMenuLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) {
        setMenuLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from("user_profiles")
        .select("shop_id, name, role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      setAccountName((profileData?.name as string | null) ?? user.user_metadata?.full_name ?? userName);
      setAccountRole((profileData?.role as string | null) ?? null);

      if (profileData?.shop_id) {
        const { data: shopData } = await supabase
          .from("shops")
          .select("plan_expiry, active")
          .eq("id", profileData.shop_id)
          .maybeSingle();

        if (!cancelled) {
          setPlanExpiry((shopData?.plan_expiry as string | null) ?? null);
          setShopActive((shopData?.active as boolean | null) ?? null);
        }
      }

      if (!cancelled) {
        setMenuLoading(false);
      }
    }

    void loadMenuData();
    return () => {
      cancelled = true;
    };
  }, [menuOpen, userName]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setActiveIndex(-1);
      setSearchError(null);
      return;
    }

    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearch(q);
        if (!res.success) {
          setSearchError(res.error);
          setResults([]);
          setActiveIndex(-1);
          return;
        }
        setSearchError(null);
        setResults(res.data ?? []);
        setActiveIndex(-1);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function handleResultClick(result: GlobalSearchResult) {
    setSearchFocused(false);
    setQuery("");
    setResults([]);

    if (result.type === "customer") {
      router.push(`/dashboard/customers?q=${encodeURIComponent(result.nombre || result.email || result.telefono || "")}&customerId=${result.id}`);
      return;
    }

    const date = new Date(result.start_time);
    const dateParam = Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
    router.push(`/dashboard/calendar?date=${encodeURIComponent(dateParam)}&appointmentId=${result.id}`);
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!searchFocused || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const target = activeIndex >= 0 ? results[activeIndex] : results[0];
      if (target) handleResultClick(target);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setSearchFocused(false);
    }
  }

  function handleLogoutClick() {
    startLogoutTransition(async () => {
      await onLogout();
      router.refresh();
    });
  }

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
            ref={searchBoxRef}
            className={`relative transition-all duration-300 ease-out ${
              searchFocused ? "w-80" : "w-56"
            }`}
          >
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar turnos, clientes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={handleSearchKeyDown}
              className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 pl-9 pr-4 py-2 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
            />
            {searchFocused && (query.trim().length >= 2 || isPending || searchError) && (
              <div className="absolute top-11 left-0 right-0 z-50 rounded-2xl border border-white/20 dark:border-white/10 bg-white/90 dark:bg-black/80 backdrop-blur-xl shadow-xl overflow-hidden">
                {isPending ? (
                  <div className="px-4 py-3 text-sm text-zinc-500">Buscando...</div>
                ) : searchError ? (
                  <div className="px-4 py-3 text-sm text-red-600">{searchError}</div>
                ) : results.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-zinc-500">Sin resultados</div>
                ) : (
                  <ul>
                    {results.map((result, index) => (
                      <li key={`${result.type}-${result.id}`}>
                        <button
                          type="button"
                          onClick={() => handleResultClick(result)}
                          onMouseEnter={() => setActiveIndex(index)}
                          className={`w-full px-4 py-2.5 text-left transition-colors ${
                            index === activeIndex
                              ? "bg-white/80 dark:bg-white/15"
                              : "hover:bg-white/70 dark:hover:bg-white/10"
                          }`}
                        >
                          <div className="text-sm text-gray-900 dark:text-white">
                            {result.type === "customer"
                              ? result.nombre || result.email || result.telefono || "Cliente"
                              : result.customer_name || "Turno"}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {result.type === "customer"
                              ? `${result.email || "Sin email"} · ${result.telefono || "Sin tel"}`
                              : `Turno · ${new Date(result.start_time).toLocaleString("es-AR")}`}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <div ref={avatarMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="w-9 h-9 rounded-full bg-violet-600 border border-violet-500/80 flex items-center justify-center text-sm font-semibold text-white shrink-0 select-none hover:bg-violet-500 transition-colors"
              title={userName}
            >
              {getInitials(userName)}
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/20 dark:border-white/10 bg-white/95 dark:bg-black/85 backdrop-blur-xl shadow-xl overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-white/20 dark:border-white/10">
                  <p className="text-xs text-zinc-500">Cuenta</p>
                  <p className="text-sm text-gray-900 dark:text-white truncate">{userEmail || userName}</p>
                </div>
                <div className="p-3 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div>
                    <p className="text-xs text-zinc-500">Nombre</p>
                    <p className="text-sm text-gray-900 dark:text-white">{accountName || userName}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-zinc-500">Rol</p>
                      <p className="text-gray-900 dark:text-white capitalize">{accountRole || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Estado</p>
                      <p className={shopActive ? "text-green-600" : "text-red-600"}>{shopActive === null ? "-" : shopActive ? "Activo" : "Inactivo"}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-zinc-500">Vencimiento del plan</p>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {planExpiry ? new Date(planExpiry).toLocaleDateString("es-AR") : "-"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/20 dark:border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                      {dark ? <Moon className="w-4 h-4 text-violet-500" /> : <Sun className="w-4 h-4 text-amber-500" />}
                      {dark ? "Modo oscuro" : "Modo claro"}
                    </div>
                    <button
                      type="button"
                      onClick={toggleDark}
                      className={`relative w-10 h-5 rounded-full transition-colors ${dark ? "bg-violet-600" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${dark ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/20 dark:border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                      {soundEnabled ? <Bell className="w-4 h-4 text-violet-500" /> : <BellOff className="w-4 h-4 text-zinc-400" />}
                      {soundEnabled ? "Sonido activado" : "Sonido silenciado"}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !soundEnabled;
                        setSoundEnabled(next);
                        setMuted(!next);
                        if (next) playPop();
                      }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${soundEnabled ? "bg-violet-600" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${soundEnabled ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>

                  {menuLoading && <p className="text-xs text-zinc-500">Cargando datos...</p>}

                  <button
                    type="button"
                    onClick={handleLogoutClick}
                    disabled={logoutPending}
                    className="block w-full text-left px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-60"
                  >
                    {logoutPending ? "Cerrando sesión..." : "Cerrar Sesión"}
                  </button>
                </div>
              </div>
            )}
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
