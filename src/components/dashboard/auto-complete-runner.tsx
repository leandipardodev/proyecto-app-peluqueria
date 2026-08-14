"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { autoCompletePastAppointments } from "@/lib/dashboard/appointments/mutations";

function notifyChanged(): void {
  window.dispatchEvent(new Event("appointments-updated"));
}

/**
 * Reemplaza al cron de auto-complete: al ingresar al dashboard se completan
 * los turnos vencidos. Corre como action desde el cliente (request completa,
 * no fire-and-forget del server) y, si cambió algo, refresca la vista:
 * - dispatchea "appointments-updated" para que el calendario refetchee
 * - router.refresh() para refrescar los server components (turnos, clientes, etc.)
 */
export default function AutoCompleteRunner({ shopId }: { shopId: string | null }): null {
  const router = useRouter();
  const lastRunShopId = useRef<string | null>(null);

  useEffect(() => {
    if (!shopId || lastRunShopId.current === shopId) return;
    lastRunShopId.current = shopId;

    let cancelled = false;
    (async () => {
      try {
        const result = await autoCompletePastAppointments(shopId);
        if (cancelled) return;
        const data = result && result.success ? result.data : null;
        if (data && data.completed + data.confirmed + data.flagged > 0) {
          notifyChanged();
          router.refresh();
        }
      } catch {
        // best effort: el poll de notificaciones y el hook del calendario re-intentan
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId, router]);

  return null;
}
