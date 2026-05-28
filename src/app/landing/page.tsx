"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import { CalendarDays, Scissors, Boxes, Wallet, Users, Check, TriangleAlert } from "lucide-react";
import HomeFeaturesCarousel from "@/components/dashboard/home-features-carousel";

const EASE: [number, number, number, number] = [0.43, 0.13, 0.23, 0.96];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, ease: EASE },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

function MagneticButton({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  function onMove(e: ReactMouseEvent<HTMLAnchorElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    x.set(dx * 0.15);
    y.set(dy * 0.15);
  }

  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div style={{ x, y }} transition={{ duration: 0.55, ease: EASE }}>
      <Link
        ref={ref}
        href={href}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        data-cursor="magnetic"
        className={primary
          ? "relative inline-flex overflow-hidden rounded-full bg-[#0071E3] px-7 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,113,227,0.28)]"
          : "inline-flex rounded-full border border-black/10 bg-white/70 px-7 py-3 text-sm font-medium text-[#1D1D1F] backdrop-blur-2xl"}
      >
        {primary && <span className="absolute inset-0 -translate-x-full animate-[shimmer_2.8s_infinite] bg-gradient-to-r from-transparent via-white/35 to-transparent" />}
        <span className="relative z-10">{children}</span>
      </Link>
    </motion.div>
  );
}

function CustomCursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 520, damping: 34, mass: 0.28 });
  const sy = useSpring(y, { stiffness: 520, damping: 34, mass: 0.28 });
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    function onMove(e: MouseEvent) {
      x.set(e.clientX - 10);
      y.set(e.clientY - 10);
      const target = e.target as HTMLElement | null;
      const magnetic = target?.closest("[data-cursor='magnetic']");
      const card = target?.closest("[data-cursor='card']");
      const pricing = target?.closest("[data-cursor='pricing']");
      const price = target?.closest("[data-cursor='price']");
      setActive(Boolean(magnetic || card || pricing || price));
      if (price) setLabel("AR$");
      else if (pricing) setLabel("Elegir");
      else setLabel("");
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [x, y]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[9999] hidden rounded-full md:block"
      style={{
        x: sx,
        y: sy,
        width: active ? 52 : 20,
        height: active ? 52 : 20,
        border: active ? "1px solid rgba(255,255,255,0.95)" : "0px solid transparent",
        background: active ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.92)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        mixBlendMode: active ? "difference" : "normal",
      }}
      transition={{ duration: 0.24, ease: EASE }}
    >
      {label ? <span className="grid h-full w-full place-items-center text-[10px] font-medium text-white/70">{label}</span> : null}
    </motion.div>
  );
}

function PricingCard({
  plan,
  featured,
  idx,
}: {
  plan: { name: string; price: string; hint: string; cta: string; bullets: string[]; badge?: string };
  featured?: boolean;
  idx: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);

  function onMove(e: ReactMouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    ry.set((px - 0.5) * 10);
    rx.set((0.5 - py) * 10);
  }

  function onLeave() {
    ry.set(0);
    rx.set(0);
    setHovered(false);
  }

  return (
    <motion.div
      ref={ref}
      data-cursor="pricing"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: idx * 0.1, ease: EASE }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1000, willChange: "transform" }}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={onLeave}
      className="relative rounded-[2rem] border p-8 backdrop-blur-[50px] transform-gpu [backface-visibility:hidden] [contain:paint]"
    >
      {featured ? (
        <div
          className="pointer-events-none absolute inset-0 rounded-[2rem] p-px"
          style={{
            background: "linear-gradient(125deg, rgba(0,113,227,0.5), rgba(255,255,255,0.22), rgba(0,113,227,0.5))",
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 rounded-[2rem]"
        style={{
          background: "rgba(255,255,255,0.3)",
          border: "1px solid rgba(255,255,255,0.4)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -12px 24px rgba(0,0,0,0.04), 0 30px 60px rgba(0,0,0,0.12)",
        }}
      />
      {featured ? <div className="pointer-events-none absolute inset-0 rounded-[2rem] animate-[proGlow_4.5s_ease-in-out_infinite]" /> : null}

      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-black/65">{plan.name}</p>
          {plan.badge ? <span className="rounded-full border border-white/60 bg-white/30 px-2.5 py-1 text-[10px] tracking-wide text-black/70">{plan.badge}</span> : null}
        </div>

        <div data-cursor="price" className="mt-5 inline-flex items-start gap-1">
          <span className="text-sm text-black/45">$</span>
          <motion.span whileHover={{ scale: 1.05 }} transition={{ duration: 0.35, ease: EASE }} className="text-5xl font-black tracking-[-0.04em]">{plan.price}</motion.span>
          <span className="mt-6 text-xs text-black/45">/mes</span>
        </div>

        <p className="mt-2 text-xs text-black/55">{plan.hint}</p>
        <p className="mt-2 text-[11px] text-black/45">*Precios finales. Factura A o B disponible.</p>

        <div className="mt-7 space-y-2.5">
          {plan.bullets.map((b, i) => (
            <motion.div
              key={b}
              initial={false}
              animate={{ color: hovered ? "rgba(29,29,31,0.94)" : "rgba(29,29,31,0.66)", x: hovered ? 2 : 0 }}
              transition={{ duration: 0.35, delay: hovered ? i * 0.06 : 0, ease: EASE }}
              className="flex items-center gap-2 text-sm"
            >
              <Check strokeWidth={1.2} className="h-4 w-4 text-[#0071E3]" />
              {b}
            </motion.div>
          ))}
        </div>

        <button data-cursor="magnetic" className="group relative mt-8 inline-flex w-full items-center justify-center overflow-hidden rounded-full bg-black px-5 py-3 text-sm font-medium text-white">
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 ease-[cubic-bezier(.43,.13,.23,.96)] group-hover:translate-x-full" />
          <span className="relative z-10">{plan.cta}</span>
        </button>
      </div>
    </motion.div>
  );
}

function SpotlightCard({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ x: 50, y: 50 });

  function onMove(e: ReactMouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSpot({ x, y });
  }

  return (
    <motion.div
      ref={ref}
      data-cursor="card"
      onMouseMove={onMove}
      className={`relative overflow-hidden rounded-[2rem] border border-white/30 bg-white/40 p-8 backdrop-blur-[40px] transform-gpu [backface-visibility:hidden] [contain:paint] ${className || ""}`}
      style={{
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65), 0 24px 60px rgba(0,0,0,0.08)",
        willChange: "transform",
      }}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-90"
        style={{
          background: `radial-gradient(340px circle at ${spot.x}% ${spot.y}%, rgba(0,113,227,0.18), rgba(255,255,255,0.02) 45%, transparent 68%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}


export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const mockRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const smoothScrollProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.35 });
  const rotateX = useTransform(smoothScrollProgress, [0, 1], [0, 18]);
  const y = useTransform(smoothScrollProgress, [0, 1], [0, -120]);
  const heroTiltY = useTransform(smoothScrollProgress, [0, 1], [0, 10]);
  const oppositeParallax = useTransform(smoothScrollProgress, [0, 1], [0, 90]);
  const hoverX = useMotionValue(0);
  const hoverY = useMotionValue(0);
  const smoothHoverX = useSpring(hoverX, { stiffness: 220, damping: 24, mass: 0.6 });
  const smoothHoverY = useSpring(hoverY, { stiffness: 220, damping: 24, mass: 0.6 });
  const [mockHover, setMockHover] = useState(false);
  const mockRotateX = useTransform([smoothHoverY, rotateX], (values) => Number(values[0]) + Number(values[1]));
  const mockRotateY = useTransform([smoothHoverX, heroTiltY], (values) => Number(values[0]) + Number(values[1]));
  const glowX = useTransform(smoothHoverX, (v) => 280 + v * 20);
  const glowY = useTransform(smoothHoverY, (v) => 120 - v * 20);
  const mesh = useMotionValue(0);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (isCoarsePointer) return;
    let raf = 0;
    let start = 0;
    function tick(ts: number) {
      if (!start) start = ts;
      mesh.set(((ts - start) / 1000) * 4);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isCoarsePointer, mesh]);

  const meshX = useTransform(mesh, (v) => `${Math.sin(v * 0.05) * 14}%`);
  const meshY = useTransform(mesh, (v) => `${Math.cos(v * 0.04) * 10}%`);

  const plans = useMemo(
    () => [
      {
        name: "Solo",
        price: "9.900",
        hint: "Ideal para independientes",
        cta: "Comenzar prueba gratis",
        bullets: ["1 Usuario", "Agenda basica", "Gestion de Clientes"],
      },
      {
        name: "Pro",
        price: "19.500",
        hint: "Mas Elegido",
        badge: "Mas Elegido",
        cta: "Quiero Klip",
        bullets: ["Multi-usuario", "Control de Stock", "WhatsApp Automatizado", "Reportes 3D"],
      },
      {
        name: "Elite",
        price: "38.000",
        hint: "Para salones grandes",
        cta: "Quiero Klip",
        bullets: ["Soporte 24/7", "Analitica de Empleados", "API de Franquicias"],
      },
    ],
    []
  );

  const titleWords = ["Klip:", "La", "gestion", "de", "tu", "peluqueria,", "elevada."];

  function onMockMove(e: ReactMouseEvent<HTMLDivElement>) {
    const el = mockRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    hoverX.set((px - 0.5) * 8);
    hoverY.set((0.5 - py) * 8);
  }

  function onMockLeave() {
    setMockHover(false);
    hoverX.set(0);
    hoverY.set(0);
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#F5F5F7] text-[#1D1D1F] [scroll-behavior:smooth]">
      <CustomCursor />

      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 transform-gpu [backface-visibility:hidden]"
        style={{
          background:
            "radial-gradient(40% 38% at 20% 24%, rgba(180,207,255,0.28), transparent 70%), radial-gradient(42% 40% at 78% 30%, rgba(211,233,255,0.25), transparent 70%), radial-gradient(45% 44% at 50% 88%, rgba(255,221,238,0.2), transparent 72%), #F5F5F7",
          backgroundPositionX: isCoarsePointer ? "0%" : meshX,
          backgroundPositionY: isCoarsePointer ? "0%" : meshY,
        }}
      />

      <header className="fixed top-0 z-50 w-full border-b border-white/30 bg-white/40 backdrop-blur-[40px]">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-6">
          <p className="text-[15px] font-semibold tracking-[-0.02em]">Klip</p>
          <nav className="hidden items-center gap-7 md:flex">
            <a href="#features" className="text-xs font-medium text-black/65">Features</a>
            <a href="#pricing" className="text-xs font-medium text-black/65">Pricing</a>
            <a href="#contact" className="text-xs font-medium text-black/65">Contact</a>
          </nav>
          <MagneticButton href="/register" primary>Empezar ahora</MagneticButton>
        </div>
      </header>

      <section ref={heroRef} className="mx-auto max-w-7xl px-6 pb-32 pt-44">
        <motion.div variants={container} initial="hidden" animate="show" className="max-w-4xl">
          <motion.p variants={item} className="mb-5 text-xs font-thin uppercase tracking-[0.24em] text-black/50">
            Klip Elite Edition
          </motion.p>
          <motion.h1 variants={item} className="text-5xl font-black leading-[0.95] tracking-[-0.04em] md:text-7xl">
            {titleWords.map((w, i) => (
              <motion.span
                key={`${w}-${i}`}
                initial={{ opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: i * 0.08, ease: EASE }}
                className="mr-3 inline-block"
              >
                {w}
              </motion.span>
            ))}
          </motion.h1>
          <motion.p variants={item} className="mt-8 max-w-2xl text-lg font-thin text-black/60">
            Una experiencia de gestion fluida, luminosa y precisa. Agenda, stock y finanzas en un ecosistema pensado con obsesion por el detalle.
          </motion.p>
          <motion.div variants={item} className="mt-10 flex flex-wrap gap-4">
            <MagneticButton href="/register" primary>Empezar ahora</MagneticButton>
            <MagneticButton href="/login">Ver demo</MagneticButton>
          </motion.div>
        </motion.div>

        <motion.div
          ref={mockRef}
          data-cursor="mock"
          onMouseMove={onMockMove}
          onMouseEnter={() => setMockHover(true)}
          onMouseLeave={onMockLeave}
          className="mt-16 rounded-[2.5rem] border border-white/35 bg-white/30 p-5 backdrop-blur-[50px] transform-gpu [backface-visibility:hidden] [contain:paint] [isolation:isolate]"
          style={{
            y: isCoarsePointer ? 0 : y,
            rotateX: isCoarsePointer ? 0 : mockRotateX,
            rotateY: isCoarsePointer ? 0 : mockRotateY,
            transformPerspective: 1000,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72), 0 40px 90px rgba(0,0,0,0.14)",
            willChange: "transform",
          }}
        >
          <div className="relative overflow-hidden rounded-[2rem] p-7">
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 transform-gpu [backface-visibility:hidden]"
              animate={isCoarsePointer ? undefined : { backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"] }}
              transition={isCoarsePointer ? undefined : { duration: 18, repeat: Infinity, ease: EASE }}
              style={{
                background:
                  "radial-gradient(60% 50% at 20% 20%, rgba(56,189,248,0.16), transparent 70%), radial-gradient(52% 44% at 78% 35%, rgba(16,185,129,0.12), transparent 70%), radial-gradient(56% 52% at 55% 88%, rgba(244,63,94,0.12), transparent 72%), linear-gradient(140deg,#0b1220,#111827,#1f2937)",
                backgroundSize: "180% 180%",
              }}
            />

            <motion.div
              aria-hidden
              className="pointer-events-none absolute h-24 w-24 rounded-full bg-white/30 blur-2xl"
              style={{ x: glowX, y: glowY, opacity: mockHover ? 1 : 0 }}
              transition={{ duration: 0.25, ease: EASE }}
            />

            <div className="relative z-10">
              <div className="mb-5 rounded-2xl border border-white/20 bg-white/20 p-4 backdrop-blur-[30px]">
                <p className="text-lg font-semibold tracking-[-0.02em] text-white">Hola, Leandro! 👋</p>
                <p className="mt-1 text-xs text-white/70">Hoy, {new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}</p>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <motion.div animate={isCoarsePointer ? undefined : { y: [0, -4, 0] }} transition={isCoarsePointer ? undefined : { duration: 5.6, repeat: Infinity, ease: EASE }} className="col-span-6 rounded-2xl border border-white/20 bg-white/20 p-4 backdrop-blur-[30px]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">Proximo Turno</p>
                  <p className="mt-2 text-sm font-semibold text-white">Julian - Corte & Barba</p>
                  <p className="mt-1 text-xs text-white/75">10:30hs</p>
                  <span className="mt-3 inline-flex rounded-full bg-emerald-500/25 px-2 py-1 text-[10px] font-medium text-emerald-200">Confirmado</span>
                </motion.div>

                <motion.div animate={isCoarsePointer ? undefined : { y: [0, -6, 0] }} transition={isCoarsePointer ? undefined : { duration: 6.8, repeat: Infinity, ease: EASE, delay: 0.25 }} className="col-span-6 rounded-2xl border border-white/20 bg-white/20 p-4 backdrop-blur-[30px]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">Finanzas</p>
                  <div className="mt-4 flex items-end gap-3">
                    <div className="flex w-1/2 flex-col items-center gap-2">
                      <div className="h-16 w-7 rounded-t-md" style={{ background: "linear-gradient(180deg,#10b981 0%,#0f9f72 100%)" }} />
                      <span className="text-[10px] text-white/70">Ingresos</span>
                    </div>
                    <div className="flex w-1/2 flex-col items-center gap-2">
                      <div className="h-11 w-7 rounded-t-md" style={{ background: "linear-gradient(180deg,#f43f5e 0%,#e11d48 100%)" }} />
                      <span className="text-[10px] text-white/70">Gastos</span>
                    </div>
                  </div>
                </motion.div>

                <motion.div animate={isCoarsePointer ? undefined : { y: [0, -5, 0] }} transition={isCoarsePointer ? undefined : { duration: 7.2, repeat: Infinity, ease: EASE, delay: 0.4 }} className="col-span-12 rounded-2xl border border-white/20 bg-white/20 p-4 backdrop-blur-[30px]">
                  <div className="flex items-center gap-2">
                    <TriangleAlert strokeWidth={1.2} className="h-4 w-4 text-amber-300" />
                    <p className="text-sm text-white">Poca cera mate en stock</p>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <HomeFeaturesCarousel />

      <section id="pricing" className="mx-auto max-w-7xl px-6 py-40 [contain:layout_paint]">
        <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
          <motion.h2 variants={item} className="text-4xl font-black tracking-[-0.04em] md:text-6xl">Planes en ARS</motion.h2>
          <motion.p variants={item} className="mt-5 max-w-2xl text-lg font-thin text-black/60">Simple, claro y listo para crecer.</motion.p>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {plans.map((plan, idx) => (
              <PricingCard key={plan.name} plan={plan} idx={idx} featured={idx === 1} />
            ))}
          </div>
        </motion.div>
      </section>

      <motion.section id="features" className="mx-auto max-w-7xl px-6 py-40 transform-gpu [backface-visibility:hidden] [contain:layout_paint]" style={{ y: isCoarsePointer ? 0 : oppositeParallax, willChange: "transform" }}>
        <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
          <motion.h2 variants={item} className="text-4xl font-black tracking-[-0.04em] md:text-6xl">Bento de capacidades</motion.h2>
          <motion.p variants={item} className="mt-5 max-w-2xl text-lg font-thin text-black/60">Cada bloque esta calibrado para velocidad operativa y claridad ejecutiva.</motion.p>

          <motion.div variants={container} className="mt-14 grid auto-rows-[220px] grid-cols-1 gap-5 md:grid-cols-6">
            <motion.div variants={item} className="md:col-span-3"><SpotlightCard className="h-full"><CalendarDays strokeWidth={1.2} className="h-7 w-7 text-[#0071E3]" /><h3 className="mt-6 text-2xl font-bold tracking-[-0.03em]">Agenda inteligente</h3><p className="mt-2 text-sm text-black/60">Bloqueo de solapes, confirmaciones y reprogramaciones fluidas.</p></SpotlightCard></motion.div>
            <motion.div variants={item} className="md:col-span-3"><SpotlightCard className="h-full"><Scissors strokeWidth={1.2} className="h-7 w-7 text-[#0071E3]" /><h3 className="mt-6 text-2xl font-bold tracking-[-0.03em]">Servicios dinamicos</h3><p className="mt-2 text-sm text-black/60">Combina duraciones, precios y paquetes con precision.</p></SpotlightCard></motion.div>
            <motion.div variants={item} className="md:col-span-2"><SpotlightCard className="h-full"><Boxes strokeWidth={1.2} className="h-7 w-7 text-[#0071E3]" /><h3 className="mt-6 text-xl font-bold tracking-[-0.03em]">Stock</h3><p className="mt-2 text-sm text-black/60">Alertas reales y reposicion proactiva.</p></SpotlightCard></motion.div>
            <motion.div variants={item} className="md:col-span-2"><SpotlightCard className="h-full"><Wallet strokeWidth={1.2} className="h-7 w-7 text-[#0071E3]" /><h3 className="mt-6 text-xl font-bold tracking-[-0.03em]">Finanzas</h3><p className="mt-2 text-sm text-black/60">Flujo de caja limpio en tiempo real.</p></SpotlightCard></motion.div>
            <motion.div variants={item} className="md:col-span-2"><SpotlightCard className="h-full"><Users strokeWidth={1.2} className="h-7 w-7 text-[#0071E3]" /><h3 className="mt-6 text-xl font-bold tracking-[-0.03em]">Staff</h3><p className="mt-2 text-sm text-black/60">Roles, performance y productividad.</p></SpotlightCard></motion.div>
          </motion.div>
        </motion.div>
      </motion.section>

      <footer id="contact" className="mx-auto max-w-7xl px-6 pb-24 pt-12">
        <div className="rounded-[2rem] border border-white/35 bg-white/30 p-10 backdrop-blur-[50px]">
          <p className="text-sm font-thin text-black/55">Klip Elite Edition</p>
          <p className="mt-2 text-2xl font-black tracking-[-0.03em]">Diseñado para equipos que quieren operar en otro nivel.</p>
        </div>
      </footer>

      <style jsx global>{`
        @media (pointer: fine) {
          html,
          body,
          body * {
            cursor: none !important;
          }
        }

        @keyframes shimmer {
          100% {
            transform: translateX(220%);
          }
        }

        @keyframes proGlow {
          0%,
          100% {
            box-shadow: 0 0 0 rgba(0, 113, 227, 0.06), inset 0 0 0 rgba(0, 113, 227, 0.08);
          }
          50% {
            box-shadow: 0 0 24px rgba(0, 113, 227, 0.18), inset 0 0 26px rgba(0, 113, 227, 0.08);
          }
        }
      `}</style>
    </main>
  );
}
