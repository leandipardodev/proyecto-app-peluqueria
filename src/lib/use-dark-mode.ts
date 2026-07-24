"use client";

import { useState, useEffect, useCallback } from "react";
import { haptic } from "@/lib/haptic";

const STORAGE_KEY = "klip_dark_mode";
const OVERLAY_ID = "klip-theme-overlay";

function getDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function applyDarkImmediate(dark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", dark);
}

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

function applyDarkWithOverlay(nextDark: boolean) {
  if (typeof document === "undefined") return;
  if (document.getElementById(OVERLAY_ID)) return;

  const color = nextDark ? "#111111" : "#f5f5f7";

  const container = document.createElement("div");
  container.id = OVERLAY_ID;
  container.style.cssText =
    "position:fixed;inset:0;z-index:99999;pointer-events:none;overflow:hidden";

  const s1 = document.createElement("div");
  s1.style.cssText =
    "position:absolute;inset:0;" + `background:${color};` + "transform-origin:0 0;clip-path:polygon(0 0,100% 0,0 100%)";

  const s2 = document.createElement("div");
  s2.style.cssText =
    "position:absolute;inset:0;" + `background:${color};` + "transform-origin:100% 100%;clip-path:polygon(100% 100%,100% 0,0 100%)";

  const logo = document.createElement("div");
  logo.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:0.02em;font-family:Inter,sans-serif;font-size:5rem;font-weight:700;letter-spacing:-0.03em;color:#0071E3";

  const letters = "Klip".split("").map((ch) => {
    const span = document.createElement("span");
    span.textContent = ch;
    span.style.cssText = "display:inline-block;opacity:0";
    logo.appendChild(span);
    return span;
  });

  container.appendChild(s1);
  container.appendChild(s2);
  container.appendChild(logo);
  document.body.appendChild(container);

  const BOUNCE = "cubic-bezier(0.34, 1.56, 0.64, 1)";
  const SMOOTH = "cubic-bezier(0.4, 0, 0.2, 1)";

  const close = s1.animate(
    [
      { transform: "scale(0)" },
      { transform: "scale(1.05)" },
    ],
    { duration: 400, easing: EASE, fill: "forwards" },
  );
  s2.animate(
    [
      { transform: "scale(0)" },
      { transform: "scale(1.05)" },
    ],
    { duration: 400, easing: EASE, fill: "forwards" },
  );

  close.onfinish = () => {
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem(STORAGE_KEY, String(nextDark));

    const letterAnims = letters.map((el, i) => {
      const anim = el.animate(
        [
          { opacity: 0, transform: "translateY(40px) scale(0.5)", filter: "blur(8px)" },
          { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0px)" },
        ],
        { duration: 450, easing: BOUNCE, delay: i * 80, fill: "forwards" },
      );
      return anim;
    });

    letterAnims[letterAnims.length - 1].onfinish = () => {
      logo.animate(
        [
          { filter: "drop-shadow(0 0 0px #0071E3)" },
          { filter: "drop-shadow(0 0 18px #0071E3)" },
          { filter: "drop-shadow(0 0 0px #0071E3)" },
        ],
        { duration: 600, easing: "ease-in-out" },
      );

      setTimeout(() => {
        const exitAnims = letters.map((el, i) => {
          const mid = (letters.length - 1) / 2;
          const distFromCenter = Math.abs(i - mid);
          return el.animate(
            [
              { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0px)" },
              { opacity: 0, transform: `translateY(-60px) scale(0.6)`, filter: "blur(10px)" },
            ],
            { duration: 350, easing: SMOOTH, delay: distFromCenter * 60, fill: "forwards" },
          );
        });

        exitAnims[exitAnims.length - 1].onfinish = () => {
          const open = s1.animate(
            [
              { transform: "scale(1.05)" },
              { transform: "scale(0)" },
            ],
            { duration: 400, easing: EASE, fill: "forwards" },
          );
          s2.animate(
            [
              { transform: "scale(1.05)" },
              { transform: "scale(0)" },
            ],
            { duration: 400, easing: EASE, fill: "forwards" },
          );

          open.onfinish = () => {
            container.remove();
          };
        };
      }, 800);
    };
  };
}

export function useDarkMode() {
  const [dark, setDarkState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = getDarkMode();
    setDarkState(stored);
    applyDarkImmediate(stored);
    setMounted(true);
  }, []);

  const setDark = useCallback((value: boolean) => {
    setDarkState(value);
    applyDarkWithOverlay(value);
  }, []);

  const toggle = useCallback(() => {
    haptic(10);
    const next = !dark;
    setDarkState(next);
    applyDarkWithOverlay(next);
  }, [dark]);

  return { dark, setDark, toggle, mounted };
}
