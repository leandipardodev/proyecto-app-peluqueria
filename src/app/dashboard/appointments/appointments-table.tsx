"use client";

import { useEffect, useMemo, useState, memo } from "react";
import { MessageCircle, Bell } from "lucide-react";
import AppointmentFormModal from "@/components/calendar/appointment-form-modal";
import { Button } from "@/components/ui/button";
import { useAppointmentAlarm } from "@/lib/use-appointment-alarm";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";

type Appointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  deposit_amount: number | null;
  customers: { id: string; nombre: string | null; email: string; telefono: string | null } | null;
  staff: { user_id: string; name: string | null } | null;
  services: { id: string; name: string; price: number } | null;
};

type Service = { id: string; name: string; duration_minutes: number; price: number };
type StaffMember = { id: string; role: string; name: string | null; email: string | null };
type Customer = { id: string; nombre: string | null; email: string | null; telefono: string | null };

function extractEmoji(name: string): { emoji: string; label: string } {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return { emoji: parts[0], label: parts.slice(1).join(" ") };
  return { emoji: "", label: name };
}

const statusBadge: Record<string, string> = {
  scheduled: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  in_progress: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-700",
  no_show: "bg-rose-50 text-rose-700",
};

function getStatusBadgeClass(status: string, isPaid: boolean): string {
  if (status === "scheduled" && isPaid) return "bg-sky-50 text-sky-700";
  if (status === "scheduled" && !isPaid) return "bg-amber-50 text-amber-700";
  return statusBadge[status] || "bg-gray-100 text-gray-800";
}

function getTurnoStatusLabel(status: string, isPaid: boolean): string {
  if (status === "pending_payment") return "Pago pendiente";
  if (status === "scheduled" && !isPaid) return "A confirmar";
  if (status === "scheduled" && isPaid) return "Señado";
  if (status === "confirmed" || status === "in_progress") return "Confirmado";
  if (status === "completed") return "Completado";
  if (status === "cancelled" || status === "no_show") return "Cancelado";
  return status;
}

function needsStatusAttention(startTime: string): boolean {
  const diff = new Date(startTime).getTime() - Date.now();
  return diff > 0 && diff <= 3600000;
}

interface Props {
  shopId: string;
  initialAppointments: Appointment[];
  services: Service[];
  staff: StaffMember[];
  customers: Customer[];
  shopName: string;
  shopAddress?: string | null;
  whatsappTemplate?: string | null;
  error?: string | null;
}

const AppointmentsTable = memo(function AppointmentsTable({ shopId, initialAppointments, services, staff, customers, shopName, shopAddress, whatsappTemplate, error }: Props) {
  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerWord = INDUSTRY_CONFIG[industry].labels.customerSingular;
  const serviceWord = INDUSTRY_CONFIG[industry].labels.serviceSingular;
  const staffWord = INDUSTRY_CONFIG[industry].labels.staffSingular;
  const router = useRouter();
  const { playSuccess, playError, playClick } = useKlipSounds();
  const [appointments] = useState(initialAppointments);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const { addToast } = useToast();
  const pageSize = 10;

  const totalPages = Math.max(1, Math.ceil(appointments.length / pageSize));
  const pagedAppointments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return appointments.slice(start, start + pageSize);
  }, [appointments, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useAppointmentAlarm(appointments);

  useEffect(() => {
    const channel = supabase
      .channel(`appointments-${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `shop_id=eq.${shopId}` }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId]);

  function handleSuccess() {
    setShowForm(false);
  }

  function buildWhatsAppUrl(phone: string | null, customerName: string, startTime: string): string {
    if (!phone) return "#";
    const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
    const time = new Date(startTime).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const template = whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE;
    const locationLine = shopAddress ? `\n📍 ${shopAddress}` : "";
    const text = template
      .replace(/\{Nombre\}/g, customerName)
      .replace(/\{Peluqueria\}/g, shopName)
      .replace(/\{Negocio\}/g, shopName)
      .replace(/\{Hora\}/g, time) + locationLine;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }

  const hasRequiredWhatsappTemplate = (whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE).includes("{Hora}");
  const hasLocation = Boolean((shopAddress || "").trim());

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Proximos turnos</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowForm(true)}>Nuevo Turno</Button>
        </div>
      </div>

      {showForm && (
        <AppointmentFormModal
          shopId={shopId}
          open={showForm}
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
          services={services.map(s => ({ id: s.id, name: s.name, duration_minutes: s.duration_minutes, price: s.price }))}
          staff={staff}
          customers={customers}
        />
      )}

      <div className="md:hidden space-y-3">
        {appointments.length === 0 ? (
          <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[1.75rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-4 text-sm text-center text-gray-500 dark:text-gray-400">
            No hay turnos registrados
          </div>
        ) : (
          pagedAppointments.map((apt) => {
            const svc = apt.services?.name ? extractEmoji(apt.services.name) : null;
            const urgent = needsStatusAttention(apt.start_time);
            const phone = apt.customers?.telefono || null;
            const whatsappUrl = buildWhatsAppUrl(phone, apt.customers?.nombre || customerWord, apt.start_time);
            return (
              <div key={apt.id} className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[1.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{apt.customers?.nombre || "N/A"}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(apt.start_time).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                  </div>
                  <span className={`px-2 inline-flex items-center justify-center whitespace-nowrap text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(apt.status, apt.is_paid)}`}>
                    {getTurnoStatusLabel(apt.status, apt.is_paid)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                  {new Date(apt.start_time).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  {" - "}
                  {new Date(apt.end_time).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{svc ? `${svc.emoji} ${svc.label}` : apt.services?.name || "N/A"}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{staffWord}: {apt.staff?.name || "N/A"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!phone}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-colors ${
                      phone
                        ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm cursor-pointer"
                        : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                    }`}
                    onClick={() => {
                      if (!phone) return;
                      if (!hasRequiredWhatsappTemplate || !hasLocation) {
                        addToast("Para enviar WhatsApp, asegúrate de incluir {Hora} y direccion del local.", "error");
                        playError();
                        return;
                      }
                      playSuccess();
                      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </button>
                  {urgent && <Bell className="w-4 h-4 text-red-500 animate-pulse shrink-0" />}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden md:block bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
        <div className="w-full overflow-x-auto">
        <table className="min-w-[1100px] w-full divide-y divide-white/20 dark:divide-white/10">
          <thead className="bg-white/40 dark:bg-black/20">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Horario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{customerWord}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{serviceWord}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{staffWord}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pago</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Seña</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-transparent dark:bg-transparent divide-y divide-white/20 dark:divide-white/10">
            {appointments.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No hay turnos registrados</td>
              </tr>
            ) : (
              pagedAppointments.map((apt) => {
                const svc = apt.services?.name ? extractEmoji(apt.services.name) : null;
                return (
                  <tr key={apt.id} className="hover:bg-white/40 dark:hover:bg-white/5 cursor-pointer">
                    <td suppressHydrationWarning className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {new Date(apt.start_time).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </td>
                    <td suppressHydrationWarning className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {new Date(apt.start_time).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      {" - "}
                      {new Date(apt.end_time).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-[180px]">
                      {apt.customers?.nombre || "N/A"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-[220px]">
                      {svc ? `${svc.emoji} ${svc.label}` : apt.services?.name || "N/A"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-[160px]">
                      {apt.staff?.name || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                       <span className={`px-2 inline-flex items-center justify-center whitespace-nowrap text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(apt.status, apt.is_paid)}`}>
                        {getTurnoStatusLabel(apt.status, apt.is_paid)}
                       </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {apt.is_paid ? <span className="text-emerald-600">Pagado</span> : <span className="text-rose-500">Pendiente</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {apt.deposit_amount ? `$${apt.deposit_amount.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const urgent = needsStatusAttention(apt.start_time);
                          const phone = apt.customers?.telefono || null;
                          const whatsappUrl = buildWhatsAppUrl(phone, apt.customers?.nombre || customerWord, apt.start_time);
                          return (
                            <>
                              <button
                                type="button"
                                disabled={!phone}
                                title={phone ? "Enviar WhatsApp" : "Sin teléfono — editá el cliente para agregarlo"}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-colors ${
                                  phone
                                    ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm cursor-pointer"
                                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                                }`}
                                onClick={() => {
                                  if (!phone) return;
                                  if (!hasRequiredWhatsappTemplate || !hasLocation) {
                                    addToast("Para enviar WhatsApp, asegúrate de incluir {Hora} y direccion del local.", "error");
                                    playError();
                                    return;
                                  }
                                  playSuccess();
                                  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
                                }}
                              >
                                <MessageCircle className="w-4 h-4" />
                                WhatsApp
                              </button>
                              {urgent && (
                                <span title="Próximo turno en menos de 1 hora">
                                  <Bell className="w-4 h-4 text-red-500 animate-pulse shrink-0" />
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      {appointments.length > pageSize && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/35 px-4 py-3 text-sm dark:border-white/10 dark:bg-black/20">
          <p className="text-zinc-600 dark:text-zinc-300">
            {page === 1 ? 1 : (page - 1) * pageSize + 1}
            {" - "}
            {Math.min(page * pageSize, appointments.length)} de {appointments.length} turnos
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="rounded-lg border border-white/30 bg-white/70 px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              &laquo;
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-white/30 bg-white/70 px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              &lsaquo;
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  p === page
                    ? "border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200"
                    : "border-white/30 bg-white/70 text-zinc-700 hover:bg-white dark:border-white/15 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-white/30 bg-white/70 px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              &rsaquo;
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded-lg border border-white/30 bg-white/70 px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              &raquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default AppointmentsTable;
