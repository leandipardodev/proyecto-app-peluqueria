"use client";

import { useRef, useState, useMemo } from "react";
import { Download, ChevronDown, Users, Package, Calendar, DollarSign, Users2 } from "lucide-react";
import { downloadCsv } from "@/lib/csv-export";
import {
  fetchExportCustomers,
  fetchExportStock,
  fetchExportAppointments,
  fetchExportFinances,
  fetchExportStaffProduction,
} from "@/lib/dashboard/export-actions";

type Props = {
  shopId: string;
};

export default function ExportDataCard({ shopId }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<number>(0);

  async function handleExport<T>(
    label: string,
    fetcher: () => Promise<{ success: boolean; data?: T; error?: string }>,
    toRows: (data: T) => { rows: Record<string, unknown>[]; columns: { key: string; label: string }[]; filename: string }
  ) {
    setBusy(label);
    try {
      const result = await fetcher();
      if (!result.success || result.data == null) return;
      const { rows, columns, filename } = toRows(result.data);
      downloadCsv(rows as Record<string, string>[], columns as { key: string; label: string }[], filename);
    } finally {
      setBusy(null);
    }
  }

  const { today, monthStart } = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return { today, monthStart };
  }, []);

  const buttons = [
    {
      id: "clientes",
      label: "Clientes",
      icon: Users,
      action: () =>
        handleExport("clientes", () => fetchExportCustomers(shopId), (data) => ({
          rows: data as Record<string, unknown>[], columns: [
            { key: "nombre", label: "Cliente" }, { key: "email", label: "Email" },
            { key: "telefono", label: "Teléfono" }, { key: "cumpleaños", label: "Cumpleaños" },
            { key: "observaciones_tecnicas", label: "Observaciones" }, { key: "tags", label: "Etiquetas" },
            { key: "loyalty_cuts_count", label: "Fidelización" },
          ], filename: "clientes",
        })),
    },
    {
      id: "turnos",
      label: "Turnos",
      icon: Calendar,
      action: () =>
        handleExport("turnos", () => fetchExportAppointments(shopId), (data) => ({
          rows: data as Record<string, unknown>[], columns: [
            { key: "fecha", label: "Fecha" }, { key: "horario", label: "Horario" },
            { key: "cliente", label: "Cliente" }, { key: "servicio", label: "Servicio" },
            { key: "staff", label: "Staff" }, { key: "estado", label: "Estado" },
            { key: "pago", label: "Pago" }, { key: "seña", label: "Seña" },
          ], filename: "turnos",
        })),
    },
    {
      id: "finanzas",
      label: "Finanzas",
      icon: DollarSign,
      action: () =>
        handleExport("finanzas", () => fetchExportFinances(shopId, monthStart, today), (data) => ({
          rows: [data as Record<string, unknown>], columns: [
            { key: "totalIncome", label: "Ingresos" }, { key: "totalExpenses", label: "Gastos" },
            { key: "netBalance", label: "Balance" },
          ], filename: "finanzas",
        })),
    },
    {
      id: "staff",
      label: "Staff",
      icon: Users2,
      action: () =>
        handleExport("staff", () => fetchExportStaffProduction(shopId, monthStart, today), (data) => ({
          rows: data as Record<string, unknown>[], columns: [
            { key: "empleado", label: "Empleado" }, { key: "turnos", label: "Turnos" },
            { key: "cobrado", label: "Cobrado" }, { key: "ticket_promedio", label: "Ticket promedio" },
          ], filename: "produccion-staff",
        })),
    },
    {
      id: "stock",
      label: "Inventario",
      icon: Package,
      action: () =>
        handleExport("stock", () => fetchExportStock(shopId), (data) => ({
          rows: data as Record<string, unknown>[], columns: [
            { key: "nombre_producto", label: "Producto" }, { key: "quantity", label: "Cantidad" },
            { key: "unit_cost", label: "Costo unit." },
          ], filename: "inventario",
        })),
    },
  ];

  function handleMouseEnter() {
    window.clearTimeout(timeoutRef.current);
    setOpen(true);
  }

  function handleMouseLeave() {
    timeoutRef.current = window.setTimeout(() => setOpen(false), 200);
  }

  return (
    <div className="relative inline-flex" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-violet-300 dark:hover:border-violet-600 transition-colors"
      >
        <Download className="w-4 h-4" />
        Descargar datos
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-40 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-1.5 min-w-[180px]">
          {buttons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={btn.action}
              disabled={busy === btn.id}
              className="w-full inline-flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              {busy === btn.id ? (
                <span className="w-4 h-4 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
              ) : (
                <btn.icon className="w-4 h-4" />
              )}
              <span className="flex-1 text-left">{busy === btn.id ? "Descargando..." : btn.label}</span>
              <Download className="w-3 h-3 text-zinc-300" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
