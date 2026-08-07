"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { PackageX, ShoppingBag, CheckCircle2, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import HoverScale from "@/components/ui/hover-scale";

type Slide = {
  key: string;
  label: string;
  value: string;
  accent: string;
  gradient: string;
  icon: LucideIcon;
  href: string;
};

interface AlertsCarouselProps {
  lowStockCount: number;
  ordersCount: number;
  stockHref: string;
  ordersHref: string;
}

export default function AlertsCarousel({ lowStockCount, ordersCount, stockHref, ordersHref }: AlertsCarouselProps) {
  const slides: Slide[] = [];
  if (lowStockCount > 0) {
    slides.push({
      key: "stock",
      label: "Alertas de stock",
      value: String(lowStockCount),
      accent: "bg-amber-500",
      gradient: "from-amber-50 to-transparent dark:from-amber-950/20 dark:to-transparent",
      icon: PackageX,
      href: stockHref,
    });
  }
  if (ordersCount > 0) {
    slides.push({
      key: "orders",
      label: "Pedidos recibidos",
      value: String(ordersCount),
      accent: "bg-emerald-500",
      gradient: "from-emerald-50 to-transparent dark:from-emerald-950/20 dark:to-transparent",
      icon: ShoppingBag,
      href: ordersHref,
    });
  }
  if (slides.length === 0) {
    slides.push({
      key: "ok",
      label: "Alertas de stock",
      value: "0",
      accent: "bg-emerald-500",
      gradient: "from-emerald-50 to-transparent dark:from-emerald-950/20 dark:to-transparent",
      icon: CheckCircle2,
      href: stockHref,
    });
  }

  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => setIndex((prev) => (prev + 1) % slides.length), 5000);
    return () => clearInterval(id);
  }, [slides.length]);

  const active = slides[index % slides.length];
  const Icon = active.icon;
  const sheenStyle: CSSProperties & Record<"--sheen-delay" | "--sheen-duration", string> = {
    "--sheen-delay": "-2.7s",
    "--sheen-duration": "14.4s",
  };

  return (
    <HoverScale className="h-full">
      <Link href={active.href} className="block h-full" draggable={false}>
        <div
          className="glass-sheen-card h-full min-h-[124px] lg:min-h-[132px] bg-white dark:bg-zinc-900 rounded-[2.5rem] rounded-br-none border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 flex flex-col justify-between transition-colors cursor-pointer overflow-hidden relative"
          style={sheenStyle}
        >
          <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-[2.5rem] ${active.accent}`} />
          <div className={`absolute inset-0 bg-gradient-to-b ${active.gradient} rounded-[2.5rem] pointer-events-none`} />
          <div className="relative z-10 flex flex-col h-full pt-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-zinc-500 flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" />
              {active.label}
            </p>
            <div className="mt-1 h-9">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={active.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <p className="text-4xl font-black tracking-tight text-gray-900 dark:text-white leading-none">{active.value}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            {slides.length > 1 && (
              <div className="mt-auto pt-2 flex items-center gap-1.5">
                {slides.map((s, i) => (
                  <span
                    key={s.key}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      i === index % slides.length ? "w-4 bg-gray-800 dark:bg-white" : "w-1.5 bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>
    </HoverScale>
  );
}
