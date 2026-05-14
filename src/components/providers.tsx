"use client";

import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/lib/auth-context";
import type { ReactNode } from "react";
import { useEffect } from "react";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    document.body.classList.toggle("ios-standalone", isIOS && isStandalone);
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
