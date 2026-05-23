"use client";

import { motion } from "framer-motion";

type TopServicesProps = {
  data: Array<{ name: string; count: number }>;
  serviceLabelPlural?: string;
};

export default function TopServices({ data, serviceLabelPlural = "Servicios" }: TopServicesProps) {
  const maxCount = data.length > 0 ? Math.max(...data.map((s) => s.count)) : 1;

  if (data.length === 0) {
    return (
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 transition-colors">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
          Sin {serviceLabelPlural.toLowerCase()} aun
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 transition-colors">
      <h3 className="text-sm font-medium text-gray-900 dark:text-white tracking-tight mb-1">
        Top {serviceLabelPlural.toLowerCase()}
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        Los más pedidos
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
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate mr-2">
                  {service.name}
                </span>
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 shrink-0">
                  {service.count}
                </span>
              </div>
              <div className="w-full h-2 bg-white/30 dark:bg-black/30 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: i * 0.06, ease: "easeOut" }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
