"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useInView, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import { LogOut } from "lucide-react";
import { Playfair_Display } from "next/font/google";
import { Plus_Jakarta_Sans } from "next/font/google";
import HomeFeaturesCarousel from "@/components/dashboard/home-features-carousel";
import { supabase } from "@/lib/supabase";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "700", "800", "900"] });

function trialLabel(days: number): string {
  if (days % 7 === 0 && days / 7 <= 4) {
    const weeks = days / 7;
    return weeks === 1 ? "1 semana" : `${weeks} semanas`;
  }
  if (days === 30 || days === 31) return "1 mes";
  return days === 1 ? "1 día" : `${days} días`;
}
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { type: "spring", stiffness: 110, damping: 22 },
} as const;

const MOTION = {
  hover: { type: "spring" as const, stiffness: 160, damping: 18 },
};

const marqueeItems = [
  "Agenda inteligente",
  "Señas online",
  "Mensajes recordatorios de turnos",
  "Inventario vivo",
  "Panel multi local",
  "Metricas accionables",
  "Clientes fidelizados",
];

function ParallaxLayer({
  children,
  intensity = 1,
}: {
  children: React.ReactNode;
  intensity?: number;
}) {
  const [enableParallax, setEnableParallax] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setEnableParallax(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 0.5, 1], enableParallax ? [42 * intensity, 0, -42 * intensity] : [0, 0, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], enableParallax ? [0.72, 1, 1, 0.78] : [1, 1, 1, 1]);

  return (
    <motion.div
      ref={ref}
      style={{ y, opacity }}
      className="relative z-10"
    >
      {children}
    </motion.div>
  );
}

function SweepSection({
  children,
  sweepClassName = "bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.55)_48%,transparent_100%)]",
  allowOverflow = false,
}: {
  children: React.ReactNode;
  sweepClassName?: string;
  allowOverflow?: boolean;
}) {
  return (
    <motion.div className={`relative rounded-[2rem] ${allowOverflow ? "overflow-visible" : "overflow-hidden"}`} initial={{ opacity: 0.88 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.2 }}>
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute -left-1/3 top-0 z-20 h-full w-1/2 -skew-x-12 ${sweepClassName}`}
        initial={{ x: "-140%", opacity: 0 }}
        whileInView={{ x: "280%", opacity: [0, 0.55, 0] }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 1.35, ease: [0.22, 1, 0.36, 1] }}
      />
      {children}
    </motion.div>
  );
}

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
      whileHover={{ y: -3 }}
      transition={MOTION.hover}
      className={`rounded-3xl border border-slate-200 bg-white/95 shadow-[0_20px_40px_rgba(0,0,0,0.04)] ${className}`}
    >
      {children}
    </motion.div>
  );
}

function CountUp({ to, suffix = "", className = "" }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let frame = 0;
    const duration = 1100;
    const steps = 44;
    const tick = window.setInterval(() => {
      frame += 1;
      const progress = Math.min(frame / steps, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(to * eased));
      if (progress >= 1) window.clearInterval(tick);
    }, Math.max(Math.round(duration / steps), 16));
    return () => window.clearInterval(tick);
  }, [inView, to]);

  return (
    <span ref={ref} className={className}>
      {value}
      {suffix}
    </span>
  );
}

function WordReveal({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const words = text.split(/\s+/);

  return (
    <span ref={ref} className={className}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className="inline-block"
          initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
          animate={inView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
          transition={{
            delay: i * 0.06,
            duration: 0.45,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {word}
          {i < words.length - 1 ? "\u00A0" : ""}
        </motion.span>
      ))}
    </span>
  );
}

function OAuthHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) return;
    if (process.env.NODE_ENV !== "production") {
      console.info("[oauth-debug][home] received code on home", {
        href: window.location.href,
        search: window.location.search,
      });
    }
    const passthrough = new URLSearchParams(searchParams.toString());
    if (!passthrough.get("flow")) {
      const storedFlow = window.sessionStorage.getItem("klip_oauth_flow");
      if (storedFlow) passthrough.set("flow", storedFlow);
    }
    if (!passthrough.get("next")) {
      const storedNext = window.sessionStorage.getItem("klip_oauth_next");
      if (storedNext) passthrough.set("next", storedNext);
    }
    if (!passthrough.get("state")) {
      const storedState = window.sessionStorage.getItem("klip_oauth_state");
      if (storedState) passthrough.set("state", storedState);
    }
    const query = passthrough.toString();
    if (process.env.NODE_ENV !== "production") {
      console.info("[oauth-debug][home] redirecting to callback", `/auth/callback${query ? `?${query}` : ""}`);
    }
    router.replace(`/auth/callback${query ? `?${query}` : ""}`);
  }, [router, searchParams]);

  return null;
}

export default function Home({ monthlyPrice, trialDays }: { monthlyPrice: number; trialDays: number }) {
  const hero3DRef = useRef<HTMLDivElement | null>(null);
  const mouseX = useMotionValue(-1000);
  const mouseY = useMotionValue(-1000);
  const smoothX = useSpring(mouseX, { stiffness: 120, damping: 24, mass: 0.45 });
  const smoothY = useSpring(mouseY, { stiffness: 120, damping: 24, mass: 0.45 });

  const { user } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [turnosHoy, setTurnosHoy] = useState(8);

  const { scrollYProgress } = useScroll();
  const bgBlueOpacity = useTransform(scrollYProgress, [0, 0.5], [0.22, 0.06]);
  const bgCyanOpacity = useTransform(scrollYProgress, [0, 0.5], [0.2, 0.04]);
  const bgDarkOpacity = useTransform(scrollYProgress, [0.3, 0.8], [0.05, 0.25]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.6, 1], [0, 0.15, 0.45]);

  const { scrollYProgress: heroProgress } = useScroll({
    target: hero3DRef,
    offset: ["start end", "end start"],
  });
  const panelRotateX = useTransform(heroProgress, [0, 0.45, 1], [10, 0, -9]);
  const panelRotateY = useTransform(heroProgress, [0, 0.5, 1], [-6, 0, 6]);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    function onMove(e: MouseEvent) {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    }
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      mq.removeEventListener("change", apply);
    };
  }, [mouseX, mouseY]);

  useEffect(() => {
    const target = 24;
    const timer = window.setInterval(() => {
      setTurnosHoy((prev) => {
        if (prev >= target) {
          window.clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 260);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className={`${jakarta.className} relative min-h-screen overflow-hidden bg-[#F6F7FB]`}>
      <Suspense fallback={null}>
        <OAuthHandler />
      </Suspense>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <motion.div
          className="absolute inset-0"
          style={{
            opacity: bgBlueOpacity,
            backgroundImage: "radial-gradient(circle at 12% 10%, rgba(59,130,246,1), transparent 30%)",
          }}
        />
        <motion.div
          className="absolute inset-0"
          style={{
            opacity: bgCyanOpacity,
            backgroundImage: "radial-gradient(circle at 88% 14%, rgba(14,165,233,1), transparent 28%)",
          }}
        />
        <motion.div
          className="absolute inset-0"
          style={{
            opacity: bgDarkOpacity,
            backgroundImage: "radial-gradient(circle at 50% 60%, rgba(15,23,42,1), transparent 50%)",
          }}
        />
        <motion.div
          className="absolute inset-0 bg-[#0b1120]"
          style={{ opacity: overlayOpacity }}
        />
      </div>
      {mounted && (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed z-0 h-[640px] w-[640px] rounded-full bg-blue-400/12 blur-[120px]"
          style={{
            x: smoothX,
            y: smoothY,
            translateX: "-50%",
            translateY: "-50%",
          }}
        />
      )}

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-[8%] h-72 w-72 rounded-full bg-[#0ea5e9]/12 blur-3xl animate-[floatOrb_12s_ease-in-out_infinite]" />
        <div className="absolute top-[22%] right-[6%] h-80 w-80 rounded-full bg-[#1d4ed8]/12 blur-3xl animate-[floatOrb_16s_ease-in-out_infinite_reverse]" />
        <div className="absolute bottom-[-10%] left-[35%] h-[26rem] w-[26rem] rounded-full bg-[#7dd3fc]/14 blur-3xl animate-[floatOrb_18s_ease-in-out_infinite]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/70 bg-white/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-end px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="rounded-full bg-[#0071E3] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0064cc]"
                >
                  Panel
                </Link>
                <button
                  type="button"
                  onClick={() => supabase.auth.signOut()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-[#1D1D1F] transition hover:bg-slate-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
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
                  Comenzar
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute left-2 top-44 hidden h-[74%] w-px bg-gradient-to-b from-transparent via-slate-300/70 to-transparent lg:block" />
        <div className="pointer-events-none absolute left-[3px] top-56 hidden h-2.5 w-2.5 rounded-full bg-[#0071E3]/80 shadow-[0_0_18px_rgba(0,113,227,0.45)] lg:block" />
        <div className="pointer-events-none absolute left-[3px] top-[34rem] hidden h-2.5 w-2.5 rounded-full bg-cyan-400/80 shadow-[0_0_18px_rgba(34,211,238,0.45)] lg:block" />
        <div className="pointer-events-none absolute left-[3px] top-[62rem] hidden h-2.5 w-2.5 rounded-full bg-slate-400/80 shadow-[0_0_18px_rgba(100,116,139,0.45)] lg:block" />
        <Section className="pt-4 pb-10 sm:pt-6 sm:pb-14 md:pt-8 md:pb-20">
          <Card className="relative overflow-hidden p-4 sm:p-8 md:p-14 bg-[radial-gradient(120%_120%_at_8%_0%,#ffffff_20%,#edf4ff_58%,#e8f5ff_100%)] border-white/90 shadow-[0_42px_90px_rgba(15,23,42,0.16)]">
            <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/70" />
            <div className="pointer-events-none absolute -inset-x-20 top-0 h-full hero-sheen" />
            <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-[#0071E3]/16 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-cyan-300/22 blur-3xl" />
            <div className={`${playfair.className} pointer-events-none absolute right-6 top-4 hidden lg:block text-[10rem] leading-none font-black tracking-[-0.07em] text-[#0b172f]/5`}>
              KLIP
            </div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white px-2.5 py-1.5 text-[9px] uppercase tracking-[0.2em] text-[#68707d] shadow-[0_10px_24px_rgba(2,6,23,0.08)] sm:mb-5 sm:px-3 sm:text-[10px] sm:tracking-[0.24em]">
              Turnos · Gestión · Cobros
            </p>

            <motion.div
              className={`${playfair.className} mb-2 pb-1 text-5xl sm:mb-3 sm:text-7xl md:text-8xl font-black tracking-[-0.06em] leading-[1.06]`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              style={{
                backgroundImage: "linear-gradient(120deg,#0f172a 0%,#1d4ed8 38%,#0ea5e9 66%,#7dd3fc 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                textShadow: "0 16px 42px rgba(30,64,175,0.22)",
              }}
            >
              Klip
            </motion.div>

            <div className="mb-5 overflow-hidden rounded-full border border-white/80 bg-white sm:mb-6">
              <div className="marquee-track flex w-max gap-2 px-3 py-2">
                {[...marqueeItems, ...marqueeItems].map((item, i) => (
                  <span
                    key={`${item}-${i}`}
                    className="rounded-full border border-slate-200/80 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative z-10 grid gap-6 md:gap-10 lg:grid-cols-[1.1fr_0.9fr] items-start">
              <div className="max-w-3xl">
              <h1 className={`${playfair.className} text-[2.05rem] font-black tracking-[-0.045em] leading-[0.95] text-[#0e1628] sm:text-6xl sm:tracking-[-0.055em] sm:leading-[0.92] md:text-7xl lg:text-8xl`}>
                <WordReveal text="Menos ausencias. Mas clientes fieles. Tu negocio bajo control." />
              </h1>

              <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-[#5f6673] sm:mt-7 sm:text-lg">
                Klip es una agenda con calendario, mensajes recordatorios, inventario, caja, estrategias de retencion de cliente y mas, todo en una misma plataforma. Configuralo en pocos minutos y empeza a organizar y hacer crecer tu negocio.
              </p>

              <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[#4b5563] sm:text-base">
                Plan mensual: ${monthlyPrice.toLocaleString("es-AR")}. Tenés {trialLabel(trialDays)} de prueba gratis para que lo pruebes con tu equipo.
              </p>

              <div className="mt-7 sm:mt-10">
                <Link
                  href={user ? "/dashboard" : "/register"}
                  className="inline-flex rounded-full bg-[#0071E3] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(0,113,227,0.40)] transition hover:translate-y-[-1px] hover:bg-[#0064cc] sm:px-10 sm:py-4 sm:text-base"
                >
                  {user ? "Ir al panel" : "Empezar gratis ahora"}
                </Link>
              </div>
              </div>

              <motion.div
                ref={hero3DRef}
                className="relative mx-auto w-full max-w-[430px] lg:max-w-none"
                style={{
                  rotateX: isDesktop ? panelRotateX : 0,
                  rotateY: isDesktop ? panelRotateY : 0,
                  transformStyle: "preserve-3d",
                }}
              >
                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[#0ea5e9]/20 via-[#1d4ed8]/10 to-transparent blur-2xl" />
                <div className="pointer-events-none absolute -inset-1 rounded-[2rem] border border-white/50" />
                <div className="pointer-events-none absolute right-3 top-3 h-20 w-20 rounded-full border border-sky-300/50">
                  <div className="absolute inset-2 rounded-full border border-sky-300/45 animate-[spin_7s_linear_infinite]" />
                  <div className="absolute inset-4 rounded-full border border-blue-400/40 animate-[spin_4s_linear_infinite_reverse]" />
                </div>
                <div className="relative rounded-[1.5rem] border border-white/70 bg-white p-3.5 sm:rounded-[1.8rem] sm:p-5 shadow-[0_24px_56px_rgba(15,23,42,0.14)]">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Panel en vivo</p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Online
                    </span>
                  </div>
                  <div className="space-y-3">
                    <motion.div className="rounded-2xl border border-white/70 bg-white p-3" style={{ translateZ: 24 }} whileHover={{ y: -3, scale: 1.01 }}>
                      <p className="text-xs text-slate-500">Turnos de hoy</p>
                      <div className="mt-1 flex flex-wrap items-end gap-2">
                        <motion.p
                          key={turnosHoy}
                          initial={{ opacity: 0, y: 10, scale: 0.9, filter: "blur(4px)" }}
                          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                          transition={{ duration: 0.32, ease: "easeOut" }}
                          className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl"
                        >
                          {turnosHoy}
                        </motion.p>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                          +18% hoy
                        </span>
                      </div>
                    </motion.div>
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                      <motion.div className="rounded-2xl border border-white/70 bg-white p-3" style={{ translateZ: 34 }} whileHover={{ y: -3, scale: 1.01 }}>
                        <p className="text-xs text-slate-500">Ausentismo</p>
                        <p className="mt-1 text-lg font-black text-rose-500 sm:text-xl">-40%</p>
                      </motion.div>
                      <motion.div className="rounded-2xl border border-white/70 bg-white p-3" style={{ translateZ: 34 }} whileHover={{ y: -3, scale: 1.01 }}>
                        <p className="text-xs text-slate-500">Retencion</p>
                        <p className="mt-1 text-lg font-black text-blue-600 sm:text-xl">Optima</p>
                      </motion.div>
                    </div>
                    <motion.div
                      className="rounded-2xl border border-white/70 bg-white p-3"
                      style={{ translateZ: 22 }}
                      whileHover={{ y: -3, scale: 1.01 }}
                    >
                      <p className="text-xs text-slate-500">Proximo recordatorio</p>
                      <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">Leandro - Servicio - 16:30</p>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            </div>

          </Card>
        </Section>

        <Section className="pb-4 sm:pb-8">
          <HomeFeaturesCarousel />
        </Section>

        <ParallaxLayer intensity={1.05}>
          <SweepSection sweepClassName="bg-[linear-gradient(90deg,transparent_0%,rgba(56,189,248,0.42)_48%,transparent_100%)]">
            <Section className="py-10 sm:py-20">
          <div className="mb-8 max-w-3xl">
            <h2 className={`${playfair.className} title-animated text-5xl sm:text-6xl font-bold tracking-[-0.04em] text-[#101625]`}>Como funciona Klip</h2>
            <p className="mt-4 text-lg leading-relaxed text-[#86868B]">
              Un flujo simple para que el dueño del local entienda exactamente lo que compra y lo use desde el primer dia.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <Card className="p-8 bg-gradient-to-br from-white via-white to-blue-50/60 shadow-[0_18px_38px_rgba(15,23,42,0.06)] hover:shadow-[0_24px_48px_rgba(15,23,42,0.1)] transition-shadow">
              <p className="text-xs font-semibold tracking-[0.16em] text-[#0071E3]">PASO 1</p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight text-[#1D1D1F]">Configuras tu negocio</h3>
              <p className="mt-3 leading-relaxed text-[#86868B]">Cargas tus servicios con sus duraciones, precios y asignas que empleados realizan cada tarea.</p>
            </Card>
            <Card className="p-8 bg-gradient-to-br from-white via-white to-violet-50/50 shadow-[0_18px_38px_rgba(15,23,42,0.06)] hover:shadow-[0_24px_48px_rgba(15,23,42,0.1)] transition-shadow">
              <p className="text-xs font-semibold tracking-[0.16em] text-[#0071E3]">PASO 2</p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight text-[#1D1D1F]">Compartis tu link</h3>
              <p className="mt-3 leading-relaxed text-[#86868B]">Tus clientes entran a tu pagina personalizada, reservan en segundos y ese link ayuda a posicionarte mejor en Google para captar mas clientes.</p>
            </Card>
            <Card className="p-8 bg-gradient-to-br from-white via-white to-cyan-50/50 shadow-[0_18px_38px_rgba(15,23,42,0.06)] hover:shadow-[0_24px_48px_rgba(15,23,42,0.1)] transition-shadow">
              <p className="text-xs font-semibold tracking-[0.16em] text-[#0071E3]">PASO 3</p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight text-[#1D1D1F]">El sistema trabaja solo</h3>
              <p className="mt-3 leading-relaxed text-[#86868B]">Klip se encarga de gestionar el turno, cobrar, organizarlo en tu agenda y enviarle un mensaje al usuario horas antes para terminar con los ausentismos.</p>
            </Card>
          </div>
            </Section>
          </SweepSection>
        </ParallaxLayer>







        <ParallaxLayer intensity={1.05}>
          <SweepSection sweepClassName="bg-[linear-gradient(90deg,transparent_0%,rgba(56,189,248,0.42)_48%,transparent_100%)]">
            <Section className="py-10 sm:py-12">
              <Card className="relative p-0 bg-transparent border-slate-700/60 shadow-[0_22px_68px_rgba(14,165,233,0.16),0_34px_88px_rgba(15,23,42,0.34)]">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#111c34] to-[#0b1324] p-5 sm:p-8 md:p-10">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_10%_0%,rgba(56,189,248,0.24),transparent_65%)]" />
                  <div className="relative z-10">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Comparativa real</p>
                    <h3 className={`${playfair.className} mt-3 text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-white`}>Antes vs Con Klip</h3>
                    <p className="mt-4 max-w-2xl leading-relaxed text-slate-300">Resultados concretos en menos tareas administrativas y mas recurrencia de clientes.</p>

                    <div className="mt-8 grid gap-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-400 md:grid-cols-3">
                      <p>Indicador</p><p>Antes</p><p>Con Klip</p>
                    </div>
                    <div className="mt-4 grid items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800/70 p-4 md:grid-cols-3">
                      <p className="font-semibold text-slate-200">Inasistencias mensuales</p><p className="text-2xl font-black text-rose-400">18%</p><p className="text-2xl font-black text-emerald-400"><CountUp to={6} suffix="%" /></p>
                    </div>
                    <div className="mt-3 grid items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800/70 p-4 md:grid-cols-3">
                      <p className="font-semibold text-slate-200">Horas admin por semana</p><p className="text-2xl font-black text-rose-400">12h</p><p className="text-2xl font-black text-emerald-400"><CountUp to={4} suffix="h" /></p>
                    </div>
                    <div className="mt-3 grid items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800/70 p-4 md:grid-cols-3">
                      <p className="font-semibold text-slate-200">Clientes que regresan</p><p className="text-2xl font-black text-rose-400">31%</p><p className="text-2xl font-black text-emerald-400"><CountUp to={64} suffix="%" /></p>
                    </div>
                    <div className="mt-3 grid items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800/70 p-4 md:grid-cols-3">
                      <p className="font-semibold text-slate-200">Disponibilidad online</p><p className="text-2xl font-black text-rose-400">Limitada</p><p className="text-2xl font-black text-emerald-400">99.9%</p>
                    </div>
                  </div>
                </div>
              </Card>
            </Section>
          </SweepSection>
        </ParallaxLayer>

        <ParallaxLayer intensity={0.95}>
          <SweepSection sweepClassName="bg-[linear-gradient(90deg,transparent_0%,rgba(226,232,240,0.65)_48%,transparent_100%)]">
            <Section className="py-10 sm:py-12">
              <div className="mb-7 max-w-3xl">
                <h2 className={`${playfair.className} title-animated text-5xl sm:text-6xl font-bold tracking-[-0.04em] text-[#101625]`}>Elegido por negocios que quieren crecer</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { name: "Studio Norte" },
                  { name: "Eunoia", href: "https://www.instagram.com/eunoia.hairstudio/?hl=es" },
                  { name: "Jazba", href: "https://www.instagram.com/jazba.peluqueria/?hl=es" },
                  { name: "Aire Salon" },
                  { name: "Demetrio Barber", href: "https://www.instagram.com/demetrio.barber/?hl=es" },
                  { name: "Ritual Color" },
                  { name: "Casa Corta" },
                  { name: "Seda Beauty" },
                ].map((brand) => (
                  brand.href ? (
                    <Link
                      key={brand.name}
                      href={brand.href}
                      target="_blank"
                      rel="noreferrer"
                      className="block cursor-pointer"
                    >
                      <Card className="px-4 py-5 text-center hover:border-sky-300/70 hover:bg-sky-50/70 transition-colors cursor-pointer">
                        <p className="text-sm font-semibold tracking-wide text-slate-600 hover:text-sky-700 transition-colors">{brand.name}</p>
                      </Card>
                    </Link>
                  ) : (
                    <Card key={brand.name} className="px-4 py-5 text-center">
                      <p className="text-sm font-semibold tracking-wide text-slate-600">{brand.name}</p>
                    </Card>
                  )
                ))}
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Card className="bg-gradient-to-br from-white to-slate-50 p-6"><p className="text-sm font-semibold text-slate-700">&quot;Ordenamos todo el negocio en una semana. Hoy nadie se pisa horarios.&quot;</p><p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">Cristian - JAZBA</p></Card>
                <Card className="bg-gradient-to-br from-white to-slate-50 p-6"><p className="text-sm font-semibold text-slate-700">&quot;La gente vuelve mas porque reservar y recordarles turno es facil.&quot;</p><p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">Lucho - EUNOIA</p></Card>
              </div>
            </Section>
          </SweepSection>
        </ParallaxLayer>

        <Section className="relative z-[200] pb-14 pt-6 sm:pt-10 pointer-events-auto">
          <Card className="relative z-[200] isolate overflow-hidden border-white/80 bg-[radial-gradient(110%_120%_at_8%_0%,#0f172a_10%,#111c34_46%,#0b1324_100%)] p-6 sm:p-8 md:p-12 shadow-[0_30px_70px_rgba(2,6,23,0.45)] pointer-events-auto">
            <div className="pointer-events-none absolute -top-24 right-10 h-56 w-56 rounded-full bg-sky-400/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-blue-600/25 blur-3xl" />
            <div className="relative z-[210] pointer-events-auto">
              <p className="text-xs uppercase tracking-[0.18em] text-sky-300">Ultimo paso</p>
              <h3 className={`${playfair.className} mt-3 max-w-3xl text-4xl font-bold tracking-[-0.035em] text-white sm:text-6xl`}>Converti cada horario libre en una nueva reserva.</h3>
              <p className="mt-4 max-w-2xl leading-relaxed text-slate-300">Activa tu cuenta, publica tu link y deja funcionando reservas + recordatorios en menos de 10 minutos. Sale ${monthlyPrice.toLocaleString("es-AR")} por mes y los primeros {trialLabel(trialDays)} son gratis.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href={user ? "/dashboard" : "/register"}
                  className="relative z-[220] inline-flex cursor-pointer rounded-full bg-white px-6 py-3 text-sm font-bold text-slate-900 transition hover:translate-y-[-1px] hover:bg-slate-100 pointer-events-auto"
                >
                  {user ? "Ir al panel" : "Crear cuenta gratis"}
                </Link>
              </div>
            </div>
          </Card>
        </Section>

        <Section className="pb-12">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/terminos" className="text-xs text-[#86868B] underline-offset-2 hover:underline">
              Términos y Condiciones
            </Link>
            <span className="text-xs text-[#a1a1aa]">-</span>
            <Link href="/privacidad" className="text-xs text-[#86868B] underline-offset-2 hover:underline">
              Privacidad
            </Link>
            <span className="text-xs text-[#a1a1aa]">-</span>
            <Link href="mailto:soporte@klip.com.ar" className="text-xs text-[#86868B] underline-offset-2 hover:underline">
              Soporte
            </Link>
            <span className="text-xs text-[#a1a1aa]">-</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-2 py-1 text-xs text-[#4b5563] ring-1 ring-slate-200">
              <Image src="/dix-logo.svg" alt="di.X" width={64} height={20} sizes="64px" className="h-5 w-auto object-contain" />
              Powered by di.X
            </span>
          </div>
        </Section>
      </div>

      <style>{`
        .hero-sheen {
          background: linear-gradient(108deg, transparent 20%, rgba(255,255,255,0.5) 48%, transparent 78%);
          transform: translateX(-120%);
          animation: heroSheen 9s cubic-bezier(0.22, 1, 0.36, 1) infinite;
          opacity: 0.5;
        }

        @keyframes heroSheen {
          0% { transform: translateX(-120%); }
          28% { transform: translateX(130%); }
          100% { transform: translateX(130%); }
        }

        @keyframes floatOrb {
          0% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(0,-16px,0) scale(1.04); }
          100% { transform: translate3d(0,0,0) scale(1); }
        }

        @keyframes pulseSoft {
          0% { opacity: 0.84; transform: translateY(0px); }
          50% { opacity: 1; transform: translateY(-1px); }
          100% { opacity: 0.84; transform: translateY(0px); }
        }

        .title-animated {
          background-image: linear-gradient(110deg, #0f172a 8%, #1d4ed8 38%, #0ea5e9 56%, #0f172a 84%);
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: titleFlow 7s ease-in-out infinite alternate;
        }

        @keyframes titleFlow {
          0% { background-position: 12% 50%; }
          100% { background-position: 96% 50%; }
        }

        .marquee-track {
          animation: marqueeX 22s linear infinite;
          will-change: transform;
        }

        @media (max-width: 1024px) {
          .marquee-track {
            animation-duration: 26s;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-sheen,
          .marquee-track,
          .title-animated,
          .animate-\[floatOrb_12s_ease-in-out_infinite\],
          .animate-\[floatOrb_16s_ease-in-out_infinite_reverse\],
          .animate-\[floatOrb_18s_ease-in-out_infinite\],
          .animate-\[pulseSoft_4s_ease-in-out_infinite\,numberGlow_6s_ease-in-out_infinite\] {
            animation: none !important;
          }
        }

        @keyframes marqueeX {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }

        @keyframes numberGlow {
          0% { text-shadow: 0 0 0 rgba(29,78,216,0); }
          50% { text-shadow: 0 8px 26px rgba(29,78,216,0.22); }
          100% { text-shadow: 0 0 0 rgba(29,78,216,0); }
        }
      `}</style>
    </main>
  );
}
