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
  const [isInstalled, setIsInstalled] = useState(true);

  useEffect(() => {
    setIsInstalled(isRunningStandalone());

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
      setIsInstalled(isRunningStandalone());
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPromptEvent(null);
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
    }
  }

  if (isInstalled || !installPromptEvent) return null;

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={handleInstallClick}
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 dark:border-white/10 bg-white/35 dark:bg-white/[0.06] backdrop-blur-xl px-5 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-white/55 dark:hover:bg-white/[0.12] transition-colors"
      >
        <Download className="w-4 h-4" />
        Instalar Klip en este dispositivo
      </button>
    </div>
  );
}
