"use client";

import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/lib/auth-context";
import { getPerformanceModeEventName, getPerformanceModeStorageKey } from "@/lib/use-performance-mode";
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

function PerformanceModeProvider({ children }: { children: ReactNode }) {
  const [performanceMode, setPerformanceMode] = useState(false);

  useEffect(() => {
    const storageKey = getPerformanceModeStorageKey();
    const eventName = getPerformanceModeEventName();

    const syncPerformanceMode = () => {
      const value = window.localStorage.getItem(storageKey) === "true";
      setPerformanceMode(value);
      document.documentElement.classList.toggle("perf-mode", value);
    };

    syncPerformanceMode();

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== storageKey) return;
      syncPerformanceMode();
    };

    const handlePerfEvent = () => {
      syncPerformanceMode();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(eventName, handlePerfEvent as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(eventName, handlePerfEvent as EventListener);
    };
  }, []);

  return (
    <MotionConfig reducedMotion={performanceMode ? "always" : "never"}>
      {children}
    </MotionConfig>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    document.body.classList.toggle("ios-standalone", isIOS && isStandalone);
    document.body.classList.toggle("android-standalone", isAndroid && isStandalone);
  }, []);

  useEffect(() => {
    function preventNumberWheel(e: WheelEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target instanceof HTMLInputElement && target.type === "number") {
        e.preventDefault();
      }
    }

    document.addEventListener("wheel", preventNumberWheel, { passive: false });
    return () => document.removeEventListener("wheel", preventNumberWheel);
  }, []);

  return (
    <AuthProvider>
      <PerformanceModeProvider>
        <ToastProvider>{children}</ToastProvider>
      </PerformanceModeProvider>
    </AuthProvider>
  );
}
