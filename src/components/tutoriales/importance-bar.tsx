"use client";

import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { resolveImportance, TUTORIALS_PAGE } from "@/components/tutoriales/tutoriales-data";

/**
 * Barra de importancia (0 a 100) de un tutorial.
 * No se dibuja si el tutorial no tiene `importance`.
 */
export default function ImportanceBar({ value }: { value: number | undefined }) {
  const tone = resolveImportance(value);
  if (!tone) return null;

  const { title, scaleLabel, ticks, aria } = TUTORIALS_PAGE.importance;
  const max = 100;

  return (
    <div className={`mt-5 rounded-2xl border p-3.5 ${tone.panel}`} title={`${title}: ${scaleLabel}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {title}
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] tracking-[0.06em] ${tone.chip}`}>
            {tone.value >= 90 && <Flame className="mr-0.5 inline h-2.5 w-2.5" aria-hidden />}
            {tone.label}
          </span>
        </span>
        <span className={`text-base font-extrabold leading-none tabular-nums ${tone.text}`}>
          {tone.value}
          <span className="text-[0.62em] font-semibold text-slate-400">/{max}</span>
        </span>
      </div>

      <div
        role="meter"
        aria-valuenow={tone.value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={aria(tone.value)}
        className="relative mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-900/[0.07] ring-1 ring-inset ring-slate-900/[0.06]"
      >
        <motion.div
          className={`relative h-full rounded-full bg-gradient-to-r ${tone.fill}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${tone.value}%` }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ type: "spring", stiffness: 70, damping: 18, delay: 0.1 }}
        >
          <span className={`absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full ${tone.head}`} />
        </motion.div>
      </div>

      <div
        aria-hidden
        className="mt-1.5 grid grid-cols-3 text-[9px] font-semibold tabular-nums text-slate-400/80"
      >
        {ticks.map((tick, i) => (
          <span key={tick} className={i === 0 ? "text-left" : i === 1 ? "text-center" : "text-right"}>
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}
