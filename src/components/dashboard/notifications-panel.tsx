"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check, Bug, CircleHelp, ChevronRight, Loader2 } from "lucide-react";

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

type DayGroup = {
  dateKey: string;
  dayLabel: string;
  appointments: PendingComplete[];
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Bell }> = {
  urgente: { label: "Urgente", icon: Bug },
  accion: { label: "Para tener en cuenta", icon: CircleHelp },
  info: { label: "Información", icon: Bell },
};

const CATEGORY_MAP: Record<string, string> = {
  urgent: "urgente",
  action: "accion",
  info: "info",
};

const READ_STORAGE_KEY = "klip-notifications-read";

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

const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function formatDayLabel(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00-03:00");
    return `${dayNames[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  } catch {
    return "";
  }
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
  }, [items]);

  const handleBulkComplete = useCallback(async (dayId: string, ids: string[]) => {
    if (completingDay || ids.length === 0 || !shopId) return;
    setCompletingDay(dayId);
    try {
      const { bulkCompleteAppointments } = await import("@/lib/dashboard/appointments/mutations");
      const res = await bulkCompleteAppointments(shopId, ids);
      if (res.success) {
        setPendingComplete((prev) => prev.filter((p) => !ids.includes(p.id)));
      }
    } catch { }
    setCompletingDay(null);
  }, [shopId, completingDay]);

  const days = pendingComplete.reduce<Record<string, PendingComplete[]>>((acc, p) => {
    const key = p.start_time?.slice(0, 10) || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const dayGroups: DayGroup[] = Object.entries(days)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, appointments]) => ({
      dateKey,
      dayLabel: formatDayLabel(dateKey),
      appointments,
    }));

  const grouped = items.reduce<Record<string, DashboardNotification[]>>((acc, item) => {
    const cat = CATEGORY_MAP[item.category] || "info";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

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
            {dayGroups.length > 0 && (
              <div className="mb-3 space-y-3">
                {dayGroups.map((day) => (
                  <div
                    key={day.dateKey}
                    className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-200/50 dark:border-amber-800/30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span className="text-xs font-semibold text-amber-800 dark:text-amber-200 uppercase tracking-wide">
                          {day.dayLabel}
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                        {day.appointments.length} turno(s)
                      </span>
                    </div>
                    <div className="space-y-1 mb-2">
                      {day.appointments.map((p) => (
                        <div key={p.id} className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                          {p.customer_name}
                          <span className="text-amber-500 dark:text-amber-400">· {formatTime(p.start_time)}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleBulkComplete(day.dateKey, day.appointments.map((p) => p.id))}
                      disabled={completingDay === day.dateKey}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-xs font-semibold px-3 py-2 transition-colors"
                    >
                      {completingDay === day.dateKey ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      {completingDay === day.dateKey ? "Completando..." : `Completar todos como pagado`}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {items.length === 0 && (
              <div className="text-center py-8 text-zinc-500 dark:text-zinc-400 text-sm">
                No hay notificaciones nuevas
              </div>
            )}

            {items.length > 0 && (
              <>
                {Object.entries(grouped).map(([catKey, catItems]) => {
                  const config = CATEGORY_CONFIG[catKey] || CATEGORY_CONFIG.info;
                  const Icon = config.icon;
                  const hasUnread = catItems.some((i) => !readIds.includes(i.id));
                  return (
                    <div key={catKey} className="mb-2 last:mb-0">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
                        <Icon className="w-3 h-3" />
                        {config.label}
                        {hasUnread && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                      </div>
                      {catItems.map((item) => {
                        const isRead = readIds.includes(item.id);
                        return (
                          <a
                            key={item.id}
                            href={item.href}
                            onClick={() => {
                              const next = [...readIds, item.id];
                              saveReadIds(next);
                              setReadIds(next);
                              onClose();
                            }}
                            className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                              isRead
                                ? "opacity-60 hover:opacity-100 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                                : "bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                            }`}
                          >
                            <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                              item.category === "urgent" ? "bg-red-500" : item.category === "action" ? "bg-amber-400" : "bg-blue-400"
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-tight ${isRead ? "text-zinc-600 dark:text-zinc-400" : "text-gray-900 dark:text-white font-medium"}`}>
                                {item.title}
                              </p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                                {item.description}
                              </p>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
