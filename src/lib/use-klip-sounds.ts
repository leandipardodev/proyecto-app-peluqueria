"use client";

import { playSound } from "@/lib/sound";

export function useKlipSounds() {
  const playClick = () => playSound("click", 0.3);
  const playSuccess = () => playSound("success", 0.5);
  const playError = () => playSound("error", 0.4);
  const playNotification = () => playSound("notification", 0.45);
  const playSearchExpand = () => playSound("search", 0.3);

  return {
    playClick,
    playSuccess,
    playError,
    playNotification,
    playSearchExpand,
  };
}
