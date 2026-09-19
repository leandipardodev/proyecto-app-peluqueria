"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Playfair_Display } from "next/font/google";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Clock, LogOut, Play, School, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import {
  CATEGORIES,
  TUTORIALS,
  TUTORIALS_PAGE,
  type Tutorial,
  type TutorialCategoryId,
} from "@/components/tutoriales/tutoriales-data";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "700", "800", "900"] });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { type: "spring" as const, stiffness: 110, damping: 22 },
};

function VideoCard({ tutorial }: { tutorial: Tutorial }) {
  const [playing, setPlaying] = useState(false);
  const category = CATEGORIES.find((c) => c.id === tutorial.category) ?? CATEGORIES[1];
  const hasVideo = tutorial.youtubeId.trim().length > 0;
  const thumb = hasVideo ? `https://i.ytimg.com/vi/${tutorial.youtubeId}/hqdefault.jpg` : "";

  return (
    <motion.article
      {...reveal}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 160, damping: 18 }}
      className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-[0_20px_40px_rgba(0,0,0,0.04)]"
    >
      <div className="relative aspect-video overflow-hidden bg-slate-900">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${tutorial.youtubeId}?autoplay=1&rel=0`}
            title={tutorial.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : hasVideo ? (
          <>
<Image src={thumb} alt={tutorial.title} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" priority={tutorial.popular} className="object-cover transition duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />
          </>
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${category.cover}`}>
            <div className="absolute inset-0 bg-[radial-gradient(70%_70%_at_20%_10%,rgba(255,255,255,0.35),transparent_60%)]" />
            <span className="absolute right-3 top-3 rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700 backdrop-blur">
              {TUTORIALS_PAGE.comingSoonLabel}
            </span>
          </div>
        )}

        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center">
            {hasVideo ? (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                aria-label={`Reproducir ${tutorial.title}`}
                className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-[#0071E3] shadow-[0_18px_38px_rgba(0,113,227,0.35)] transition group-hover:scale-110 hover:bg-white"
              >
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              </button>
            ) : (
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-lg">
                <Play className="ml-0.5 h-5 w-5" />
              </span>
            )}
          </div>
        )}

        {hasVideo && (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-slate-950/65 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
            <Clock className="h-3 w-3" />
            {tutorial.duration}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] ${category.tag}`}>
            {category.label}
          </span>
          {tutorial.popular && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#0071E3]/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#0071E3]">
              {TUTORIALS_PAGE.popularLabel}
            </span>
          )}
        </div>
        <h3 className={`${playfair.className} mt-3 text-xl font-bold leading-snug tracking-[-0.02em] text-[#101625] sm:text-2xl`}>
          {tutorial.title}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-[#5f6673]">{tutorial.description}</p>
        {hasVideo && !playing && (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-semibold text-[#0071E3] transition hover:gap-2"
          >
            {TUTORIALS_PAGE.watchLabel} <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.article>
  );
}

export default function TutorialesClient() {
  const { user } = useAuth();
  const [active, setActive] = useState<TutorialCategoryId | "todos">("todos");

  const videos = useMemo(
    () => (active === "todos" ? TUTORIALS : TUTORIALS.filter((t) => t.category === active)),
    [active],
  );

  return (
    <main className={`${jakarta.className} relative min-h-screen overflow-hidden bg-[#F6F7FB]`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at 12% 10%, rgba(59,130,246,1), transparent 30%)",
            opacity: 0.2,
          }}
        />
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at 88% 14%, rgba(14,165,233,1), transparent 28%)",
            opacity: 0.18,
          }}
        />
        <div className="absolute -top-24 left-[8%] h-72 w-72 rounded-full bg-[#0ea5e9]/12 blur-3xl animate-[floatOrb_12s_ease-in-out_infinite]" />
        <div className="absolute top-[22%] right-[6%] h-80 w-80 rounded-full bg-[#1d4ed8]/12 blur-3xl animate-[floatOrb_16s_ease-in-out_infinite_reverse]" />
        <div className="absolute bottom-[-10%] left-[35%] h-[26rem] w-[26rem] rounded-full bg-[#7dd3fc]/14 blur-3xl animate-[floatOrb_18s_ease-in-out_infinite]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/70 bg-white/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-end px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-[#1D1D1F] transition hover:bg-slate-50 sm:px-5"
            >
              Inicio
            </Link>
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
                  <LogOut className="h-3.5 w-3.5" />
                  Cerrar sesion
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
                  Registrarse
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.section {...reveal} className="pt-16 pb-12 sm:pt-24 sm:pb-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#0071E3] shadow-[0_10px_24px_rgba(2,6,23,0.08)]">
              <School className="h-3.5 w-3.5" />
              {TUTORIALS_PAGE.badge}
            </p>
            <h1
              className={`${playfair.className} title-animated mt-5 text-5xl font-black tracking-[-0.05em] text-[#101625] sm:text-6xl md:text-7xl`}
            >
              {TUTORIALS_PAGE.title}
            </h1>
            <p className="mt-5 text-base leading-relaxed text-[#5f6673] sm:text-lg">
              {TUTORIALS_PAGE.subtitle}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={TUTORIALS_PAGE.ctaHref}
                className="inline-flex items-center rounded-full bg-[#0071E3] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(0,113,227,0.40)] transition hover:translate-y-[-1px] hover:bg-[#0064cc] sm:px-8 sm:py-3.5"
              >
                {TUTORIALS_PAGE.ctaLabel}
              </Link>
            </div>
          </div>
        </motion.section>

        <section id="tutoriales" className="scroll-mt-24 pb-10">
          <div className="mb-8 -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
            {CATEGORIES.map((c) => (
              <motion.button
                key={c.id}
                type="button"
                onClick={() => setActive(c.id)}
                whileTap={{ scale: 0.96 }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active === c.id
                    ? "bg-[#0071E3] text-white shadow-[0_12px_28px_rgba(0,113,227,0.32)]"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {c.label}
              </motion.button>
            ))}
          </div>

          {videos.length > 0 ? (
            <motion.div layout className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {videos.map((t) => (
                <VideoCard key={t.title} tutorial={t} />
              ))}
            </motion.div>
          ) : (
            <p className="rounded-3xl border border-slate-200 bg-white/95 px-6 py-12 text-center text-sm text-[#5f6673]">
              {TUTORIALS_PAGE.emptyCategoryLabel}
            </p>
          )}
        </section>

        <motion.section {...reveal} className="relative z-[200] pb-14 pt-6 sm:pt-10">
          <div className="relative isolate overflow-hidden rounded-[2rem] border-white/80 bg-[radial-gradient(110%_120%_at_8%_0%,#0f172a_10%,#111c34_46%,#0b1324_100%)] p-6 sm:p-8 md:p-12 shadow-[0_30px_70px_rgba(2,6,23,0.45)]">
            <div className="pointer-events-none absolute -top-24 right-10 h-56 w-56 rounded-full bg-sky-400/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-blue-600/25 blur-3xl" />
            <div className="relative">
              <p className="text-xs uppercase tracking-[0.18em] text-sky-300">{TUTORIALS_PAGE.finalCta.kicker}</p>
              <h2 className={`${playfair.className} mt-3 max-w-3xl text-4xl font-bold tracking-[-0.035em] text-white sm:text-5xl`}>
                {TUTORIALS_PAGE.finalCta.title}
              </h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-slate-300">
                {TUTORIALS_PAGE.finalCta.body}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href={TUTORIALS_PAGE.finalCta.primaryHref}
                  className="inline-flex rounded-full bg-white px-6 py-3 text-sm font-bold text-slate-900 transition hover:translate-y-[-1px] hover:bg-slate-100"
                >
                  {TUTORIALS_PAGE.finalCta.primaryLabel}
                </Link>
                <a
                  href={TUTORIALS_PAGE.finalCta.secondaryHref}
                  className="inline-flex rounded-full border border-white/25 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  {TUTORIALS_PAGE.finalCta.secondaryLabel}
                </a>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section {...reveal} className="pb-12">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/" className="text-xs text-[#86868B] underline-offset-2 hover:underline">
              Inicio
            </Link>
            <span className="text-xs text-[#a1a1aa]">-</span>
            <Link href="/terminos" className="text-xs text-[#86868B] underline-offset-2 hover:underline">
              Terminos y Condiciones
            </Link>
            <span className="text-xs text-[#a1a1aa]">-</span>
            <Link href="/privacidad" className="text-xs text-[#86868B] underline-offset-2 hover:underline">
              Privacidad
            </Link>
            <span className="text-xs text-[#a1a1aa]">-</span>
            <Link href="mailto:soporte@klip.com.ar" className="text-xs text-[#86868B] underline-offset-2 hover:underline">
              Soporte
            </Link>
          </div>
        </motion.section>
      </div>

      <style>{`
        @keyframes floatOrb {
          0% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(0,-16px,0) scale(1.04); }
          100% { transform: translate3d(0,0,0) scale(1); }
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

        @media (prefers-reduced-motion: reduce) {
          .title-animated,
          .animate-\\[floatOrb_12s_ease-in-out_infinite\\],
          .animate-\\[floatOrb_16s_ease-in-out_infinite_reverse\\],
          .animate-\\[floatOrb_18s_ease-in-out_infinite\\] {
            animation: none !important;
          }
        }
      `}</style>
    </main>
  );
}