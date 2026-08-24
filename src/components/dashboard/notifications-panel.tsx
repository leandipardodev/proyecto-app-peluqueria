"use client";

import { useRef, useEffect } from "react";
import {
  Bell,
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

function timeLabel(iso: string, now: Date): string {
  try {
    const date = new Date(iso);
    const diffMs = Math.max(0, now.getTime() - date.getTime());
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
  const { items, unreadCount, loading } = useNotifications(shopId);
  const panelRef = useRef<HTMLDivElement>(null);
  const seenUnreadRef = useRef<Set<string>>(new Set());

  // Mientras el panel esta abierto las no leidas se mantienen resaltadas.
  // Al CERRAR (desmontar) se marcan como leidas todas las que se vieron.
  useEffect(() => {
    for (const i of items) {
      if (!i.isRead) seenUnreadRef.current.add(i.id);
    }
  }, [items]);

  useEffect(() => () => {
    const ids = Array.from(seenUnreadRef.current);
    seenUnreadRef.current = new Set();
    if (ids.length > 0) void markNotificationsRead(ids);
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
    <div className="absolute right-0 mt-2 z-50">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-1 right-4 w-3 h-3 rotate-45 rounded-[2px] bg-white/95 dark:bg-black/85 border-l border-t border-white/20 dark:border-white/10"
      />
      <div ref={panelRef} className="relative w-80 sm:w-96 rounded-2xl border border-white/20 dark:border-white/10 bg-white/95 dark:bg-black/85 backdrop-blur-xl shadow-xl overflow-hidden">
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
        </div>

      <div className="max-h-[60vh] overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-violet-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && (
          <>
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

            {dayGroups.length === 0 && unreadItems.length === 0 && (
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
    </div>
  );
}
