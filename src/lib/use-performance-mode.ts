"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "klip-performance-mode";
const PERF_EVENT = "klip-performance-mode-change";

export function isVeryPowerfulDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cores = window.navigator.hardwareConcurrency || 4;
    const memory = (window.navigator as any).deviceMemory || 4;
    // Devices with 8+ CPU cores and 8GB+ RAM are highly powerful
    return cores >= 8 && memory >= 8;
  } catch (e) {
    return false;
  }
}

export function readStored(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    return stored === "true";
  }
  // Default to low-performance (performanceMode = true) unless it's a very powerful device
  return !isVeryPowerfulDevice();
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
      window.dispatchEvent(new CustomEvent(PERF_EVENT, { detail: value }));
    }
  }, []);

  const togglePerformanceMode = useCallback(() => {
    setPerformanceMode(!performanceMode);
  }, [performanceMode, setPerformanceMode]);

  return { performanceMode, setPerformanceMode, togglePerformanceMode, mounted };
}

export function getPerformanceModeStorageKey() {
  return STORAGE_KEY;
}

export function getPerformanceModeEventName() {
  return PERF_EVENT;
}
