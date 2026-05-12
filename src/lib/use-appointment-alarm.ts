"use client";

import { useEffect, useRef } from "react";
import { playSound } from "./sound";

const NOTIFIED_KEY = "klip_notified_appointments";

function getNotified(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveNotified(ids: Set<string>): void {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...ids]));
}

export function useAppointmentAlarm(
  appointments: { id: string; start_time: string; status: string }[]
): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function checkWindows() {
      const now = Date.now();
      const notified = getNotified();
      let changed = false;

      for (const apt of appointments) {
        if (apt.status !== "scheduled") continue;
        if (notified.has(apt.id)) continue;

        const start = new Date(apt.start_time).getTime();
        const diff = start - now;

        if (diff > 0 && diff <= 3600000) {
          playSound("notification", 0.45);
          notified.add(apt.id);
          changed = true;
        }
      }

      if (changed) saveNotified(notified);
    }

    checkWindows();

    intervalRef.current = setInterval(checkWindows, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [appointments]);
}
