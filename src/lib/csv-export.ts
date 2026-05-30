type CsvColumn<T> = {
  key: keyof T | ((row: T) => string);
  label: string;
};

export function downloadCsv<T>(rows: T[], columns: CsvColumn<T>[], filename: string) {
  const header = columns.map(c => escapeCsvField(c.label)).join(";");
  const body = rows.map(row =>
    columns.map(col => {
      const value = typeof col.key === "function" ? col.key(row) : String(row[col.key] ?? "");
      return escapeCsvField(value);
    }).join(";")
  ).join("\r\n");

  const bom = "\uFEFF";
  const blob = new Blob([bom + header + "\r\n" + body], { type: "text/csv;charset=utf-8;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsvField(value: string): string {
  const str = String(value ?? "");
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
