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

function applyDarkWithOverlay(nextDark: boolean) {
  if (typeof document === "undefined") return;
  if (document.getElementById(OVERLAY_ID)) return;

  const color = nextDark ? "#09090b" : "#f5f5f7";

  const container = document.createElement("div");
  container.id = OVERLAY_ID;
  container.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:99999",
    "pointer-events:none",
    "overflow:hidden",
  ].join(";");

  const s1 = document.createElement("div");
  s1.style.cssText = [
    "position:absolute",
    "inset:0",
    `background:${color}`,
    "transition:transform 0.35s ease",
    "transform-origin:0 0",
    "transform:scale(0)",
    "clip-path:polygon(0 0,100% 0,0 100%)",
  ].join(";");

  const s2 = document.createElement("div");
  s2.style.cssText = [
    "position:absolute",
    "inset:0",
    `background:${color}`,
    "transition:transform 0.35s ease",
    "transform-origin:100% 100%",
    "transform:scale(0)",
    "clip-path:polygon(100% 100%,100% 0,0 100%)",
  ].join(";");

  container.appendChild(s1);
  container.appendChild(s2);
  document.body.appendChild(container);

  void container.offsetHeight;

  s1.style.transform = "scale(1)";
  s2.style.transform = "scale(1)";

  setTimeout(() => {
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem(STORAGE_KEY, String(nextDark));

    s1.style.transform = "scale(0)";
    s2.style.transform = "scale(0)";

    setTimeout(() => {
      container.remove();
    }, 400);
  }, 400);
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
