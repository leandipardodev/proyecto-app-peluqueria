import { extractArgentinaTimeHHmm, getArgentinaDateKey } from "@/lib/argentina-time";

/** 0 = domingo, en el mismo orden que Date#getUTCDay. */
const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

export type DemandaRow = {
  start_time?: string | null;
  /** Fecha civil ya resuelta en ART. Es la columna que tiene indice para esto. */
  date_key_ar?: string | null;
  service_id?: string | null;
  services?: { name?: string | null } | { name?: string | null }[] | null;
};

export type DemandaBucket = { name: string; count: number };

export type DemandaBuckets = {
  topServicios: DemandaBucket[];
  topDias: DemandaBucket[];
  topHorarios: DemandaBucket[];
  busiestDay: DemandaBucket | null;
  busiestHour: DemandaBucket | null;
};

/**
 * Dia de la semana (0 = domingo) a partir de un date key "YYYY-MM-DD".
 *
 * Se parsea como medianoche UTC a proposito: un "YYYY-MM-DD" es un dia civil, no
 * un instante, y de esa forma el resultado no depende del offset del runtime.
 */
export function weekdayFromDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function topN(counts: Map<string, number>, limit: number, label: (key: string) => string): DemandaBucket[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ name: label(key), count }));
}

function busiest(counts: Map<string, number>, label: (key: string) => string): DemandaBucket | null {
  let best: DemandaBucket | null = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count) best = { name: label(key), count };
  }
  return best;
}

/**
 * Arma los tres slides de la tarjeta Demanda.
 *
 * `start_time` es timestamptz, asi que leerlo con getUTCHours()/getUTCDay() da
 * hora y dia UTC: un turno de 18:00 ART seellia 21:00 y, si es de 21 a 23:59,
 * caia en el dia siguiente. Por eso el dia se saca de date_key_ar (con fallback
 * al date key argentino del instante) y la hora de extractArgentinaTimeHHmm.
 *
 * Los tres slides usan la misma fila base a proposito: antes Servicios contaba
 * solo los completados y pagados mientras Dias y Horarios contaban todos los
 * completados, con lo cual los totales no cerraban entre slides del mismo carousel.
 */
export function buildDemandaBuckets(rows: DemandaRow[] | null | undefined, limit = 5): DemandaBuckets {
  const dayCounts = new Map<string, number>();
  const hourCounts = new Map<string, number>();
  const serviceCounts = new Map<string, { name: string; count: number }>();

  for (const row of rows ?? []) {
    if (!row?.start_time) continue;

    const dateKey = typeof row.date_key_ar === "string" && row.date_key_ar
      ? row.date_key_ar
      : getArgentinaDateKey(row.start_time);
    const dayName = DAY_NAMES[weekdayFromDateKey(dateKey)] ?? DAY_NAMES[0];
    dayCounts.set(dayName, (dayCounts.get(dayName) ?? 0) + 1);

    const hour = extractArgentinaTimeHHmm(row.start_time).slice(0, 2);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);

    const svc = Array.isArray(row.services) ? row.services[0] : row.services;
    const serviceName = svc?.name;
    if (serviceName) {
      const key = row.service_id ?? serviceName;
      const entry = serviceCounts.get(key) ?? { name: serviceName, count: 0 };
      entry.count++;
      serviceCounts.set(key, entry);
    }
  }

  const hourLabel = (hour: string) => `${hour}:00`;
  const topServicios = [...serviceCounts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);

  return {
    topServicios,
    topDias: topN(dayCounts, limit, (key) => key),
    topHorarios: topN(hourCounts, limit, hourLabel),
    busiestDay: busiest(dayCounts, (key) => key),
    busiestHour: busiest(hourCounts, hourLabel),
  };
}
