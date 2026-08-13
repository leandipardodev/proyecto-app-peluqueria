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

let cachedState: NotificationsState | null = null;
let lastFetchTime = 0;
const subscribers = new Set<(state: NotificationsState) => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let activeShopId: string | null = null;

function publish(state: NotificationsState) {
  cachedState = state;
  lastFetchTime = Date.now();
  subscribers.forEach((fn) => fn(state));
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

async function refreshFromServer() {
  const state = await fetchState();
  if (state) publish(state);
}

/** Recalcula el estado local (compat: lo usaba el panel). */
export function refreshNotifications() {
  if (cachedState) publish(cachedState);
}

/** Fuerza un fetch al servidor y publica. */
export async function refetchNotifications() {
  await refreshFromServer();
}

/** Marca como leídas (optimista + server). */
export async function markNotificationsRead(ids: string[] | "all") {
  if (cachedState) {
    const idSet = ids === "all" ? null : new Set(ids);
    const items = cachedState.items.map((i) => (idSet === null || idSet.has(i.id) ? { ...i, isRead: true } : i));
    publish({
      ...cachedState,
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
      if (typeof data.unreadCount === "number" && cachedState) {
        publish({
          ...cachedState,
          unreadCount: data.unreadCount,
        });
      }
      return;
    }
  } catch { /* best effort */ }
  await refreshFromServer();
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void refreshFromServer();
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (subscribers.size > 0) return;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (activeShopId) {
    realtimeChannel?.unsubscribe().catch(() => {});
    realtimeChannel = null;
    activeShopId = null;
  }
}

function subscribeRealtime(shopId: string) {
  if (activeShopId === shopId) return;
  activeShopId = shopId;
  realtimeChannel?.unsubscribe().catch(() => {});
  realtimeChannel = supabase
    .channel(`dashboard-notifications-${shopId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `shop_id=eq.${shopId}` },
      () => {
        void refreshFromServer();
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notification_reads" },
      () => {
        void refreshFromServer();
      }
    )
    .subscribe();
}

export function useNotifications(shopId?: string | null): NotificationsState {
  const [state, setState] = useState<NotificationsState>(cachedState ?? EMPTY_STATE);
  const currentShopId = shopId ?? null;

  const subscriber = useCallback((s: NotificationsState) => setState(s), []);

  useEffect(() => {
    subscribers.add(subscriber);

    if (cachedState && Date.now() - lastFetchTime < POLL_INTERVAL) {
      setState(cachedState);
    } else {
      void refreshFromServer();
    }

    startPolling();
    if (currentShopId) subscribeRealtime(currentShopId);

    return () => {
      subscribers.delete(subscriber);
      stopPolling();
    };
  }, [subscriber, currentShopId]);

  return state;
}
