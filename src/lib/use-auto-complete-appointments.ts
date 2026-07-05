"use client";

import { useEffect, useRef } from "react";
import { autoCompletePastAppointments } from "@/lib/dashboard/appointment-mutations";

export function useAutoCompleteAppointments(shopId: string | null): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shopIdRef = useRef(shopId);
  const runningRef = useRef(false);

  useEffect(() => {
    shopIdRef.current = shopId;
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;

    async function checkAndComplete() {
      if (runningRef.current) return;
      runningRef.current = true;
      const id = shopIdRef.current;
      if (!id) { runningRef.current = false; return; }
      try {
        await autoCompletePastAppointments(id);
      } catch (e) {
        console.error("[AUTO-COMPLETE] error", e);
      } finally {
        runningRef.current = false;
      }
    }

    checkAndComplete();
    intervalRef.current = setInterval(checkAndComplete, 3_600_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [shopId]);
}
