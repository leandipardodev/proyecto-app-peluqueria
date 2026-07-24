"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

const EASE: [number, number, number, number] = [0.43, 0.13, 0.23, 0.96];

type Slide = {
  id: string;
  kicker: string;
  title: string;
  text: string;
  image: string;
  alt: string;
};

const SLIDES: Slide[] = [
  {
    id: "devices",
    kicker: "Multi dispositivo",
    title: "La app funciona en todos tus dispositivos y se adapta a tu estilo.",
    text: "Usala en celular, tablet o escritorio con la misma experiencia. Todo se mantiene personalizable para que refleje la identidad de tu negocio.",
    image: "/landing/carousel/aa1.webp",
    alt: "Klip en varios dispositivos con interfaz personalizable",
  },
  {
    id: "ai",
    kicker: "Inteligencia artificial",
    title: "IA integrada trabaja codo a codo con vos",
    text: "Dandote recomendaciones e información en tiempo real de tu local. Analizamos el comportamiento de tu negocio para sugerirte los mejores horarios, servicios más rentables y alertas inteligentes. Todo sin que tengas que hacer nada extra.",
    image: "/landing/carousel/aa2.webp",
    alt: "Klip con inteligencia artificial integrada",
  },
  {
    id: "dashboard",
    kicker: "Inicio optimizado",
    title: "Métricas y estadísticas claras para no perder ningún detalle.",
    text: "Tu panel principal resume lo importante de ingresos, actividad y alertas para que tomes decisiones rápido, sin fricción.",
    image: "/landing/carousel/aa4.webp",
    alt: "Panel principal de Klip con métricas del negocio",
  },
  {
    id: "calendar",
    kicker: "Calendario completo",
    title: "Gestioná turnos con una vista potente y súper práctica.",
    text: "Editá, reprogramá y controlá toda la agenda desde un solo lugar, con estados visuales claros y flujo operativo en tiempo real.",
    image: "/landing/carousel/aa3.webp",
    alt: "Calendario de Klip con funcionalidades de agenda",
  },
];

export default function HomeFeaturesCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragX, setDragX] = useState(0);
  const slide = SLIDES[active];

  function goPrev() {
    setActive((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  }

  function goNext() {
    setActive((prev) => (prev + 1) % SLIDES.length);
  }

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      goNext();
    }, 6500);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) setPaused(true);
      else setPaused(false);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <section
      className="glass-sheen-card relative overflow-hidden rounded-[2.5rem] border border-slate-700/70 bg-[linear-gradient(140deg,#080d18_0%,#0b1222_48%,#0d172d_100%)] transition-colors"
      style={{ boxShadow: "0 22px 68px rgba(14,165,233,0.12), 0 34px 88px rgba(15,23,42,0.30)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="pointer-events-none absolute -left-24 top-1/2 h-52 w-52 -translate-y-1/2 rounded-full bg-sky-300/20 blur-2xl" />
      <div className="pointer-events-none absolute -right-20 top-6 h-48 w-48 rounded-full bg-cyan-300/18 blur-2xl" />
      <div className="pointer-events-none absolute inset-0 opacity-55" style={{ background: "linear-gradient(118deg, rgba(14,165,233,0.08) 0%, rgba(255,255,255,0) 42%, rgba(37,99,235,0.08) 100%)" }} />

      <div className="relative z-10 grid grid-cols-1 gap-5 p-4 md:grid-cols-12 md:gap-7 md:p-6">
        <div className="order-2 md:order-1 md:col-span-4 relative rounded-[1.9rem] border border-slate-700/65 bg-slate-900/45 p-5 pb-20 z-10 md:p-6 md:pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.44, ease: EASE }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300">{slide.kicker}</p>
              <h3 className="mt-3 text-[2.02rem] font-black leading-[1.02] tracking-[-0.045em] text-white md:text-[2.3rem]">{slide.title}</h3>
              <p className="mt-4 text-sm leading-relaxed text-slate-300 md:text-[15px]">{slide.text}</p>
            </motion.div>
          </AnimatePresence>

          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center justify-center gap-2 px-1 py-1">
            <button type="button" onClick={goPrev} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/80 bg-slate-800/90 text-slate-200 transition-all duration-200 hover:bg-slate-700 active:scale-95" aria-label="Slide anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="mx-3 flex items-center gap-1.5">
              {SLIDES.map((s, idx) => (
                  <button key={s.id} type="button" onClick={() => setActive(idx)} className={`h-1.5 rounded-full transition-all duration-300 ${idx === active ? "w-8 bg-sky-300" : "w-2.5 bg-zinc-500/50 hover:bg-zinc-400/80"}`} aria-label={`Ir al slide ${idx + 1}`} />
              ))}
            </div>
            <button type="button" onClick={goNext} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/80 bg-slate-800/90 text-slate-200 transition-all duration-200 hover:bg-slate-700 active:scale-95" aria-label="Slide siguiente">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="order-1 md:order-2 md:col-span-8 relative z-0">
          <div className="relative h-[380px] overflow-visible md:h-[560px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1, x: dragX }}
                exit={{ opacity: 0, scale: 1.04 }}
                transition={{ duration: 0.6, ease: EASE }}
                className="absolute -inset-x-4 inset-y-0 md:-inset-x-6"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.12}
                onDrag={(_, info) => setDragX(info.offset.x * 0.12)}
                onDragEnd={(_, info) => {
                  setDragX(0);
                  const shouldPrev = info.offset.x > 56 || info.velocity.x > 540;
                  const shouldNext = info.offset.x < -56 || info.velocity.x < -540;
                  if (shouldPrev) goPrev();
                  if (shouldNext) goNext();
                }}
                style={{
                  filter: "drop-shadow(0 20px 40px rgba(15,23,42,0.18))",
                }}
              >
                <div className="absolute inset-0 carousel-image-zoom">
                  <Image src={slide.image} alt={slide.alt} fill sizes="(max-width: 768px) 100vw, 60vw" className="object-contain" priority={active === 0} />
                </div>
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.08)_0%,transparent_42%,rgba(14,165,233,0.08)_100%)]" />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
