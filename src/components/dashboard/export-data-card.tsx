"use client";

import { useState } from "react";
import { Download, Users, Package, Calendar, DollarSign, Users2 } from "lucide-react";
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

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

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
            { key: "observaciones_tecnicas", label: "Observaciones" }, { key: "es_vip", label: "VIP" },
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

  return (
    <div className="flex flex-wrap gap-1.5">
      {buttons.map((btn) => (
        <button
          key={btn.id}
          type="button"
          onClick={btn.action}
          disabled={busy === btn.id}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 transition disabled:opacity-50"
        >
          {busy === btn.id ? (
            <span className="w-3 h-3 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
          ) : (
            <btn.icon className="w-3.5 h-3.5" />
          )}
          <span>{busy === btn.id ? "..." : btn.label}</span>
          <Download className="w-2.5 h-2.5 text-zinc-400" />
        </button>
      ))}
    </div>
  );
}
