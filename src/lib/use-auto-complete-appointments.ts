"use client";

import { useEffect, useRef } from "react";
import { autoCompletePastAppointments } from "@/lib/dashboard/appointment-mutations";

export function useAutoCompleteAppointments(shopId: string | null): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shopIdRef = useRef(shopId);

  useEffect(() => {
    shopIdRef.current = shopId;
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;

    async function checkAndComplete() {
      const id = shopIdRef.current;
      if (!id) return;
      try {
        await autoCompletePastAppointments(id);
      } catch {
      }
    }

    checkAndComplete();
    intervalRef.current = setInterval(checkAndComplete, 3600000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [shopId]);
}
