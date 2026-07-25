"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import BaseModal from "@/components/ui/modal";

type Device = "ios" | "android" | "desktop";

const GUIDE_FILES: Record<Device, string> = {
  ios: "/guia-ios.svg",
  android: "/guia-android.svg",
  desktop: "/guia-windows.svg",
};

const GUIDE_LABELS: Record<Device, string> = {
  ios: "Guía para iPhone / iPad",
  android: "Guía para Android",
  desktop: "Guía para Windows PC",
};

function detectDevice(): Device {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export default function GuideModal() {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");

  useEffect(() => {
    setDevice(detectDevice());
  }, []);

  useEffect(() => {
    function handleOpen() {
      setDevice(detectDevice());
      setOpen(true);
    }
    window.addEventListener("dashboard:open-guide", handleOpen as EventListener);
    return () => window.removeEventListener("dashboard:open-guide", handleOpen as EventListener);
  }, []);

  return (
    <BaseModal
      open={open}
      onClose={() => setOpen(false)}
      title="Instalar Klip"
      subtitle={GUIDE_LABELS[device]}
      icon={<Download className="h-5 w-5 text-[#0071E3]" />}
      maxWidth="lg"
    >
      <div className="px-5 pb-5">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-50 dark:bg-zinc-800/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={GUIDE_FILES[device]}
            alt={GUIDE_LABELS[device]}
            className="w-full h-auto"
          />
        </div>
      </div>
    </BaseModal>
  );
}

export function openGuideModal() {
  window.dispatchEvent(new CustomEvent("dashboard:open-guide"));
}
