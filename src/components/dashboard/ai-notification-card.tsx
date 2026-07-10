"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Sparkles } from "lucide-react";

type Message = {
  id: string;
  title: string;
  body: string;
  tone: "urgent" | "action" | "insight";
  href?: string;
};

export default function AINotificationCard({
  messages,
}: {
  messages: Message[];
}) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [thinking, setThinking] = useState(true);
  const [pwaTip, setPwaTip] = useState<Message | null>(null);
  const [poweredOn, setPoweredOn] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("klip-ai-powered");
    if (stored === "false") setPoweredOn(false);
  }, []);

  useEffect(() => {
    localStorage.setItem("klip-ai-powered", String(poweredOn));
  }, [poweredOn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;
    if (isStandalone) return;

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);

    if (isIOS) {
      setPwaTip({
        id: "pwa-ios",
        title: "Instalá Klip en tu iPhone",
        body: "Compartir → «Agregar a pantalla de inicio» → «Agregar».",
        tone: "insight",
      });
    } else if (isAndroid) {
      setPwaTip({
        id: "pwa-android",
        title: "Instalá Klip en tu Android",
        body: "⋮ → «Instalar aplicación».",
        tone: "insight",
      });
    } else {
      setPwaTip({
        id: "pwa-desktop",
        title: "Instalá Klip en tu PC",
        body: "Clic al ícono de instalar ⬇ en la barra de direcciones.",
        tone: "insight",
      });
    }
  }, []);

  const titleRef = useRef<HTMLParagraphElement>(null);
  const titleWrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const bodyWrapRef = useRef<HTMLDivElement>(null);
  const [titleOverflow, setTitleOverflow] = useState(0);
  const [bodyOverflow, setBodyOverflow] = useState(0);

  const feed = useMemo(
    () => {
      const base = messages.length > 0 ? messages.slice(0, 20) : [{ id: "fallback", title: "Todo en orden", body: "Sin novedades urgentes.", tone: "insight" as const, href: undefined }];
      return pwaTip ? [pwaTip, ...base] : base;
    },
    [messages, pwaTip]
  );

  const handleClick = useCallback(() => {
    const target = feed[activeIndex]?.href;
    if (target) router.push(target);
  }, [feed, activeIndex, router]);

  function handleTogglePower(e: React.MouseEvent) {
    e.stopPropagation();
    setPoweredOn((v) => !v);
  }

  useEffect(() => {
    setActiveIndex(0);
  }, [feed.length]);

  useEffect(() => {
    if (!poweredOn) return;
    let cancelled = false;
    const initial: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (!cancelled) setThinking(false);
    }, 550);
    let delay: ReturnType<typeof setTimeout>;
    let inner: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      delay = setTimeout(() => {
        if (cancelled) return;
        setThinking(true);
        inner = setTimeout(() => {
          if (cancelled) return;
          setActiveIndex((prev) => (prev + 1) % feed.length);
          setThinking(false);
          scheduleNext();
        }, 3000);
      }, 20000);
    }

    scheduleNext();

    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearTimeout(delay);
      clearTimeout(inner);
    };
  }, [feed.length, poweredOn]);

  const active = feed[poweredOn ? activeIndex : 0];
  const toneClass =
    active.tone === "urgent"
      ? "border-rose-300/50 bg-rose-300/10 text-rose-900 dark:text-rose-100"
      : active.tone === "action"
        ? "border-amber-300/50 bg-amber-300/10 text-amber-900 dark:text-amber-100"
        : "border-cyan-300/50 bg-cyan-300/10 text-cyan-900 dark:text-cyan-100";
  const toneLabel = active.tone === "urgent" ? "Urgente" : active.tone === "action" ? "Accion" : "Insight";

  useEffect(() => {
    const tw = titleWrapRef.current;
    const te = titleRef.current;
    if (tw && te) {
      setTitleOverflow(Math.max(0, te.scrollWidth - tw.clientWidth));
    }
    const bw = bodyWrapRef.current;
    const be = bodyRef.current;
    if (bw && be) {
      setBodyOverflow(Math.max(0, be.scrollHeight - bw.clientHeight));
    }
  }, [active.title, active.body]);

  return (
    <button type="button" onClick={handleClick} className="group block h-full w-full text-left">
      <div className="relative h-[148px] md:h-[156px]">
        <div className="absolute inset-0 rounded-[2rem] rounded-tr-none rounded-bl-none" />
        <div className={`ai-orb-wrap relative h-full overflow-hidden rounded-[2rem] rounded-tr-none rounded-bl-none border bg-white p-4 text-cyan-950 transition-all duration-300 ${poweredOn ? "border-cyan-300/30 shadow-[0_20px_48px_rgba(8,145,178,0.28)] dark:bg-zinc-900 dark:text-cyan-50 ai-on group-hover:-translate-y-0.5" : "border-zinc-200/60 shadow-none dark:bg-zinc-900/80 dark:text-zinc-400 ai-paused"}`}>
          {poweredOn && (
            <>
              <div className="pointer-events-none absolute inset-0 ai-mode-layer ai-mode-orb bg-[radial-gradient(circle_at_22%_24%,rgba(6,182,212,0.22),transparent_42%),radial-gradient(circle_at_80%_16%,rgba(37,99,235,0.20),transparent_40%),radial-gradient(circle_at_45%_88%,rgba(14,165,233,0.16),transparent_44%)] dark:bg-[radial-gradient(circle_at_22%_24%,rgba(34,211,238,0.2),transparent_36%),radial-gradient(circle_at_80%_16%,rgba(96,165,250,0.18),transparent_34%)]" />
              <div className="pointer-events-none absolute inset-0 ai-mode-layer ai-mode-matrix">
                <div className="ai-matrix-grid h-full w-full" />
              </div>
              <div className="pointer-events-none absolute inset-0 ai-scan" />
            </>
          )}
          {!poweredOn && <div className="pointer-events-none absolute inset-0 bg-zinc-200/50 dark:bg-zinc-800/40 rounded-[inherit]" />}
          <div className={`pointer-events-none absolute inset-[1px] rounded-[1.95rem] rounded-tr-none rounded-bl-none border ${poweredOn ? "border-cyan-300/30 dark:border-cyan-200/12" : "border-zinc-200/40 dark:border-zinc-700/30"}`} />
          {poweredOn && (
            <div
              className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-500 ${
                thinking ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden={!thinking}
            >
              <div className="ai-analyzing" aria-hidden="true">
                <span className="ai-analyzing-dot" />
                <span className="ai-analyzing-dot" />
                <span className="ai-analyzing-dot" />
              </div>
            </div>
          )}

          <div className="relative z-10 flex items-center justify-between">
            <p className={`text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center gap-1.5 ${poweredOn ? "text-cyan-700 dark:text-cyan-200" : "text-zinc-400 dark:text-zinc-500"}`}>
              <Bot className={`h-3.5 w-3.5 ${poweredOn ? "ai-bot" : ""}`} />
              Klipo IA
            </p>
            <span
              onClick={handleTogglePower}
              className={`inline-flex items-center gap-2 text-[11px] cursor-pointer select-none ${poweredOn ? "text-cyan-700 dark:text-cyan-200" : "text-zinc-400 dark:text-zinc-500"}`}
            >
              <span className={`h-2 w-2 rounded-full ${poweredOn ? "bg-emerald-300 ai-pulse" : "bg-red-400"}`} />
              {poweredOn ? "Activa" : "Apagada"}
            </span>
          </div>

          <div className={`relative z-10 mt-2 flex h-[84px] items-start gap-3 ${poweredOn ? "" : "opacity-60"}`}>
              <div className="relative mt-0.5 h-12 w-12 shrink-0">
                {poweredOn && (
                  <>
                    <div className="ai-orb absolute inset-0 rounded-full" />
                    <div className="ai-orb-glow absolute inset-[-8px] rounded-full" />
                  </>
                )}
                {!poweredOn && <div className="absolute inset-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className={`h-5 w-5 ${poweredOn ? "text-cyan-700 ai-star dark:text-cyan-100" : "text-zinc-400 dark:text-zinc-500"}`} />
                </div>
              </div>

              <div className="relative min-w-0 flex-1 h-full">
                {poweredOn && (
                  <div
                    className={`absolute inset-0 px-3 py-2.5 flex items-center justify-center ai-panel-transition ${
                      thinking ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden={!thinking}
                  >
                    <div className="h-full w-full" />
                  </div>
                )}

                <div
                  className={`absolute inset-0 h-full rounded-xl border px-3 py-2.5 ${poweredOn ? `${toneClass} ai-msg ai-panel-transition` : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200/60 dark:border-zinc-700/40 text-zinc-400 dark:text-zinc-500"} ${
                    poweredOn && thinking ? "opacity-0" : "opacity-100"
                  }`}
                  aria-hidden={poweredOn && thinking}
                >
                  {poweredOn ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div ref={titleWrapRef} className="min-w-0 flex-1 overflow-hidden">
                          <p
                            ref={titleRef}
                            className={`text-xs font-semibold ${titleOverflow > 0 ? "inline-block whitespace-nowrap" : "truncate"}`}
                            style={titleOverflow > 0 ? ({ "--dx": `${-titleOverflow}px`, animation: `marquee-x ${6 + titleOverflow * 0.008}s ease-in-out infinite` } as React.CSSProperties) : undefined}
                          >
                            {active.title}
                          </p>
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.12em] opacity-90 shrink-0">{toneLabel}</span>
                      </div>
                      <div ref={bodyWrapRef} className="mt-1 overflow-hidden" style={bodyOverflow > 0 ? { height: "calc(100% - 22px)" } : {}}>
                        <p
                          ref={bodyRef}
                          className="text-[11px] opacity-95"
                          style={bodyOverflow > 0 ? ({ "--dy": `${-bodyOverflow}px`, animation: `marquee-y ${8 + bodyOverflow * 0.004}s ease-in-out infinite` } as React.CSSProperties) : undefined}
                        >
                          {active.body}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Klipo IA está detenida</p>
                    </div>
                  )}
                </div>

            </div>
          </div>

          <style jsx>{`
          .ai-orb-wrap {
            transform: perspective(1200px) rotateX(2deg);
          }
          .ai-paused .ai-orb,
          .ai-paused .ai-orb-glow,
          .ai-paused .ai-matrix-grid,
          .ai-paused .ai-scan,
          .ai-paused .ai-mode-layer,
          .ai-paused .ai-msg {
            animation-play-state: paused !important;
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
            animation: crossfadeA 24s infinite;
          }
          .ai-mode-matrix {
            animation: crossfadeB 24s infinite;
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
          .ai-analyzing {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-radius: 999px;
            backdrop-filter: blur(6px);
            background: linear-gradient(135deg, rgba(14,165,233,0.07), rgba(6,182,212,0.1));
            border: 1px solid rgba(34, 211, 238, 0.16);
            box-shadow: 0 8px 20px rgba(14, 165, 233, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.22);
            animation: analyzingWrap 28s infinite;
            transition: background 360ms ease, border-color 360ms ease, box-shadow 360ms ease;
          }
          .ai-panel-transition {
            transition: opacity 420ms cubic-bezier(0.22, 1, 0.36, 1), transform 420ms cubic-bezier(0.22, 1, 0.36, 1), filter 420ms cubic-bezier(0.22, 1, 0.36, 1);
            will-change: opacity, transform, filter;
          }
          .ai-analyzing-dot {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            background: radial-gradient(circle at 30% 30%, rgba(224, 242, 254, 0.95), rgba(56, 189, 248, 0.68) 58%, rgba(8, 47, 73, 0.62));
            box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.28), 0 0 12px rgba(34, 211, 238, 0.26);
            animation: dotBounce 1.7s cubic-bezier(0.22, 1, 0.36, 1) infinite;
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
          @keyframes aiStar {
            0%, 100% { transform: scale(0.94) rotate(0deg); opacity: 0.85; }
            50% { transform: scale(1.1) rotate(15deg); opacity: 1; }
          }
          @keyframes crossfadeA {
            0%, 45% { opacity: 1; filter: blur(0); }
            50%, 95% { opacity: 0; filter: blur(4px); }
            100% { opacity: 1; filter: blur(0); }
          }
          @keyframes crossfadeB {
            0%, 45% { opacity: 0; filter: blur(4px); }
            50%, 95% { opacity: 1; filter: blur(0); }
            100% { opacity: 0; filter: blur(4px); }
          }
          @keyframes analyzingWrap {
            0%, 42% {
              background: linear-gradient(135deg, rgba(14,165,233,0.07), rgba(6,182,212,0.1));
              border: 1px solid rgba(34, 211, 238, 0.16);
              box-shadow: 0 8px 20px rgba(14, 165, 233, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.22);
            }
            46%, 88% {
              background: linear-gradient(135deg, rgba(14,165,233,0.08), rgba(6,182,212,0.14));
              border: 1px solid rgba(34, 211, 238, 0.22);
              box-shadow: 0 12px 28px rgba(14, 165, 233, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.28);
            }
            92%, 100% {
              background: linear-gradient(135deg, rgba(14,165,233,0.07), rgba(6,182,212,0.1));
              border: 1px solid rgba(34, 211, 238, 0.16);
              box-shadow: 0 8px 20px rgba(14, 165, 233, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.22);
            }
          }
          @keyframes dotBounce {
            0% {
              transform: translateY(0) scale(0.88);
              opacity: 0.38;
              filter: blur(0.2px);
            }
            42% {
              transform: translateY(-1px) scale(1.12);
              opacity: 1;
              filter: blur(0);
            }
            100% {
              transform: translateY(0) scale(0.9);
              opacity: 0.42;
              filter: blur(0.2px);
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
          @keyframes marquee-x {
            0%, 5% { transform: translateX(0); }
            45%, 50% { transform: translateX(var(--dx)); }
            95%, 100% { transform: translateX(0); }
          }
          @keyframes marquee-y {
            0%, 5% { transform: translateY(0); }
            45%, 50% { transform: translateY(var(--dy)); }
            95%, 100% { transform: translateY(0); }
          }
        `}</style>
      </div>
      </div>
    </button>
  );
}
