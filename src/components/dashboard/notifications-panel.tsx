"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check, ChevronRight, Loader2 } from "lucide-react";
import { refreshNotifications } from "@/lib/dashboard/use-notifications";

type DashboardNotification = {
  id: string;
  type: string;
  category: "urgent" | "action" | "info";
  title: string;
  description: string;
  href: string;
  timestamp: string;
};

type PendingComplete = {
  id: string;
  customer_name: string;
  start_time: string;
};

type FeedEntry = {
  id: string;
  kind: "notif" | "turno";
  category: "urgent" | "action" | "info";
  title: string;
  description: string;
  href: string;
  timestamp: string;
  dateKey: string;
  appointmentId?: string;
};

const READ_STORAGE_KEY = "klip-notifications-read";
const ART_TZ = "America/Argentina/Buenos_Aires";

function getReadIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveReadIds(ids: string[]) {
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids));
  } catch { }
}

function artDateKey(iso: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: ART_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(iso));
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch { }
  return "unknown";
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: ART_TZ });
  } catch {
    return "";
  }
}

function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === "unknown") return "Recientes";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const parseKey = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const diffDays = Math.round((parseKey(todayKey) - parseKey(dateKey)) / DAY_MS);
  if (diffDays <= 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays === 2) return "Antes de ayer";
  const [y, m, d] = dateKey.split("-").map(Number);
  const currentYear = Number(new Date().toLocaleString("en-US", { timeZone: ART_TZ, year: "numeric" }));
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return y === currentYear ? `${dd}/${mm}` : `${dd}/${mm}/${y}`;
}

export default function NotificationsPanel({ onClose, shopId }: { onClose: () => void; shopId?: string | null }) {
  const [items, setItems] = useState<DashboardNotification[]>([]);
  const [pendingComplete, setPendingComplete] = useState<PendingComplete[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingDay, setCompletingDay] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReadIds(getReadIds());
    const fetchItems = async () => {
      try {
        const res = await fetch("/api/dashboard/notifications", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
          setPendingComplete(data.pendingComplete || []);
        }
      } catch { }
      setLoading(false);
    };
    fetchItems();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if ((e.target as HTMLElement)?.closest?.("[data-notif-toggle]")) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const unreadCount = items.filter((i) => !readIds.includes(i.id)).length;

  const markAllRead = useCallback(() => {
    const allIds = items.map((i) => i.id);
    saveReadIds(allIds);
    setReadIds(allIds);
    refreshNotifications();
  }, [items]);

  const handleBulkComplete = useCallback(async (dayId: string, ids: string[]) => {
    if (completingDay || ids.length === 0 || !shopId) return;
    setCompletingDay(dayId);
    try {
      const { bulkCompleteAppointments } = await import("@/lib/dashboard/appointments/mutations");
      const res = await bulkCompleteAppointments(shopId, ids);
      if (res.success) {
        setPendingComplete((prev) => prev.filter((p) => !ids.includes(p.id)));
        window.dispatchEvent(new CustomEvent("appointments-updated"));
      }
    } catch { }
    setCompletingDay(null);
  }, [shopId, completingDay]);

  const todayKey = artDateKey(new Date().toISOString());

  const feed: FeedEntry[] = [
    ...items.map((i) => ({
      id: i.id,
      kind: "notif" as const,
      category: i.category,
      title: i.title,
      description: i.description,
      href: i.href,
      timestamp: i.timestamp,
      dateKey: artDateKey(i.timestamp),
    })),
    ...pendingComplete.map((p) => ({
      id: `turno-${p.id}`,
      kind: "turno" as const,
      category: "action" as const,
      title: p.customer_name,
      description: "Turno por completar",
      href: "/dashboard/calendar",
      timestamp: p.start_time,
      dateKey: artDateKey(p.start_time),
      appointmentId: p.id,
    })),
  ].sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

  const groupedByDay = feed.reduce<Record<string, FeedEntry[]>>((acc, entry) => {
    if (!acc[entry.dateKey]) acc[entry.dateKey] = [];
    acc[entry.dateKey].push(entry);
    return acc;
  }, {});

  const dayGroups = Object.keys(groupedByDay)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((dateKey) => ({
      dateKey,
      label: dayLabel(dateKey, todayKey),
      entries: groupedByDay[dateKey],
    }));

  return (
    <div ref={panelRef} className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-white/20 dark:border-white/10 bg-white/95 dark:bg-black/85 backdrop-blur-xl shadow-xl overflow-hidden z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/20 dark:border-white/10">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Notificaciones</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-semibold text-white bg-red-500 rounded-full px-1.5 py-0.5 leading-none">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 font-medium flex items-center gap-1 transition-colors"
          >
            <Check className="w-3 h-3" />
            Leer todas
          </button>
        )}
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-violet-500 rounded-full animate-spin" />
          </div>
        )}
        {!loading && (
          <>
            {dayGroups.length === 0 && (
              <div className="text-center py-8 text-zinc-500 dark:text-zinc-400 text-sm">
                No hay notificaciones nuevas
              </div>
            )}

            {dayGroups.map((day) => {
              const turnos = day.entries.filter((e) => e.kind === "turno");
              const turnoIds = turnos.map((t) => t.appointmentId!).filter(Boolean);
              return (
                <div key={day.dateKey} className="mb-3">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {day.label}
                    </span>
                    {turnoIds.length > 0 && (
                      <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        {turnoIds.length} turno{turnoIds.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {day.entries.map((entry) =>
                      entry.kind === "turno" ? (
                        <div
                          key={entry.id}
                          className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-200/50 dark:border-amber-800/30"
                        >
                          <span className="mt-0.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-amber-900 dark:text-amber-100 font-medium leading-tight">
                              {entry.title}
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                              {entry.description}
                            </p>
                          </div>
                          <span className="text-[10px] text-amber-500 dark:text-amber-400 shrink-0">
                            {formatTime(entry.timestamp)}
                          </span>
                        </div>
                      ) : (
                        <a
                          key={entry.id}
                          href={entry.href}
                          onClick={() => {
                            const next = [...readIds, entry.id];
                            saveReadIds(next);
                            setReadIds(next);
                            refreshNotifications();
                            onClose();
                          }}
                          className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                            readIds.includes(entry.id)
                              ? "opacity-60 hover:opacity-100 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                              : "bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                          }`}
                        >
                          <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                            entry.category === "urgent" ? "bg-red-500" : entry.category === "action" ? "bg-amber-400" : "bg-blue-400"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-tight ${readIds.includes(entry.id) ? "text-zinc-600 dark:text-zinc-400" : "text-gray-900 dark:text-white font-medium"}`}>
                              {entry.title}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                              {entry.description}
                            </p>
                          </div>
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">
                            {formatTime(entry.timestamp)}
                          </span>
                        </a>
                      )
                    )}
                  </div>
                  {turnoIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkComplete(day.dateKey, turnoIds)}
                      disabled={completingDay === day.dateKey}
                      className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-xs font-semibold px-3 py-2 transition-colors"
                    >
                      {completingDay === day.dateKey ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      {completingDay === day.dateKey
                        ? "Completando..."
                        : `Completar ${turnoIds.length} turno${turnoIds.length !== 1 ? "s" : ""} como pagado`}
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
