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

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:99999",
    `background-color:${nextDark ? "#09090b" : "#f5f5f7"}`,
    "opacity:0",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(overlay);

  void overlay.offsetHeight;
  overlay.style.transition = "opacity 0.15s ease";
  overlay.style.opacity = "1";

  setTimeout(() => {
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem(STORAGE_KEY, String(nextDark));

    setTimeout(() => {
      overlay.style.transition = "opacity 0.35s ease";
      overlay.style.opacity = "0";

      setTimeout(() => {
        overlay.remove();
      }, 380);
    }, 100);
  }, 300);
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
