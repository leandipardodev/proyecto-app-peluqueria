"use client";

import { useEffect, useRef } from "react";
import { autoCompletePastAppointments } from "@/lib/dashboard/appointments/mutations";

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
        const result = await autoCompletePastAppointments(id);
        if (result && result.success === false) {
          console.error("[AUTO-COMPLETE] error:", result.error);
        } else if (result?.data && result.data.completed + result.data.confirmed + result.data.flagged > 0) {
          window.dispatchEvent(new Event("appointments-updated"));
        }
      } catch (e) {
        console.error("[AUTO-COMPLETE] error", e);
      } finally {
        runningRef.current = false;
      }
    }

    const initialTimer = setTimeout(checkAndComplete, 8_000);
    intervalRef.current = setInterval(checkAndComplete, 3_600_000);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [shopId]);
}
