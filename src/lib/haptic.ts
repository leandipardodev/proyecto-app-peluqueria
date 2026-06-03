let lastHapticAt = 0;

export function haptic(duration = 8) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastHapticAt < 100) return;
  lastHapticAt = now;
  try {
    navigator.vibrate(duration);
  } catch {}
}
