"use client";

import { useCallback } from "react";
import { playSound } from "@/lib/sound";

export function useKlipSounds() {
  const playClick = useCallback(() => playSound("click", 0.3), []);
  const playSuccess = useCallback(() => playSound("success", 0.5), []);
  const playError = useCallback(() => playSound("error", 0.4), []);
  const playNotification = useCallback(() => playSound("notification", 0.45), []);
  const playSearchExpand = useCallback(() => playSound("search", 0.3), []);

  return {
    playClick,
    playSuccess,
    playError,
    playNotification,
    playSearchExpand,
  };
}
