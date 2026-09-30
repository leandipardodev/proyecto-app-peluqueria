/**
 * True cuando Postgres rechaza la escritura por una EXCLUDE constraint.
 *
 * SQLSTATE 23P01 (exclusion_violation) es lo que devuelve la constraint
 * `no_overlap_appointments_confirmed` de la migracion 109 cuando dos turnos
 * confirmed del mismo local y profesional se solapan.
 *
 * Los chequeos de conflicto que hay en el booking son check-then-insert en dos
 * viajes separados: dos requests concurrentes para el mismo horario pasan los
 * dos chequeos y los dos insertan. La constraint es la que cierra esa ventana.
 * Como el error le llega crudo al usuario, hay que traducirlo a la misma
 * respuesta que ya usan los chequeos para que la UI no cambie.
 */
export function isOverlapViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "23P01") return true;

  // Algunos caminos solo exponen el mensaje (por ejemplo un error REST crudo).
  const message = (error as { message?: string }).message;
  return typeof message === "string" && message.includes("no_overlap_appointments_confirmed");
}
