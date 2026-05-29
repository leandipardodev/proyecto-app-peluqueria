"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { BOOKING_TEMPLATE_PRESETS, type BookingTemplateId } from "@/lib/booking/theme-presets";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import type { Industry } from "@/lib/industry/types";

type PreviewService = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  category: string;
};

type Props = {
  templateId: BookingTemplateId;
  logoUrl: string;
  shopName: string;
  heroTitle: string;
  heroSubtitle: string;
  aboutTitle: string;
  aboutText: string;
  services: PreviewService[];
  industry?: Industry;
};

export default function BookingThemeLivePreview({
  templateId,
  logoUrl,
  shopName,
  heroTitle,
  heroSubtitle,
  aboutTitle,
  aboutText,
  services,
  industry = "peluqueria",
}: Props) {
  const [viewport, setViewport] = useState<"mobile" | "desktop">("mobile");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const hasRealServices = services.length > 0;
  const fallbackServices: PreviewService[] = [
    { id: "demo-1", name: "Corte Clasico", price: 12000, duration_minutes: 45, category: "Cortes" },
    { id: "demo-2", name: "Barba Completa", price: 9000, duration_minutes: 35, category: "Barberia" },
    { id: "demo-3", name: "Color Global", price: 25000, duration_minutes: 90, category: "Color" },
  ];
  const sourceServices = hasRealServices ? services : fallbackServices;
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const service of sourceServices) {
      const category = (service.category || "General").trim() || "General";
      counts.set(category, (counts.get(category) || 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0], "es");
      })
      .map(([category]) => category);
  }, [sourceServices]);

  const categoriesWithAll = ["Todos", ...categories];
  const activeCategory = selectedCategory && categoriesWithAll.includes(selectedCategory)
    ? selectedCategory
    : "Todos";
  const visibleServices = (activeCategory === "Todos"
    ? sourceServices
    : sourceServices.filter((s) => (s.category || "General") === activeCategory)).slice(0, 3);
  const templateLabel = BOOKING_TEMPLATE_PRESETS.find((item) => item.id === templateId)?.name || "Template";
  const labels = INDUSTRY_CONFIG[industry].labels;
  const servicePlural = labels.servicePlural;

  const styles = {
    "classic-dark": {
      page: "bg-[#060a12] text-[#F5F5F7]",
      shell: "bg-[#0f1522]/65 border-[#293347] backdrop-blur-[24px]",
      heading: "text-[#F5F5F7]",
      accent: "text-[#7AB8FF]",
      chip: "rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-[#B0B4BF]",
      chipActive: "border-[#7AB8FF]/60 bg-[#7AB8FF]/12 text-[#D4E4FF]",
      chipAll: "border-transparent bg-transparent text-[#7f8fa8]",
      card: "border-white/12 bg-white/[0.05]",
      cta: "bg-white text-black",
    },
    "minimal-glass": {
      page: "bg-[#EEF4FF] text-[#1C1C1E]",
      shell: "bg-white/75 border-[#d5dfeb] backdrop-blur-[24px]",
      heading: "text-[#1C1C1E]",
      accent: "text-[#0071E3]",
      chip: "rounded-full border border-black/10 bg-white/55 px-3 py-2 text-[11px] font-semibold text-[#4A5565] backdrop-blur-sm",
      chipActive: "border-[#0071E3]/40 bg-white/75 text-[#0071E3]",
      chipAll: "border-transparent bg-transparent text-[#7f8ea5]",
      card: "border-black/10 bg-white/65",
      cta: "bg-[#1C1C1E] text-white",
    },
    "editorial-luxury": {
      page: "bg-[#f9f1e7] text-[#2E221A]",
      shell: "bg-[#fff8ef]/80 border-[#ddc7b0] backdrop-blur-[24px]",
      heading: "text-[#2E221A]",
      accent: "text-[#6A4A2D]",
      chip: "rounded-full border border-stone-300/50 bg-white/45 px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-[#7D6A57]",
      chipActive: "border-[#B98850]/50 bg-[#FFF8EE] text-[#6D4E2E]",
      chipAll: "border-transparent bg-transparent text-[#907c67]",
      card: "border-stone-200/60 bg-white/70",
      cta: "bg-[#2E221A] text-[#FDFBF7]",
    },
    "street-bold": {
      page: "bg-[#eef2ff] text-[#2D3142]",
      shell: "bg-white/85 border-[#d7deef] backdrop-blur-[24px]",
      heading: "text-[#2D3142]",
      accent: "text-[#5a72cd]",
      chip: "rounded-full border border-neutral-200/60 bg-white/65 px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-[#6B728A]",
      chipActive: "border-[#9CB0EA]/60 bg-[#F7FAFF] text-[#5873C7]",
      chipAll: "border-transparent bg-transparent text-[#818ca8]",
      card: "border-neutral-200/70 bg-white/80",
      cta: "bg-[#2D3142] text-white",
    },
  }[templateId];

  const isDesktopPreview = viewport === "desktop";

  return (
    <section className="rounded-3xl border border-white/30 bg-white/55 p-4 dark:border-white/10 dark:bg-black/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Vista previa en vivo</p>
          <span className="rounded-full border border-white/40 bg-white/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {templateLabel}
          </span>
        </div>
        <div className="inline-flex rounded-full border border-white/30 bg-white/60 p-1 dark:border-white/10 dark:bg-zinc-900/60">
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            className={`min-h-12 rounded-full px-4 text-xs font-semibold ${viewport === "mobile" ? "bg-[#0071E3] text-white" : "text-zinc-600 dark:text-zinc-300"}`}
          >
            Vista Mobile
          </button>
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            className={`min-h-12 rounded-full px-4 text-xs font-semibold ${viewport === "desktop" ? "bg-[#0071E3] text-white" : "text-zinc-600 dark:text-zinc-300"}`}
          >
            Vista Desktop
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <div className={`${isDesktopPreview ? "w-full max-w-[780px]" : "w-[320px]"} transition-all duration-200`}>
          <div className={`mx-auto border p-2 shadow-2xl ${isDesktopPreview ? "max-w-[780px] rounded-[1.35rem]" : "max-w-[320px] rounded-[2.2rem]"}`}>
            {isDesktopPreview ? (
              <div className="mb-2 flex h-8 items-center gap-2 rounded-[0.75rem] bg-zinc-900/85 px-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <div className="ml-2 h-5 w-full max-w-[320px] rounded-full bg-white/10" />
              </div>
            ) : (
              <div className="mx-auto mb-2 h-5 w-24 rounded-full bg-black/70" />
            )}
            <div className={`rounded-[1.4rem] border shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] ${styles.page} ${styles.shell} ${isDesktopPreview ? "p-4 sm:p-5" : "p-3 sm:p-4"}`}>
              <div className="flex items-center gap-3 border-b border-white/15 pb-3">
                <div className="h-14 w-14 overflow-hidden">
                  {logoUrl ? <Image src={logoUrl} alt="Logo preview" width={112} height={112} sizes="56px" className="h-full w-full object-contain" /> : null}
                </div>
                <div className="min-w-0">
                  <h3 className={`truncate text-sm font-semibold ${styles.heading}`}>{heroTitle || shopName || "Reserva online"}</h3>
                  <p className="truncate text-[11px] uppercase tracking-[0.12em] text-zinc-500">{heroSubtitle || "Elegi servicio y horario"}</p>
                </div>
              </div>

              <div className="mt-3 -mx-1 w-[calc(100%+0.5rem)] overflow-x-auto whitespace-nowrap px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div className="inline-flex min-w-max items-center gap-2">
                  {categoriesWithAll.map((category) => {
                    const isActive = category === activeCategory;
                    const isAll = category === "Todos";
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setSelectedCategory(category)}
                        className={`${styles.chip} ${isAll && !isActive ? styles.chipAll : ""} ${isActive ? styles.chipActive : ""}`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`mt-3 ${isDesktopPreview ? "grid grid-cols-2 gap-2.5" : "space-y-2"}`}>
                {!hasRealServices && (
                  <p className={`text-[11px] text-zinc-500 italic ${isDesktopPreview ? "col-span-2" : ""}`}>{servicePlural} de ejemplo hasta que cargues los tuyos.</p>
                )}
                {visibleServices.map((service) => (
                  <div key={service.id} className={`rounded-2xl border p-3 ${styles.card}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold ${styles.heading}`}>{service.name}</p>
                        <p className="text-[11px] text-zinc-500">{service.duration_minutes} min</p>
                      </div>
                      <p className={`text-sm font-semibold ${styles.accent}`}>${service.price.toFixed(0)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <button type="button" className={`min-h-12 w-full rounded-full text-sm font-semibold ${styles.cta}`}>
                  Confirmar turno
                </button>
              </div>

              {(aboutTitle || aboutText) && (
                <div className="mt-4 border-t border-white/15 pt-3">
                  <p className={`text-sm font-semibold ${styles.heading}`}>{aboutTitle || "Sobre nosotros"}</p>
                  <p className="mt-1 text-xs text-zinc-500">{aboutText || "Tu mensaje de marca va a aparecer aca."}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
