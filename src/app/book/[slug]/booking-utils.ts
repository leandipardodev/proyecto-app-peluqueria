export type Service = { id: string; name: string; description?: string; price: number; duration_minutes: number; category: string | null; pay_at_shop: boolean };
export type StaffMember = { id: string; name: string; photo_url?: string | null; description?: string | null; instagram?: string | null; whatsapp?: string | null };
export type Slot = { start: string; end: string; time: string; staffIds: string[] };
export type Combo = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  total_duration: number;
  duration_minutes: number | null;
  services: { id: string; name: string; duration_minutes: number; price: number; pay_at_shop: boolean }[];
};

export const stepReveal = {
  initial: (dir: number) => ({ opacity: 0, x: 80 * dir }),
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 30,
      mass: 0.7,
      staggerChildren: 0.055,
      delayChildren: 0.03,
    },
  },
  exit: { opacity: 0, transition: { duration: 0.15, type: "tween" as const } as const, pointerEvents: "none" as const },
};

export const stepItemReveal = {
  initial: { opacity: 0, y: 10, scale: 0.97 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 200, damping: 28, mass: 0.6 },
  },
};

let lastHapticAt = 0;

export const triggerHaptic = (duration = 15, _target?: HTMLElement | null) => {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastHapticAt < 70) return;
  lastHapticAt = now;

  if (navigator.vibrate) {
    navigator.vibrate(duration);
  }
};

export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const DAY_NAMES = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

export function getWeekDates(): Date[] {
  const today = new Date();
  const dates: Date[] = [];
  for (let i = 0; i < 21; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

export function getMonthDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = firstDay.getDay();
  const days: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  return days;
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

export function parseHHmmToMinutes(value: string): number {
  const m = value.match(/(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function to24HourTimeLabel(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Math.max(0, Math.min(23, Number(hhmm[1])));
    const m = Math.max(0, Math.min(59, Number(hhmm[2])));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const ampm = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2] || "0");
    const period = ampm[3];
    if (period === "p" && hour !== 12) hour += 12;
    if (period === "a" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return value;
}

export function formatTimeFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

export const warmAudio = () => {
  getAudioCtx();
};

export const playSuccessSound = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;

    const pop = ctx.createOscillator();
    pop.type = "sine";
    pop.frequency.setValueAtTime(392, t0);
    pop.frequency.exponentialRampToValueAtTime(311, t0 + 0.09);
    const popGain = ctx.createGain();
    popGain.gain.setValueAtTime(0.0001, t0);
    popGain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.012);
    popGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
    pop.connect(popGain).connect(ctx.destination);
    pop.start(t0);
    pop.stop(t0 + 0.3);

    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3400;
    bp.Q.value = 1.4;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.055, t0 + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
    noise.connect(bp).connect(noiseGain).connect(ctx.destination);
    noise.start(t0);
    noise.stop(t0 + 0.06);

    const glint = ctx.createOscillator();
    glint.type = "sine";
    glint.frequency.setValueAtTime(587.33, t0 + 0.06);
    const gt = t0 + 0.06;
    const glintGain = ctx.createGain();
    glintGain.gain.setValueAtTime(0.0001, gt);
    glintGain.gain.exponentialRampToValueAtTime(0.065, gt + 0.014);
    glintGain.gain.exponentialRampToValueAtTime(0.0001, gt + 0.3);
    glint.connect(glintGain).connect(ctx.destination);
    glint.start(gt);
    glint.stop(gt + 0.34);
  } catch {
    // ignore
  }
};
