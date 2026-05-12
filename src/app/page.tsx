"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { Sparkles, CalendarCheck2, Scissors, Boxes, BarChart3, Clock3, Users2 } from "lucide-react";

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: false, amount: 0.25 },
  transition: { type: "spring", stiffness: 100, damping: 20 },
} as const;

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section {...reveal} className={className}>
      {children}
    </motion.section>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      layout
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className={`rounded-3xl border border-slate-200 bg-white/80 backdrop-blur-xl shadow-[0_20px_40px_rgba(0,0,0,0.04)] ${className}`}
    >
      {children}
    </motion.div>
  );
}

export default function Home() {
  const mouseX = useMotionValue(-1000);
  const mouseY = useMotionValue(-1000);
  const smoothX = useSpring(mouseX, { stiffness: 120, damping: 24, mass: 0.45 });
  const smoothY = useSpring(mouseY, { stiffness: 120, damping: 24, mass: 0.45 });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    function onMove(e: MouseEvent) {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mouseX, mouseY]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#FBFBFC]">
      {mounted && (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed z-0 h-[600px] w-[600px] rounded-full bg-blue-400/10 blur-[120px]"
          style={{
            x: smoothX,
            y: smoothY,
            translateX: "-50%",
            translateY: "-50%",
          }}
        />
      )}

      <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="text-xl font-semibold tracking-tight text-[#1D1D1F]">Klip</div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm text-[#1D1D1F] transition hover:bg-slate-50"
            >
              Ingresar
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-[#0071E3] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0064cc]"
            >
              Reserve Now
            </Link>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Section className="py-32">
          <Card className="p-10 md:p-14">
            <p className="mb-5 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#86868B]">
              <Sparkles className="h-4 w-4 text-[#0071E3]" />
              Booking + Gestion + Cobros
            </p>

            <div className="max-w-3xl">
              <h1 className="text-7xl font-extrabold tracking-tight text-[#1D1D1F] md:text-9xl">
                Gestion premium para peluquerias modernas.
              </h1>

              <p className="mt-7 text-lg leading-relaxed text-[#86868B]">
                Klip centraliza agenda, equipo e ingresos en una experiencia clara, elegante y enfocada en crecimiento.
              </p>

              <div className="mt-10">
                <Link
                  href="/register"
                  className="inline-flex rounded-full bg-[#0071E3] px-10 py-4 font-semibold text-white transition hover:bg-[#0064cc]"
                >
                  Reserve Now
                </Link>
              </div>
            </div>
          </Card>
        </Section>

        <Section className="py-24">
          <div className="mb-8 max-w-3xl">
            <h2 className="text-5xl font-bold tracking-tight text-[#1D1D1F]">Bento Features</h2>
            <p className="mt-4 text-lg leading-relaxed text-[#86868B]">
              Estructura limpia y aire visual para gestionar el negocio con foco total.
            </p>
          </div>

          <div className="grid auto-rows-[minmax(220px,auto)] gap-5 md:grid-cols-6">
            <Card className="p-10 md:col-span-3">
              <CalendarCheck2 className="mb-5 h-7 w-7 text-[#0071E3]" />
              <h3 className="mb-3 text-2xl font-bold tracking-tight text-[#1D1D1F]">Agenda Inteligente</h3>
              <p className="leading-relaxed text-[#86868B]">Turnos sin superposiciones y confirmaciones claras para todo el equipo.</p>
            </Card>

            <Card className="p-10 md:col-span-3">
              <Scissors className="mb-5 h-7 w-7 text-[#0071E3]" />
              <h3 className="mb-3 text-2xl font-bold tracking-tight text-[#1D1D1F]">Servicios Claros</h3>
              <p className="leading-relaxed text-[#86868B]">Catalogo ordenado con duracion y precio para vender con confianza.</p>
            </Card>

            <Card className="p-10 md:col-span-2">
              <Boxes className="mb-5 h-7 w-7 text-[#0071E3]" />
              <h3 className="mb-3 text-xl font-bold tracking-tight text-[#1D1D1F]">Inventario Vivo</h3>
              <p className="leading-relaxed text-[#86868B]">Control de stock en tiempo real, sin planillas externas.</p>
            </Card>

            <Card className="p-10 md:col-span-2">
              <BarChart3 className="mb-5 h-7 w-7 text-[#0071E3]" />
              <h3 className="mb-3 text-xl font-bold tracking-tight text-[#1D1D1F]">Metricas Reales</h3>
              <p className="leading-relaxed text-[#86868B]">Ingresos y rendimiento de equipo en un panel directo.</p>
            </Card>

            <Card className="p-10 md:col-span-2">
              <Clock3 className="mb-5 h-7 w-7 text-[#0071E3]" />
              <h3 className="mb-3 text-xl font-bold tracking-tight text-[#1D1D1F]">Automatizacion</h3>
              <p className="leading-relaxed text-[#86868B]">Recordatorios automaticos para bajar ausencias y huecos.</p>
            </Card>
          </div>
        </Section>

        <Section className="py-24">
          <div className="mb-8 max-w-3xl">
            <h2 className="text-5xl font-bold tracking-tight text-[#1D1D1F]">Indicadores Clave</h2>
            <p className="mt-4 text-lg leading-relaxed text-[#86868B]">
              Sin charts dinamicos: numeros grandes y legibles para decisiones rapidas.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="p-10">
              <Users2 className="mb-5 h-8 w-8 text-[#0071E3]" />
              <p className="text-6xl font-extrabold tracking-tight text-[#1D1D1F]">99%</p>
              <p className="mt-2 leading-relaxed text-[#86868B]">Disponibilidad</p>
            </Card>

            <Card className="p-10">
              <CalendarCheck2 className="mb-5 h-8 w-8 text-[#0071E3]" />
              <p className="text-6xl font-extrabold tracking-tight text-[#1D1D1F]">+2.5x</p>
              <p className="mt-2 leading-relaxed text-[#86868B]">Retencion de clientes</p>
            </Card>

            <Card className="p-10">
              <BarChart3 className="mb-5 h-8 w-8 text-[#0071E3]" />
              <p className="text-6xl font-extrabold tracking-tight text-[#1D1D1F]">-40%</p>
              <p className="mt-2 leading-relaxed text-[#86868B]">No-shows mensuales</p>
            </Card>
          </div>
        </Section>
      </div>
    </main>
  );
}
