"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneByMedia = window.matchMedia("(display-mode: standalone)").matches;
  const standaloneByNavigator = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneByMedia || standaloneByNavigator;
}

export default function PwaInstallButton() {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIosFallbackVisible, setIsIosFallbackVisible] = useState(false);

  useEffect(() => {
    const standalone = isRunningStandalone();
    setIsInstalled(standalone);
    if (standalone) localStorage.setItem("klip-pwa-installed", "true");

    const ua = typeof window !== "undefined" ? window.navigator.userAgent : "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    setIsIosFallbackVisible(isIOS && isSafari && !isRunningStandalone());

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
      setIsInstalled(isRunningStandalone());
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPromptEvent(null);
      setIsIosFallbackVisible(false);
      localStorage.setItem("klip-pwa-installed", "true");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      setInstallPromptEvent(null);
      localStorage.setItem("klip-pwa-installed", "true");
    }
  }

  if (isIosFallbackVisible && !isInstalled) {
    return (
      <div className="pt-2">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
          Para instalar Klip en iPhone: toca <strong>Compartir</strong> en Safari y luego <strong>Agregar a pantalla de inicio</strong>.
        </div>
      </div>
    );
  }

  if (isInstalled || !installPromptEvent) return null;

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={handleInstallClick}
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-5 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
      >
        <Download className="w-4 h-4" />
        Instalar Klip en este dispositivo
      </button>
    </div>
  );
}
