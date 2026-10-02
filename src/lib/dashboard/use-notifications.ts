"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export type NotificationItem = {
  id: string;
  type: string;
  category: "urgent" | "action" | "info";
  title: string;
  description: string;
  href: string;
  timestamp: string;
  isRead: boolean;
};

export type NotificationsState = {
  items: NotificationItem[];
  urgentAppointments: boolean;
  lowStock: boolean;
  pendingTransfers: number;
  pendingOrders: number;
  unreadCount: number;
  loading: boolean;
};

const POLL_INTERVAL = 45_000;

const EMPTY_STATE: NotificationsState = {
  items: [],
  urgentAppointments: false,
  lowStock: false,
  pendingTransfers: 0,
  pendingOrders: 0,
  unreadCount: 0,
  loading: true,
};

/**
 * Una entrada por tienda. Antes eran variables sueltas de modulo, compartidas por
 * todas las tiendas de la pestana: al cambiar de negocio los badges del sidebar
 * (stock bajo, pedidos, turnos urgentes, transferencias) seguiaban mostrando los
 * de la tienda anterior hasta el proximo poll, y de paso `realtimeChannel` era un
 * solo canal, asi que la segunda tienda se quedaba sin Realtime.
 */
type ShopEntry = {
  state: NotificationsState | null;
  lastFetchTime: number;
  subscribers: Set<(state: NotificationsState) => void>;
  pollTimer: ReturnType<typeof setInterval> | null;
  realtimeChannel: ReturnType<typeof supabase.channel> | null;
};

const byShop = new Map<string, ShopEntry>();

function entryFor(shopId: string): ShopEntry {
  let entry = byShop.get(shopId);
  if (!entry) {
    entry = {
      state: null,
      lastFetchTime: 0,
      subscribers: new Set(),
      pollTimer: null,
      realtimeChannel: null,
    };
    byShop.set(shopId, entry);
  }
  return entry;
}

function publish(shopId: string, state: NotificationsState) {
  const entry = entryFor(shopId);
  entry.state = state;
  entry.lastFetchTime = Date.now();
  entry.subscribers.forEach((fn) => fn(state));
}

async function fetchState(): Promise<NotificationsState | null> {
  try {
    const res = await fetch("/api/dashboard/notifications", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: NotificationItem[];
      urgentAppointments?: boolean;
      lowStock?: boolean;
      pendingTransfers?: number;
      pendingOrders?: number;
    };
    const items = Array.isArray(data.items) ? data.items : [];
    return {
      items,
      urgentAppointments: Boolean(data.urgentAppointments),
      lowStock: Boolean(data.lowStock),
      pendingTransfers: typeof data.pendingTransfers === "number" ? data.pendingTransfers : 0,
      pendingOrders: typeof data.pendingOrders === "number" ? data.pendingOrders : 0,
      unreadCount: items.filter((i) => !i.isRead).length,
      loading: false,
    };
  } catch {
    return null;
  }
}

async function refreshFromServer(shopId: string) {
  const state = await fetchState();
  if (state) publish(shopId, state);
}

/** Marca como leídas (optimista + server). */
export async function markNotificationsRead(shopId: string, ids: string[] | "all") {
  const entry = byShop.get(shopId);
  if (entry?.state) {
    const idSet = ids === "all" ? null : new Set(ids);
    const items = entry.state.items.map((i) => (idSet === null || idSet.has(i.id) ? { ...i, isRead: true } : i));
    publish(shopId, {
      ...entry.state,
      items,
      unreadCount: items.filter((i) => !i.isRead).length,
    });
  }
  try {
    const res = await fetch("/api/dashboard/notifications", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids === "all" ? { all: true } : { ids }),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { unreadCount?: number };
      const current = byShop.get(shopId)?.state;
      if (typeof data.unreadCount === "number" && current) {
        publish(shopId, {
          ...current,
          unreadCount: data.unreadCount,
        });
      }
      return;
    }
  } catch { /* best effort */ }
  await refreshFromServer(shopId);
}

function startPolling(shopId: string) {
  const entry = entryFor(shopId);
  if (entry.pollTimer) return;
  entry.pollTimer = setInterval(() => {
    void refreshFromServer(shopId);
  }, POLL_INTERVAL);
}

function stopPolling(shopId: string) {
  const entry = byShop.get(shopId);
  if (!entry || entry.subscribers.size > 0) return;
  if (entry.pollTimer) {
    clearInterval(entry.pollTimer);
    entry.pollTimer = null;
  }
  if (entry.realtimeChannel) {
    entry.realtimeChannel.unsubscribe().catch(() => {});
    entry.realtimeChannel = null;
  }
  // El estado cacheado se descarta con el ultimo suscriptor: si la tienda vuelve
  // a abrirse se pide de nuevo en vez de mostrar un conteo viejo.
  byShop.delete(shopId);
}

function subscribeRealtime(shopId: string) {
  const entry = entryFor(shopId);
  if (entry.realtimeChannel) return;
  entry.realtimeChannel = supabase
    .channel(`dashboard-notifications-${shopId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `shop_id=eq.${shopId}` },
      () => {
        void refreshFromServer(shopId);
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notification_reads" },
      () => {
        void refreshFromServer(shopId);
      }
    )
    .subscribe();
}

export function useNotifications(shopId?: string | null): NotificationsState {
  // Sin tienda resuelta todavia no hay nada que mostrar: `EMPTY_STATE` ya viene con
  // `loading: true`, que es lo que el sidebar ya sabe pintar.
  const [state, setState] = useState<NotificationsState>(
    () => (shopId ? byShop.get(shopId)?.state ?? EMPTY_STATE : EMPTY_STATE)
  );

  const subscriber = useCallback((s: NotificationsState) => setState(s), []);

  useEffect(() => {
    if (!shopId) return;

    const entry = entryFor(shopId);
    entry.subscribers.add(subscriber);

    const cached = entry.state;
    if (cached && Date.now() - entry.lastFetchTime < POLL_INTERVAL) {
      setState(cached);
    } else {
      void refreshFromServer(shopId);
    }

    startPolling(shopId);
    subscribeRealtime(shopId);

    return () => {
      entry.subscribers.delete(subscriber);
      stopPolling(shopId);
    };
  }, [subscriber, shopId]);

  return state;
}
