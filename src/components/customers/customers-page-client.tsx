"use client";

import { useMemo, useState } from "react";
import { Gift, Search } from "lucide-react";
import type { CustomerRow } from "@/lib/dashboard/customers-actions";

function formatDate(date: string | null): string {
  if (!date) return "-";
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function isBirthdayThisWeek(date: string | null): boolean {
  if (!date) return false;
  const bday = new Date(date);
  if (Number.isNaN(bday.getTime())) return false;

  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const candidate = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  candidate.setHours(0, 0, 0, 0);

  return candidate >= weekStart && candidate <= weekEnd;
}

function loyaltyClass(loyalty: CustomerRow["loyalty"]): string {
  if (loyalty === "VIP") return "bg-amber-100 text-amber-700";
  if (loyalty === "Recurrente") return "bg-blue-100 text-blue-700";
  return "bg-zinc-100 text-zinc-700";
}

export default function CustomersPageClient({ initialCustomers }: { initialCustomers: CustomerRow[] }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return initialCustomers;

    return initialCustomers.filter((customer) => {
      const byName = customer.nombre.toLowerCase().includes(q);
      const byObs = (customer.observations || "").toLowerCase().includes(q);
      return byName || byObs;
    });
  }, [initialCustomers, searchQuery]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Clientes</h1>
        <p className="mt-1 text-sm text-slate-500">Ficha completa de clientes, historial y observaciones técnicas.</p>
      </div>

      <div className="max-w-md relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por nombre u observaciones..."
          className="w-full rounded-full bg-white border border-slate-200 pl-9 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-500">
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Contacto</th>
                <th className="px-6 py-3 font-medium">Cumpleaños</th>
                <th className="px-6 py-3 font-medium">Última visita</th>
                <th className="px-6 py-3 font-medium">Servicios realizados</th>
                <th className="px-6 py-3 font-medium">Observaciones técnicas</th>
                <th className="px-6 py-3 font-medium">Fidelidad</th>
                <th className="px-6 py-3 font-medium text-right">Gasto acumulado</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    No se encontraron clientes
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const birthdayBadge = isBirthdayThisWeek(customer.birthday);

                  return (
                    <tr key={customer.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900">{customer.nombre}</p>
                          {birthdayBadge && (
                            <span title="Cumple esta semana">
                              <Gift className="w-4 h-4 text-rose-500" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <p>{customer.email || "Sin mail"}</p>
                        <p>{customer.telefono || "Sin teléfono"}</p>
                      </td>
                      <td className="px-6 py-4 text-slate-700">{formatDate(customer.birthday)}</td>
                      <td className="px-6 py-4 text-slate-700">{formatDate(customer.lastVisit)}</td>
                      <td className="px-6 py-4 text-slate-700">
                        {customer.servicesHistory.length > 0 ? customer.servicesHistory.join(", ") : "Sin historial"}
                      </td>
                      <td className="px-6 py-4 text-slate-700 max-w-[280px]">
                        <p className="line-clamp-3">{customer.observations || "Sin observaciones"}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${loyaltyClass(customer.loyalty)}`}>
                          {customer.loyalty}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-slate-900">{formatMoney(customer.accumulatedSpend)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
