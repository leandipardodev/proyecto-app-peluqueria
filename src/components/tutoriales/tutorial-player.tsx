"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Play, X } from "lucide-react";
import {
  CATEGORIES,
  TUTORIALS_PAGE,
  resolveImportance,
  tutorialThumbnail,
  type Tutorial,
} from "@/components/tutoriales/tutoriales-data";

const COPY = TUTORIALS_PAGE.player;

/** Miniatura chica + degradado para los tutoriales todavia sin publicar. */
function Thumb({ tutorial, sizes }: { tutorial: Tutorial; sizes: string }) {
  const src = tutorialThumbnail(tutorial);
  const category = CATEGORIES.find((c) => c.id === tutorial.category) ?? CATEGORIES[1];
  if (!src) {
    return (
      <div className={`absolute inset-0 bg-gradient-to-br ${category.cover}`}>
        <div className="absolute inset-0 bg-[radial-gradient(70%_70%_at_20%_10%,rgba(255,255,255,0.3),transparent_60%)]" />
      </div>
    );
  }
  return <Image src={src} alt="" fill sizes={sizes} className="object-cover" />;
}

export default function TutorialPlayer({
  tutorials,
  index,
  onIndexChange,
  onClose,
}: {
  tutorials: Tutorial[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const [listOpen, setListOpen] = useState(false);

  const tutorial = tutorials[index];
  const category = CATEGORIES.find((c) => c.id === tutorial?.category) ?? CATEGORIES[1];
  const hasVideo = Boolean(tutorial?.youtubeId.trim());
  const importance = resolveImportance(tutorial?.importance);

  /** El actual primero, despues los que le siguen y al final los anteriores. */
  const queue = useMemo(() => {
    if (index < 0 || !tutorial) return [];
    return [...tutorials.slice(index), ...tutorials.slice(0, index)];
  }, [tutorials, index, tutorial]);

  const step = useCallback(
    (delta: number) => {
      if (tutorials.length < 2) return;
      onIndexChange((index + delta + tutorials.length) % tutorials.length);
    },
    [index, onIndexChange, tutorials.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!tutorial) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 lg:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <button
        type="button"
        aria-label={COPY.closeLabel}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/85 backdrop-blur-md"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={tutorial.title}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="relative flex h-full max-h-full w-full max-w-6xl flex-col overflow-hidden bg-[#0B1222] sm:max-h-[92vh] sm:rounded-3xl sm:border sm:border-white/10 sm:shadow-[0_40px_90px_rgba(0,0,0,0.6)] lg:h-auto lg:flex-row"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative aspect-video max-h-[46svh] w-full shrink-0 bg-black lg:max-h-none">
            {hasVideo ? (
              <iframe
                key={tutorial.youtubeId}
                className="absolute inset-0 h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${tutorial.youtubeId}?autoplay=1&rel=0`}
                title={tutorial.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className={`absolute inset-0 bg-gradient-to-br ${category.cover}`}>
                <div className="absolute inset-0 bg-[radial-gradient(70%_70%_at_20%_10%,rgba(255,255,255,0.3),transparent_60%)]" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white/70">
                    <Play className="ml-0.5 h-5 w-5" />
                  </span>
                  <p className="text-sm font-semibold text-white/90">{COPY.watchHereLabel}</p>
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] ${category.tag}`}>
                {category.label}
              </span>
              {hasVideo && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                  <Clock className="h-3 w-3" />
                  {tutorial.duration}
                </span>
              )}
              {importance && (
                <span className="text-[11px] font-medium text-slate-400">
                  · {TUTORIALS_PAGE.importance.title} {importance.value}/100
                </span>
              )}
            </div>
            <h2 className="mt-2.5 text-xl font-bold leading-snug tracking-[-0.02em] text-white sm:text-2xl">
              {tutorial.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{tutorial.description}</p>
          </div>
        </div>

        <aside className="flex shrink-0 flex-col border-t border-white/10 bg-white/[0.02] pb-[env(safe-area-inset-bottom)] lg:w-[21rem] lg:border-l lg:border-t-0 lg:pb-0">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              {COPY.listTitle}
              <span className="ml-1.5 text-slate-500">{queue.length}</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={tutorials.length < 2}
                aria-label={COPY.prevLabel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={tutorials.length < 2}
                aria-label={COPY.nextLabel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setListOpen((v) => !v)}
                aria-label={COPY.toggleListLabel}
                aria-expanded={listOpen}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
              >
                <ChevronDown className={`h-4 w-4 transition ${listOpen ? "rotate-180" : ""}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={COPY.closeLabel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            className={`min-h-0 overflow-y-auto transition-[max-height,opacity] duration-300 ease-out lg:block lg:max-h-none lg:flex-1 lg:opacity-100 ${listOpen ? "max-h-[min(42svh,340px)] opacity-100" : "max-h-0 opacity-0"}`}
          >
            {queue.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-slate-500">{COPY.emptyListLabel}</p>
            ) : (
              <ul className="space-y-0.5 px-2 pb-3">
                {queue.map((item, i) => {
                  const isCurrent = i === 0;
                  const tone = resolveImportance(item.importance);
                  return (
                    <li key={item.title}>
                      <button
                        type="button"
                        onClick={() => onIndexChange((index + i) % tutorials.length)}
                        aria-current={isCurrent}
                        className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${
                          isCurrent ? "bg-white/[0.08]" : "hover:bg-white/5"
                        }`}
                      >
                        <div className="relative h-11 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900 ring-1 ring-white/10">
                          <Thumb tutorial={item} sizes="80px" />
                          {isCurrent && (
                            <span className="absolute inset-0 grid place-items-center bg-slate-950/55">
                              <Play className="ml-0.5 h-3.5 w-3.5 fill-white text-white" />
                            </span>
                          )}
                          {!item.youtubeId.trim() && (
                            <span className="absolute bottom-0.5 right-0.5 rounded bg-slate-950/80 px-1 text-[8px] font-semibold text-white/70">
                              {TUTORIALS_PAGE.comingSoonLabel}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-[13px] font-semibold leading-tight ${
                              isCurrent ? "text-white" : "text-slate-300"
                            }`}
                          >
                            {item.title}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                            {isCurrent ? COPY.playingLabel : CATEGORIES.find((c) => c.id === item.category)?.label}
                            {tone && (
                              <span className="ml-auto h-[3px] w-7 shrink-0 overflow-hidden rounded-full bg-white/20">
                                <span
                                  className="block h-full rounded-full bg-white/80"
                                  style={{ width: `${tone.value}%` }}
                                />
                              </span>
                            )}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </motion.div>
    </motion.div>
  );
}
