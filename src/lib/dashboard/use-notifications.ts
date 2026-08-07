"use client";

import { useEffect, useState, useCallback } from "react";

type NotificationData = {
  urgentAppointments: boolean;
  lowStock: boolean;
  pendingTransfers: number;
  unreadCount: number;
  pendingOrders: number;
};

type RawApiResponse = {
  items?: Array<{ id: string }>;
  pendingComplete?: Array<unknown>;
  urgentAppointments?: boolean;
  lowStock?: boolean;
  pendingTransfers?: number;
  pendingOrders?: number;
};

const POLL_INTERVAL = 45_000;

let cachedData: NotificationData | null = null;
let lastRawData: RawApiResponse | null = null;
let lastFetchTime = 0;
const subscribers = new Set<(data: NotificationData) => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function getReadIds(): string[] {
  try {
    const raw = localStorage.getItem("klip-notifications-read");
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  return [];
}

function computeUnreadCount(data: RawApiResponse): number {
  const read = getReadIds();
  const unreadItems = (data.items || []).filter((i) => !read.includes(i.id)).length;
  const pendingCount = data.pendingComplete?.length ?? 0;
  return unreadItems + pendingCount;
}

async function fetchNotifications(): Promise<NotificationData | null> {
  try {
    const res = await fetch("/api/dashboard/notifications", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RawApiResponse;
    lastRawData = data;
    return {
      urgentAppointments: Boolean(data.urgentAppointments),
      lowStock: Boolean(data.lowStock),
      pendingTransfers: data.pendingTransfers ?? 0,
      unreadCount: computeUnreadCount(data),
      pendingOrders: data.pendingOrders ?? 0,
    };
  } catch {
    return null;
  }
}

function notifySubscribers(data: NotificationData) {
  cachedData = data;
  lastFetchTime = Date.now();
  subscribers.forEach((fn) => fn(data));
}

export function refreshNotifications() {
  if (!lastRawData) return;
  notifySubscribers({
    urgentAppointments: Boolean(lastRawData.urgentAppointments),
    lowStock: Boolean(lastRawData.lowStock),
    pendingTransfers: lastRawData.pendingTransfers ?? 0,
    unreadCount: computeUnreadCount(lastRawData),
    pendingOrders: lastRawData.pendingOrders ?? 0,
  });
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    const data = await fetchNotifications();
    if (data) notifySubscribers(data);
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (subscribers.size > 0) return;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function useNotifications(): NotificationData {
  const [data, setData] = useState<NotificationData>(
    cachedData ?? { urgentAppointments: false, lowStock: false, pendingTransfers: 0, unreadCount: 0, pendingOrders: 0 }
  );

  const subscriber = useCallback((fn: NotificationData | null) => {
    if (fn) setData(fn);
  }, []);

  useEffect(() => {
    subscribers.add(subscriber);

    if (cachedData && Date.now() - lastFetchTime < POLL_INTERVAL) {
      setData(cachedData);
    } else {
      fetchNotifications().then((d) => {
        if (d) notifySubscribers(d);
      });
    }

    startPolling();

    return () => {
      subscribers.delete(subscriber);
      stopPolling();
    };
  }, [subscriber]);

  return data;
}
