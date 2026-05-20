export type SoundKey = "click" | "success" | "notification" | "error" | "search";

export function isMuted(): boolean {
  return true;
}

export function setMuted(muted: boolean): void {
  void muted;
}

export function playSound(kind: SoundKey, volume = 0.45): void {
  void kind;
  void volume;
}

export function playPop(): void {
  playSound("success");
}

export function playPing(): void {
  playSound("notification");
}
