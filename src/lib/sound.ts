const STORAGE_KEY = "klip_muted";

export type SoundKey = "click" | "success" | "notification" | "error" | "search";

const SOUND_SRC: Record<SoundKey, string> = {
  click: "/sounds/nav_click.mp3",
  success: "/sounds/action_success.mp3",
  notification: "/sounds/notification_chime.mp3",
  error: "/sounds/warning_thud.mp3",
  search: "/sounds/search_expand.mp3",
};

const DEFAULT_VOLUME = 0.45;

export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(muted));
}

function createAudio(src: string, volume = DEFAULT_VOLUME): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  const audio = new Audio(src);
  audio.volume = volume;
  (audio as HTMLAudioElement & { preservesPitch?: boolean; mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean }).preservesPitch = false;
  (audio as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = false;
  (audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false;
  return audio;
}

export function playSound(kind: SoundKey, volume = DEFAULT_VOLUME): void {
  if (isMuted()) return;
  const audio = createAudio(SOUND_SRC[kind], volume);
  if (!audio) return;
  void audio.play().catch(() => {});
}

export function playPop(): void {
  playSound("success");
}

export function playPing(): void {
  playSound("notification");
}
