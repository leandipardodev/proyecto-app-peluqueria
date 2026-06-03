"use client";

import { motion } from "framer-motion";
import { StatePanel } from "@/components/ui/state-panel";

type TopServicesProps = {
  data: Array<{ name: string; count: number }>;
  serviceLabelPlural?: string;
};

export default function TopServices({ data, serviceLabelPlural = "Servicios" }: TopServicesProps) {
  const maxCount = data.length > 0 ? Math.max(...data.map((s) => s.count)) : 1;

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <StatePanel title={`Sin ${serviceLabelPlural.toLowerCase()}`} description={`Todavía no hay ${serviceLabelPlural.toLowerCase()} registrados.`} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-1">
        Top {serviceLabelPlural.toLowerCase()}
      </h3>
      <p className="text-xs text-zinc-500 mb-4">
        Los mas pedidos
      </p>
      <div className="space-y-3">
        {data.map((service, i) => {
          const pct = Math.round((service.count / maxCount) * 100);
          return (
            <motion.div
              key={service.name}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, type: "spring", damping: 25, stiffness: 200 }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate mr-2">
                  {service.name}
                </span>
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 shrink-0">
                  {service.count}
                </span>
              </div>
              <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, delay: i * 0.06, ease: "easeOut" }}
                  style={{ opacity: 0.8 }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
