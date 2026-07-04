"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { playSound } from "@/lib/sound";

export default function NewAppointmentToast({ shopId }: { shopId: string | null }) {
  const pathname = usePathname();
  const { addToast } = useToast();
  const addToastRef = useRef(addToast);
  useEffect(() => { addToastRef.current = addToast; });
  const cooldownRef = useRef(false);

  useEffect(() => {
    if (!shopId) return;
    if (pathname.includes("/calendar")) return;

    const topic = `realtime:new-appointment-${shopId}`;
    supabase.getChannels().forEach((ch) => {
      if (ch.topic === topic) supabase.removeChannel(ch);
    });

    const channel = supabase
      .channel(`new-appointment-${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "appointments",
          filter: `shop_id=eq.${shopId}`,
        },
        async (payload) => {
          if (cooldownRef.current) return;
          cooldownRef.current = true;
          setTimeout(() => { cooldownRef.current = false; }, 3000);

          try {
            const newAppt = payload.new as { customer_id?: string; service_id?: string };

            let customerName = "Cliente";
            let serviceName = "Servicio";

            if (newAppt.customer_id) {
              const { data: customer } = await supabase
                .from("customers")
                .select("nombre")
                .eq("id", newAppt.customer_id)
                .maybeSingle();
              if (customer) customerName = customer.nombre;
            }

            if (newAppt.service_id) {
              const { data: service } = await supabase
                .from("services")
                .select("name")
                .eq("id", newAppt.service_id)
                .maybeSingle();
              if (service) serviceName = service.name;
            }

            addToastRef.current(`Nuevo turno: ${customerName} - ${serviceName}`, "info");
            playSound("notification");
          } catch {}
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId, pathname]);

  return null;
}
