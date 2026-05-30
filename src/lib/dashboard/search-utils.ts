export function getIndustrySearchKeywords(industry: string) {
  const byIndustry: Record<string, Record<string, string[]>> = {
    peluqueria: {
      "nav-services": ["corte", "cortes", "brushing", "tintura", "alisado", "peinado"],
      "nav-staff": ["peluquero", "peluquera", "colorista"],
      "nav-customers": ["clienta", "clientas"],
    },
    barberia: {
      "nav-services": ["fade", "degrade", "barba", "perfilado", "navaja"],
      "nav-staff": ["barbero", "barbera"],
      "nav-customers": ["caballeros"],
    },
    estetica: {
      "nav-services": ["limpieza facial", "facial", "depilacion", "cejas", "pestañas", "pestanas"],
      "nav-staff": ["cosmiatra", "esteticista"],
      "nav-customers": ["paciente estetica"],
    },
    unas: {
      "nav-services": ["manicuria", "manicura", "pedicuria", "pedicura", "semipermanente", "kapping", "esculpidas"],
      "nav-staff": ["manicura", "nail artist"],
      "nav-customers": ["turno uñas", "turno unas"],
    },
    masajes: {
      "nav-services": ["masaje", "descontracturante", "relajante", "drenaje", "piedras calientes"],
      "nav-staff": ["masajista", "terapeuta corporal"],
      "nav-customers": ["paciente", "consultante"],
    },
    tattoo: {
      "nav-services": ["tatuaje", "tattoo", "flash", "sesion", "sesión", "retoque"],
      "nav-staff": ["tatuador", "tattoo artist"],
      "nav-customers": ["cliente tattoo"],
    },
    piercing: {
      "nav-services": ["piercing", "perforacion", "perforación", "labret", "septum", "helix"],
      "nav-staff": ["perforador", "piercer"],
      "nav-customers": ["curacion", "curación"],
    },
  };

  return byIndustry[industry] || {};
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function getAllowedDistance(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length);
  if (minLen <= 4) return 1;
  if (minLen <= 8) return 2;
  return 3;
}

export function scoreTokenMatch(token: string, termToken: string): number {
  if (!token || !termToken) return 0;
  if (termToken === token) return 140;
  if (termToken.startsWith(token)) return 120;
  if (termToken.includes(token)) return 95;
  if (token.startsWith(termToken) && termToken.length >= 3) return 84;
  const dist = levenshteinDistance(token, termToken);
  const allowed = getAllowedDistance(token, termToken);
  if (dist <= allowed) return Math.max(55, 86 - dist * 12);
  return 0;
}

export function scoreQueryAgainstTerms(query: string, terms: string[]): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 1;
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (queryTokens.length === 0) return 1;

  let best = 0;
  for (const rawTerm of terms) {
    const term = normalizeSearchText(rawTerm);
    if (!term) continue;
    if (term.includes(normalizedQuery)) best = Math.max(best, 130);
    const termTokens = term.split(" ").filter(Boolean);
    if (termTokens.length === 0) continue;
    let score = 0;
    let matchedTokens = 0;
    for (const token of queryTokens) {
      let tokenBest = 0;
      for (const t of termTokens) {
        tokenBest = Math.max(tokenBest, scoreTokenMatch(token, t));
        if (tokenBest >= 140) break;
      }
      if (tokenBest > 0) {
        score += tokenBest;
        matchedTokens += 1;
      }
    }
    if (matchedTokens === queryTokens.length) {
      score += 18 + matchedTokens * 2;
      best = Math.max(best, score);
    }
  }
  return best;
}

import type { OmniSearchResult } from "@/lib/dashboard/global-search-actions";

export function formatDataLabel(item: OmniSearchResult) {
  if (item.type === "stock") return item.nombre_producto;
  if (item.type === "service") return item.name;
  if (item.type === "customer") return item.nombre || item.telefono || "Persona";
  return item.name || item.email || "Miembro";
}

export function formatDataHint(item: OmniSearchResult) {
  if (item.type === "stock") return `Cantidad disponible: ${item.quantity}`;
  if (item.type === "service") return `Duracion: ${item.duration_minutes} min`;
  if (item.type === "customer") return `Telefono: ${item.telefono || "Sin telefono"}`;
  return `${item.role === "owner" ? "Administrador" : "Miembro"} - ${item.email || "Sin email"}`;
}
