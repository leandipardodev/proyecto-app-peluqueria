"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Item = { name: string; count: number };

type Slide = {
  key: string;
  label: string;
  items: Item[];
  emptyTitle: string;
  emptyDesc: string;
};

type Props = {
  topServices: Item[];
  topDias: Item[];
  topHorarios: Item[];
};

export default function DemandaCarousel({ topServices, topDias, topHorarios }: Props) {
  const slides: Slide[] = [
    { key: "servicios", label: "Servicios", items: topServices, emptyTitle: "Sin servicios", emptyDesc: "Todavía no hay servicios registrados." },
    { key: "dias", label: "Días", items: topDias, emptyTitle: "Sin datos", emptyDesc: "No hay suficientes turnos para mostrar días." },
    { key: "horarios", label: "Horarios", items: topHorarios, emptyTitle: "Sin datos", emptyDesc: "No hay suficientes turnos para mostrar horarios." },
  ];

  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);

  const goNext = useCallback(() => {
    setDirection(1);
    setCurrent((p) => (p + 1) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(goNext, 5000);
    return () => clearInterval(timer);
  }, [goNext, paused]);

  const slide = slides[current];

  const maxCount = slide.items.length > 0 ? Math.max(...slide.items.map((s) => s.count)) : 1;

  const variants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * 30 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -30 }),
  };

  return (
    <div className="rounded-xl rounded-bl-none border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-1">
        Demanda
      </h3>
      <p className="text-xs text-zinc-500 mb-4">
        Los más pedidos
      </p>

      {slide.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{slide.emptyTitle}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{slide.emptyDesc}</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.div
            key={slide.key}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="space-y-3 will-change-transform"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {slide.label}
              </span>
              <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">Cant.</span>
            </div>
            {slide.items.map((item, i) => {
              const pct = Math.round((item.count / maxCount) * 100);
              return (
                <div key={item.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate mr-2">
                      {item.name}
                    </span>
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 shrink-0">
                      {item.count}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, delay: i * 0.04, ease: "easeOut" }}
                    />
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}

      <div className="flex items-center justify-center gap-1.5 mt-4">
        {slides.map((s, idx) => (
          <button
            key={s.key}
            type="button"
            onClick={() => { setDirection(idx > current ? 1 : -1); setCurrent(idx); setPaused(true); }}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === current
                ? "w-5 bg-violet-500 dark:bg-violet-400"
                : "w-1.5 bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400 dark:hover:bg-zinc-500"
            }`}
            aria-label={`Ver ${s.label}`}
          />
        ))}
      </div>
    </div>
  );
}
