export function formatARS(value: number): string {
  return "$" + value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
