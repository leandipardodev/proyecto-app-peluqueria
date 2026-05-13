"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "klip-performance-mode";

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function usePerformanceMode() {
  const [performanceMode, setPerformanceModeState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const value = readStored();
    setPerformanceModeState(value);
    document.documentElement.classList.toggle("perf-mode", value);
    setMounted(true);
  }, []);

  const setPerformanceMode = useCallback((value: boolean) => {
    setPerformanceModeState(value);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(value));
      document.documentElement.classList.toggle("perf-mode", value);
    }
  }, []);

  const togglePerformanceMode = useCallback(() => {
    setPerformanceMode(!performanceMode);
  }, [performanceMode, setPerformanceMode]);

  return { performanceMode, setPerformanceMode, togglePerformanceMode, mounted };
}
