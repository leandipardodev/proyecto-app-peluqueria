"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  Loader2,
  CalendarPlus,
  CalendarX2,
  Package,
  AlertTriangle,
  UserPlus,
  Gift,
  Banknote,
  Tag,
  Cake,
  Sparkles,
  Clock,
} from "lucide-react";
import {
  useNotifications,
  markNotificationsRead,
  type NotificationItem,
} from "@/lib/dashboard/use-notifications";

const ART_TZ = "America/Argentina/Buenos_Aires";

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

function timeLabel(iso: string, now: Date): string {
  try {
    const date = new Date(iso);
    const diffMs = now.getTime() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "ahora";
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return dayLabel(artDateKey(iso), artDateKey(now.toISOString()));
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

function typeStyle(type: string): { Icon: typeof Bell; className: string } {
  switch (type) {
    case "nuevo_turno":
      return { Icon: CalendarPlus, className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" };
    case "turno_cancelado":
      return { Icon: CalendarX2, className: "bg-red-500/15 text-red-600 dark:text-red-400" };
    case "stock_bajo":
      return { Icon: AlertTriangle, className: "bg-red-500/15 text-red-600 dark:text-red-400" };
    case "nuevo_pedido":
      return { Icon: Package, className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
    case "nuevo_miembro":
      return { Icon: UserPlus, className: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" };
    case "voucher_enviado":
      return { Icon: Gift, className: "bg-pink-500/15 text-pink-600 dark:text-pink-400" };
    case "transferencia_pendiente":
      return { Icon: Banknote, className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
    case "recompensa_disponible":
      return { Icon: Sparkles, className: "bg-violet-500/15 text-violet-600 dark:text-violet-400" };
    case "cliente_cumpleaños":
      return { Icon: Cake, className: "bg-pink-500/15 text-pink-600 dark:text-pink-400" };
    case "plan_por_vencer":
      return { Icon: Clock, className: "bg-red-500/15 text-red-600 dark:text-red-400" };
    case "oportunidad_estacional":
      return { Icon: Tag, className: "bg-sky-500/15 text-sky-600 dark:text-sky-400" };
    default:
      return { Icon: Bell, className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" };
  }
}

function NotificationRow({ item, onClose }: { item: NotificationItem; onClose: () => void }) {
  const { Icon, className } = typeStyle(item.type);
  return (
    <a
      href={item.href}
      onClick={() => {
        if (!item.isRead) void markNotificationsRead([item.id]);
        onClose();
      }}
      className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors ${
        item.isRead
          ? "opacity-70 hover:opacity-100 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
          : "bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30"
      }`}
    >
      <span className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${className}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${item.isRead ? "text-zinc-600 dark:text-zinc-400" : "text-gray-900 dark:text-white font-semibold"}`}>
          {item.title}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
          {item.description}
        </p>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
          {timeLabel(item.timestamp, new Date())}
        </p>
      </div>
      {!item.isRead && (
        <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
      )}
    </a>
  );
}

export default function NotificationsPanel({ onClose, shopId }: { onClose: () => void; shopId?: string | null }) {
  const { items, pendingComplete, unreadCount, loading } = useNotifications(shopId);
  const [completing, setCompleting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  const handleBulkComplete = useCallback(async () => {
    if (completing || pendingComplete.length === 0 || !shopId) return;
    setCompleting(true);
    try {
      const { bulkCompleteAppointments } = await import("@/lib/dashboard/appointments/mutations");
      const res = await bulkCompleteAppointments(shopId, pendingComplete.map((p) => p.id));
      if (res.success) {
        window.dispatchEvent(new CustomEvent("appointments-updated"));
        void import("@/lib/dashboard/use-notifications").then((m) => m.refetchNotifications());
      }
    } catch { }
    setCompleting(false);
  }, [shopId, completing, pendingComplete]);

  const sorted = [...items].sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  const unreadItems = sorted.filter((i) => !i.isRead);
  const readItems = sorted.filter((i) => i.isRead);
  const todayKey = artDateKey(new Date().toISOString());

  const groupedByDay = readItems.reduce<Record<string, NotificationItem[]>>((acc, entry) => {
    const key = artDateKey(entry.timestamp);
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
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
        {unreadItems.length > 0 && (
          <button
            type="button"
            onClick={() => void markNotificationsRead("all")}
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
            {pendingComplete.length > 0 && (
              <div className="mb-2 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-200/50 dark:border-amber-800/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Turnos por completar
                  </span>
                </div>
                <div className="space-y-1.5">
                  {pendingComplete.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-amber-900 dark:text-amber-100 font-medium truncate">
                        {p.customer_name}
                      </span>
                      <span className="text-[10px] text-amber-500 dark:text-amber-400 shrink-0">
                        {formatTime(p.start_time)}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void handleBulkComplete()}
                  disabled={completing}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-xs font-semibold px-3 py-2 transition-colors"
                >
                  {completing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  {completing
                    ? "Completando..."
                    : `Completar ${pendingComplete.length} turno${pendingComplete.length !== 1 ? "s" : ""} como pagado`}
                </button>
              </div>
            )}

            {unreadItems.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Nuevas
                  </span>
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                </div>
                <div className="space-y-1">
                  {unreadItems.map((item) => (
                    <NotificationRow key={item.id} item={item} onClose={onClose} />
                  ))}
                </div>
              </div>
            )}

            {dayGroups.length === 0 && unreadItems.length === 0 && pendingComplete.length === 0 && (
              <div className="text-center py-8 text-zinc-500 dark:text-zinc-400 text-sm">
                No hay notificaciones nuevas
              </div>
            )}

            {dayGroups.map((day) => (
              <div key={day.dateKey} className="mb-2">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {day.label}
                  </span>
                </div>
                <div className="space-y-1">
                  {day.entries.map((item) => (
                    <NotificationRow key={item.id} item={item} onClose={onClose} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
