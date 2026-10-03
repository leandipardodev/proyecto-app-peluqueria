/**
 * Normaliza un rango de fechas para que `from <= to` siempre.
 *
 * La pagina de Caja/Finanzas tiene dos campos de fecha y el effect de carga
 * dispara con cada cambio de cualquiera de los dos. Antes cada input escribia su
 * propio estado, asi que se podia dejar `from > to`, la consulta salia vacia, y
 * el boton "Filtrar" que existia para eso no corrigia nada util: pasaba los
 * valores ya normalizados, con lo cual no cambiaba el estado y no recargaba.
 *
 * Con un solo estado y esta funcion, el rango invertido no llega a existir.
 */
export function normalizeRange(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}