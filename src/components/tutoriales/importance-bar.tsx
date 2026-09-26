"use client";

import { motion } from "framer-motion";
import { resolveImportance, TUTORIALS_PAGE } from "@/components/tutoriales/tutoriales-data";

/**
 * Barra de importancia (0 a 100) de un tutorial.
 * Flota dentro de la miniatura, en la esquina opuesta a la duracion.
 * No se dibuja si el tutorial no tiene `importance`.
 */
export default function ImportanceBar({ value }: { value: number | undefined }) {
  const tone = resolveImportance(value);
  if (!tone) return null;

  const { title, aria } = TUTORIALS_PAGE.importance;

  return (
    <div className="absolute bottom-3 left-3 w-20" title={`${title}: ${tone.value}/100 · ${tone.label}`}>
      <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        {title}
      </span>
      <div
        role="meter"
        aria-valuenow={tone.value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={aria(tone.value)}
        className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-white/30"
      >
        <motion.div
          className="h-full rounded-full bg-white/95 shadow-[0_0_6px_rgba(255,255,255,0.55)]"
          initial={{ width: 0 }}
          whileInView={{ width: `${tone.value}%` }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.15 }}
        />
      </div>
    </div>
  );
}
