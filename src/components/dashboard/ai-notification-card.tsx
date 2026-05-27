"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Sparkles } from "lucide-react";

type Message = {
  id: string;
  title: string;
  body: string;
  tone: "urgent" | "action" | "insight";
};

export default function AINotificationCard({
  href,
  messages,
}: {
  href: string;
  messages: Message[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [thinking, setThinking] = useState(true);
  const [visualMode, setVisualMode] = useState<"orb" | "matrix">("orb");
  const [dotsPreset, setDotsPreset] = useState<"soft" | "neon">("soft");

  const feed = useMemo(
    () =>
      (messages.length > 0
        ? messages.slice(0, 20)
        : [{ id: "fallback", title: "Todo en orden", body: "Sin novedades urgentes.", tone: "insight" as const }]),
    [messages]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [feed.length]);

  useEffect(() => {
    const cycle = setInterval(() => {
      setThinking(true);
      const delayed = setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % feed.length);
        setThinking(false);
      }, 3000);
      return () => clearTimeout(delayed);
    }, 23000);
    return () => clearInterval(cycle);
  }, [feed.length]);

  useEffect(() => {
    const initial = setTimeout(() => setThinking(false), 550);
    return () => clearTimeout(initial);
  }, []);

  useEffect(() => {
    const modeTimer = setInterval(() => {
      setVisualMode((prev) => (prev === "orb" ? "matrix" : "orb"));
    }, 12000);
    return () => clearInterval(modeTimer);
  }, []);

  useEffect(() => {
    const dotsTimer = setInterval(() => {
      setDotsPreset((prev) => (prev === "soft" ? "neon" : "soft"));
    }, 14000);
    return () => clearInterval(dotsTimer);
  }, []);

  const active = feed[activeIndex];
  const toneClass =
    active.tone === "urgent"
      ? "border-rose-300/50 bg-rose-300/10 text-rose-900 dark:text-rose-100"
      : active.tone === "action"
        ? "border-amber-300/50 bg-amber-300/10 text-amber-900 dark:text-amber-100"
        : "border-cyan-300/50 bg-cyan-300/10 text-cyan-900 dark:text-cyan-100";
  const toneLabel = active.tone === "urgent" ? "Urgente" : active.tone === "action" ? "Accion" : "Insight";

  return (
    <Link href={href} className="group block h-full">
      <div className="relative h-[148px] md:h-[156px]">
        <div className="absolute inset-0 rounded-[2rem]" />
        <div className="ai-orb-wrap relative h-full overflow-hidden rounded-[2rem] border border-cyan-300/30 bg-white p-4 text-cyan-950 shadow-[0_20px_48px_rgba(8,145,178,0.28)] transition-transform duration-300 group-hover:-translate-y-0.5 dark:bg-slate-950/92 dark:text-cyan-50">
          <div className={`pointer-events-none absolute inset-0 ai-mode-layer ai-mode-orb ${visualMode === "orb" ? "opacity-100 blur-0" : "opacity-0 blur-[4px]"} bg-[radial-gradient(circle_at_22%_24%,rgba(6,182,212,0.22),transparent_42%),radial-gradient(circle_at_80%_16%,rgba(37,99,235,0.20),transparent_40%),radial-gradient(circle_at_45%_88%,rgba(14,165,233,0.16),transparent_44%)] dark:bg-[radial-gradient(circle_at_22%_24%,rgba(34,211,238,0.2),transparent_36%),radial-gradient(circle_at_80%_16%,rgba(96,165,250,0.18),transparent_34%)]`} />
          <div className={`pointer-events-none absolute inset-0 ai-mode-layer ai-mode-matrix ${visualMode === "matrix" ? "opacity-100 blur-0" : "opacity-0 blur-[4px]"}`}>
            <div className="ai-matrix-grid h-full w-full" />
          </div>
          <div className="pointer-events-none absolute inset-0 ai-scan" />
          <div className="pointer-events-none absolute inset-[1px] rounded-[1.95rem] border border-cyan-300/30 dark:border-cyan-200/12" />
          <div
            className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-500 ${
              thinking ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={!thinking}
          >
            <div className={`ai-analyzing ${dotsPreset === "neon" ? "ai-analyzing-neon" : "ai-analyzing-soft"}`} aria-hidden="true">
              <span className={`ai-analyzing-dot ${dotsPreset === "neon" ? "ai-analyzing-dot-neon" : "ai-analyzing-dot-soft"}`} />
              <span className={`ai-analyzing-dot ${dotsPreset === "neon" ? "ai-analyzing-dot-neon" : "ai-analyzing-dot-soft"}`} />
              <span className={`ai-analyzing-dot ${dotsPreset === "neon" ? "ai-analyzing-dot-neon" : "ai-analyzing-dot-soft"}`} />
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 inline-flex items-center gap-1.5 dark:text-cyan-200">
              <Bot className="h-3.5 w-3.5 ai-bot" />
              Klipo IA
            </p>
            <span className="inline-flex items-center gap-2 text-[11px] text-cyan-700 dark:text-cyan-200">
              <span className="h-2 w-2 rounded-full bg-emerald-300 ai-pulse" />
              Activa
            </span>
          </div>

          <div className="relative z-10 mt-2 flex h-[84px] items-start gap-3">
              <div className="relative mt-0.5 h-12 w-12 shrink-0">
                <div className="ai-orb absolute inset-0 rounded-full" />
                <div className="ai-orb-glow absolute inset-[-8px] rounded-full" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles
                    className={`absolute h-5 w-5 text-cyan-700 ai-star transition-all duration-500 dark:text-cyan-100 ${
                      visualMode === "orb" ? "opacity-100 scale-100" : "opacity-0 scale-90"
                    }`}
                  />
                  <Bot
                    className={`absolute h-5 w-5 text-cyan-700 ai-star transition-all duration-500 dark:text-cyan-100 ${
                      visualMode === "matrix" ? "opacity-100 scale-100" : "opacity-0 scale-90"
                    }`}
                  />
                </div>
              </div>

              <div className="relative min-w-0 flex-1 h-full">
                <div
                  className={`absolute inset-0 px-3 py-2.5 flex items-center justify-center ai-panel-transition ${
                    thinking ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden={!thinking}
                >
                  <div className="h-full w-full" />
                </div>

                <div
                  className={`absolute inset-0 ai-msg h-full rounded-xl border px-3 py-2.5 ${toneClass} ai-panel-transition ${
                    thinking ? "opacity-0" : "opacity-100"
                  }`}
                  aria-hidden={thinking}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold truncate">{active.title}</p>
                    <span className="text-[10px] uppercase tracking-[0.12em] opacity-90">{toneLabel}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] opacity-95">{active.body}</p>
                </div>

            </div>
          </div>

          <style jsx>{`
          .ai-orb-wrap {
            transform: perspective(1200px) rotateX(2deg);
          }
          .ai-orb {
            background: radial-gradient(circle at 30% 30%, rgba(165,243,252,0.9), rgba(14,116,144,0.5) 55%, rgba(2,6,23,0.9));
            border: 1px solid rgba(165,243,252,0.55);
            animation: orbMorph 4.8s ease-in-out infinite;
          }
          :global(html:not(.dark)) .ai-orb {
            background: radial-gradient(circle at 30% 30%, rgba(34,211,238,0.85), rgba(14,116,144,0.28) 55%, rgba(236,254,255,0.95));
            border: 1px solid rgba(14,165,233,0.45);
          }
          .ai-orb-glow {
            background: radial-gradient(circle, rgba(34,211,238,0.28), transparent 68%);
            animation: orbPulse 2.1s ease-in-out infinite;
          }
          .ai-matrix-grid {
            background-image:
              linear-gradient(rgba(14,165,233,0.26) 1px, transparent 1px),
              linear-gradient(90deg, rgba(14,165,233,0.26) 1px, transparent 1px);
            background-size: 18px 18px;
            animation: matrixDrift 6.5s linear infinite;
          }
          :global(html.dark) .ai-matrix-grid {
            background-image:
              linear-gradient(rgba(34,211,238,0.16) 1px, transparent 1px),
              linear-gradient(90deg, rgba(34,211,238,0.16) 1px, transparent 1px);
          }
          .ai-scan {
            background: linear-gradient(180deg, transparent 0%, rgba(14, 165, 233, 0.16) 48%, transparent 100%);
            animation: aiScan 3.8s linear infinite;
          }
          :global(html.dark) .ai-scan {
            background: linear-gradient(180deg, transparent 0%, rgba(45, 212, 191, 0.08) 45%, transparent 100%);
          }
          .ai-mode-layer {
            will-change: opacity, filter;
            transition: opacity 820ms cubic-bezier(0.22, 1, 0.36, 1), filter 820ms cubic-bezier(0.22, 1, 0.36, 1), transform 820ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .ai-mode-orb {
            transform: scale(1);
          }
          .ai-mode-matrix {
            transform: scale(1.015);
          }
          .ai-bot {
            animation: aiBot 2.4s ease-in-out infinite;
          }
          .ai-pulse {
            animation: aiPulse 1.3s ease-in-out infinite;
          }
          .ai-msg {
            animation: aiBreath 2.8s ease-in-out infinite;
          }
          .ai-star {
            animation: aiStar 1.4s ease-in-out infinite;
          }
          .ai-typing {
            animation: aiTyping 1.8s ease-in-out infinite;
          }
          .ai-msg-transition {
            animation: aiBreath 2.8s ease-in-out infinite, aiSwapIn 420ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .ai-analyzing {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-radius: 999px;
            backdrop-filter: blur(6px);
            transition: background 360ms ease, border-color 360ms ease, box-shadow 360ms ease;
          }
          .ai-analyzing-soft {
            background: linear-gradient(135deg, rgba(14,165,233,0.07), rgba(6,182,212,0.1));
            border: 1px solid rgba(34, 211, 238, 0.16);
            box-shadow: 0 8px 20px rgba(14, 165, 233, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.22);
          }
          .ai-analyzing-neon {
            background: linear-gradient(135deg, rgba(14,165,233,0.08), rgba(6,182,212,0.14));
            border: 1px solid rgba(34, 211, 238, 0.22);
            box-shadow: 0 12px 28px rgba(14, 165, 233, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.28);
          }
          .ai-panel-transition {
            transition: opacity 420ms cubic-bezier(0.22, 1, 0.36, 1), transform 420ms cubic-bezier(0.22, 1, 0.36, 1), filter 420ms cubic-bezier(0.22, 1, 0.36, 1);
            will-change: opacity, transform, filter;
          }
          .ai-analyzing-dot {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            background: radial-gradient(circle at 30% 30%, rgba(186, 230, 253, 0.98), rgba(14, 165, 233, 0.92) 56%, rgba(8, 47, 73, 0.9));
            box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.55), 0 0 18px rgba(34, 211, 238, 0.55);
            animation: analyzingPremium 1.4s cubic-bezier(0.22, 1, 0.36, 1) infinite;
            transition: opacity 220ms ease, transform 220ms ease;
          }
          .ai-analyzing-dot-soft {
            background: radial-gradient(circle at 30% 30%, rgba(224, 242, 254, 0.95), rgba(56, 189, 248, 0.68) 58%, rgba(8, 47, 73, 0.62));
            box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.28), 0 0 12px rgba(34, 211, 238, 0.26);
            animation-duration: 1.7s;
          }
          .ai-analyzing-dot-neon {
            background: radial-gradient(circle at 30% 30%, rgba(186, 230, 253, 0.98), rgba(14, 165, 233, 0.92) 56%, rgba(8, 47, 73, 0.9));
            box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.55), 0 0 18px rgba(34, 211, 238, 0.55);
            animation-duration: 1.4s;
          }
          .ai-analyzing-dot:nth-child(2) {
            animation-delay: 140ms;
          }
          .ai-analyzing-dot:nth-child(3) {
            animation-delay: 280ms;
          }
          @keyframes aiScan {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(100%); }
          }
          @keyframes aiBot {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-1px) rotate(-4deg); }
          }
          @keyframes aiPulse {
            0%, 100% { transform: scale(1); opacity: 0.9; }
            50% { transform: scale(1.35); opacity: 1; }
          }
          @keyframes aiBreath {
            0%, 100% { border-color: rgba(255,255,255,0.08); }
            50% { border-color: rgba(103,232,249,0.45); }
          }
          @keyframes aiIn {
            0% { opacity: 0; transform: translateY(4px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes aiStar {
            0%, 100% { transform: scale(0.94) rotate(0deg); opacity: 0.85; }
            50% { transform: scale(1.1) rotate(15deg); opacity: 1; }
          }
          @keyframes aiTyping {
            0%, 100% { opacity: 0.55; }
            50% { opacity: 1; }
          }
          @keyframes analyzingPulse {
            0%, 100% { transform: translateY(0) scale(1); opacity: 0.7; box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.35); }
            50% { transform: translateY(-1px) scale(1.15); opacity: 1; box-shadow: 0 0 0 6px rgba(14, 165, 233, 0); }
          }
          @keyframes analyzingPremium {
            0% {
              transform: translateY(0) scale(0.88);
              opacity: 0.38;
              filter: blur(0.2px);
              box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.45), 0 0 8px rgba(34, 211, 238, 0.2);
            }
            42% {
              transform: translateY(-1px) scale(1.12);
              opacity: 1;
              filter: blur(0);
              box-shadow: 0 0 0 10px rgba(14, 165, 233, 0), 0 0 24px rgba(34, 211, 238, 0.65);
            }
            100% {
              transform: translateY(0) scale(0.9);
              opacity: 0.42;
              filter: blur(0.2px);
              box-shadow: 0 0 0 0 rgba(14, 165, 233, 0), 0 0 10px rgba(34, 211, 238, 0.25);
            }
          }
          @keyframes orbMorph {
            0%, 100% { border-radius: 45% 55% 52% 48% / 48% 44% 56% 52%; transform: rotate(0deg) scale(1); }
            50% { border-radius: 58% 42% 47% 53% / 42% 58% 46% 54%; transform: rotate(8deg) scale(1.04); }
          }
          @keyframes orbPulse {
            0%, 100% { transform: scale(0.96); opacity: 0.5; }
            50% { transform: scale(1.08); opacity: 0.85; }
          }
          @keyframes matrixDrift {
            0% { transform: translateY(0px); }
            100% { transform: translateY(18px); }
          }
        `}</style>
      </div>
      </div>
    </Link>
  );
}
