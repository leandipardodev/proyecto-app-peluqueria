"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "klip_dark_mode";

function getDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function applyDark(dark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", dark);
}

export function useDarkMode() {
  const [dark, setDarkState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = getDarkMode();
    setDarkState(stored);
    applyDark(stored);
    setMounted(true);
  }, []);

  const setDark = useCallback((value: boolean) => {
    setDarkState(value);
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, String(value));
    applyDark(value);
  }, []);

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
  }, [dark, setDark]);

  return { dark, setDark, toggle, mounted };
}
