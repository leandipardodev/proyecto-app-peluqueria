export type SoundKey = "click" | "success" | "notification" | "error" | "search";

const MUTE_STORAGE_KEY = "klip_sound_muted";

let audioContext: AudioContext | null = null;
let lastVibrateAt = 0;

function canUseBrowserApis(): boolean {
  return typeof window !== "undefined";
}

function readMutedFlag(): boolean {
  if (!canUseBrowserApis()) return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getAudioContext(): AudioContext | null {
  if (!canUseBrowserApis()) return null;
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) {
    audioContext = new Ctx();
  }
  return audioContext;
}

function waveformFor(kind: SoundKey): OscillatorType {
  if (kind === "error") return "sawtooth";
  if (kind === "notification") return "triangle";
  return "sine";
}

function notesFor(kind: SoundKey): number[] {
  if (kind === "success") return [880, 1175];
  if (kind === "error") return [220, 170];
  if (kind === "notification") return [740, 980];
  if (kind === "search") return [510, 680];
  return [640];
}

function hapticPatternFor(kind: SoundKey): number | number[] {
  if (kind === "success") return [12, 20, 12];
  if (kind === "error") return [30, 30, 30];
  if (kind === "notification") return [18, 26, 18];
  if (kind === "search") return 10;
  return 8;
}

function triggerHaptic(kind: SoundKey): void {
  if (!canUseBrowserApis() || !("vibrate" in navigator)) return;
  const now = Date.now();
  if (now - lastVibrateAt < 70) return;
  lastVibrateAt = now;
  navigator.vibrate(hapticPatternFor(kind));
}

export function isMuted(): boolean {
  return readMutedFlag();
}

export function setMuted(muted: boolean): void {
  if (!canUseBrowserApis()) return;
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
  } catch {}
}

export function playSound(kind: SoundKey, volume = 0.45): void {
  if (!canUseBrowserApis() || isMuted()) return;

  triggerHaptic(kind);

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const safeVolume = Math.max(0, Math.min(1, volume));
  const notes = notesFor(kind);
  const startAt = ctx.currentTime;
  const totalDuration = Math.max(0.07, notes.length * 0.06 + 0.03);

  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, safeVolume * 0.12), startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + totalDuration);

  notes.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    osc.type = waveformFor(kind);
    osc.frequency.setValueAtTime(freq, startAt + index * 0.06);
    osc.connect(gain);
    const oscStart = startAt + index * 0.06;
    const oscEnd = oscStart + 0.08;
    osc.start(oscStart);
    osc.stop(oscEnd);
  });

  const cleanupAtMs = Math.ceil((totalDuration + 0.08) * 1000);
  window.setTimeout(() => {
    try {
      gain.disconnect();
    } catch {}
  }, cleanupAtMs);
}

export function playPop(): void {
  playSound("success");
}

export function playPing(): void {
  playSound("notification");
}
