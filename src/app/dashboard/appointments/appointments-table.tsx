"use client";

import { useEffect, useMemo, useState, memo, useRef } from "react";

let realtimeChannelCounter = 0;
import { CheckCircle2, Bell } from "lucide-react";
import { useAppointmentAlarm } from "@/lib/use-appointment-alarm";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp/whatsapp-constants";
import { useKlipSounds } from "@/lib/use-klip-sounds";
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
  was_pending_payment?: boolean;
  deposit_amount: number | null;
  customers: { id: string; nombre: string | null; email: string; telefono: string | null } | null;
  staff: { user_id: string; name: string | null } | null;
  services: { id: string; name: string; price: number } | null;
  custom_service_name: string | null;
};



function extractEmoji(name: string): { emoji: string; label: string } {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return { emoji: parts[0], label: parts.slice(1).join(" ") };
  return { emoji: "", label: name };
}

const artDayFmt = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" });
const artTimeFmt = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", minute: "2-digit", hourCycle: "h23" });

function formatArtDay(d: Date | string): string {
  return artDayFmt.format(new Date(d));
}

function formatArtTime(d: Date | string): string {
  return artTimeFmt.format(new Date(d));
}

function needsStatusAttention(startTime: string): boolean {
  const diff = new Date(startTime).getTime() - Date.now();
  return diff > 0 && diff <= 3600000;
}

interface Props {
  shopId: string;
  initialAppointments: Appointment[];
  shopName: string;
  shopAddress?: string | null;
  whatsappTemplate?: string | null;
  error?: string | null;
}

const AppointmentsTable = memo(function AppointmentsTable({ shopId, initialAppointments, shopName, shopAddress, whatsappTemplate, error }: Props) {
  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerWord = INDUSTRY_CONFIG[industry].labels.customerSingular;
  const serviceWord = INDUSTRY_CONFIG[industry].labels.serviceSingular;
  const staffWord = INDUSTRY_CONFIG[industry].labels.staffSingular;
  const { playSuccess, playError, playClick } = useKlipSounds();
  const [appointments, setAppointments] = useState(initialAppointments);
  const [page, setPage] = useState(1);
  const { addToast } = useToast();
  const pageSize = 10;

  const totalPages = Math.max(1, Math.ceil(appointments.length / pageSize));
  const pagedAppointments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return appointments.slice(start, start + pageSize);
  }, [appointments, page]);

  useEffect(() => {
    setAppointments(initialAppointments);
  }, [initialAppointments]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useAppointmentAlarm(appointments);

  const realtimeCooldown = useRef(false);

  useEffect(() => {
    const handleChange = async () => {
      if (realtimeCooldown.current) return;
      realtimeCooldown.current = true;
      setTimeout(() => { realtimeCooldown.current = false; }, 5000);
      const now = new Date().toISOString();
      const { data: rows, error } = await supabase
        .from("appointments")
        .select("id, start_time, end_time, status, is_paid, was_pending_payment, deposit_amount, customer_id, staff_id, service_id, custom_service_name")
        .eq("shop_id", shopId)
        .gte("start_time", now)
        .order("start_time", { ascending: true })
        .limit(50);
      if (!error && rows) {
        const customerIds = rows.map((r) => r.customer_id).filter(Boolean) as string[];
        const staffIds = rows.map((r) => r.staff_id).filter(Boolean) as string[];
        const serviceIds = rows.map((r) => r.service_id).filter(Boolean) as string[];
        const [customersRes, staffRes, servicesRes] = await Promise.all([
          customerIds.length > 0
            ? supabase.from("customers").select("id, nombre, email, telefono").in("id", customerIds)
            : { data: [] },
          staffIds.length > 0
            ? supabase.from("user_profiles").select("user_id, name").in("user_id", staffIds)
            : { data: [] },
          serviceIds.length > 0
            ? supabase.from("services").select("id, name, price").in("id", serviceIds)
            : { data: [] },
        ]);
        const customerMap = new Map((customersRes.data || []).map((c) => [c.id, c]));
        const staffMap = new Map((staffRes.data || []).map((s: { user_id: string; name: string | null }) => [s.user_id, s]));
        const serviceMap = new Map((servicesRes.data || []).map((s: { id: string; name: string; price: number }) => [s.id, s]));
        const assembled = rows.map((r) => ({
          ...r,
          customers: customerMap.get(r.customer_id ?? "") ?? null,
          staff: staffMap.get(r.staff_id ?? "") ?? null,
          services: serviceMap.get(r.service_id ?? "") ?? null,
          custom_service_name: (r as Record<string, unknown>).custom_service_name as string | null ?? null,
        }));
        setAppointments(assembled as Appointment[]);
      }
    };

    const channelName = `realtime:appointments-${shopId}-${++realtimeChannelCounter}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `shop_id=eq.${shopId}` }, handleChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId]);

  function buildWhatsAppUrl(phone: string | null, customerName: string, startTime: string, serviceNames?: string[]): string {
    if (!phone) return "#";
    const cleanPhone = phone.replace(/[^\d]/g, "").replace(/^00/, "");
    const dt = new Date(startTime);
    const time = dt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    const date = dt.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const template = whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE;
    const place = (shopAddress || "").trim();
    const locationLine = place ? `\n📍 ${place}` : "";
    const servicioText = serviceNames && serviceNames.length > 0
      ? serviceNames.length === 1
        ? serviceNames[0]
        : serviceNames.slice(0, -1).join(", ") + " y " + serviceNames[serviceNames.length - 1]
      : "";
    let text = template
      .replace(/\@Nombre/g, customerName)
      .replace(/\@Cliente/g, customerName)
      .replace(/\@Servicio/g, servicioText)
      .replace(/\@Fecha/g, date)
      .replace(/\@Hora/g, time)
      .replace(/\@hora/g, time)
      .replace(/\@Lugar/g, place)
      .replace(/\@lugar/g, place)
      .replace(/\@Ubicacion/g, place)
      .replace(/\@ubicacion/g, place)
      .replace(/\@Peluqueria/g, shopName)
      .replace(/\@Negocio/g, shopName);
    if (place) text += locationLine;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }

  const hasRequiredWhatsappTemplate = (whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE).includes("@Hora");
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
        <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-tight leading-none">Próximos turnos</h1>
      </div>

      <div className="md:hidden space-y-3">
        {appointments.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4 text-sm text-center text-gray-500 dark:text-zinc-400">
            No hay turnos registrados
          </div>
        ) : (
          pagedAppointments.map((apt) => {
            const svc = apt.services?.name ? extractEmoji(apt.services.name) : null;
            const urgent = needsStatusAttention(apt.start_time);
            const phone = apt.customers?.telefono || null;
            const serviceName = apt.services?.name || apt.custom_service_name || "";
            const serviceNames = serviceName ? [serviceName] : undefined;
            const whatsappUrl = buildWhatsAppUrl(phone, apt.customers?.nombre || customerWord, apt.start_time, serviceNames);
            return (
              <div key={apt.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{apt.customers?.nombre || "N/A"}</p>
                  {urgent && <Bell className="w-4 h-4 text-red-500 animate-pulse shrink-0" />}
                </div>
                <p className="mt-1 text-sm text-gray-700 dark:text-zinc-300 tabular-nums">
                  {formatArtDay(apt.start_time)} {formatArtTime(apt.start_time)}
                  {" a "}
                  {formatArtTime(apt.end_time)}
                </p>
                <p className="text-sm text-gray-700 dark:text-zinc-300">{svc ? `${svc.emoji} ${svc.label}` : serviceName || "N/A"}</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400">{staffWord}: {apt.staff?.name || "N/A"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!phone}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      phone
                        ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm cursor-pointer"
                        : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                    }`}
                    onClick={() => {
                      if (!phone) return;
                      if (!hasRequiredWhatsappTemplate || !hasLocation) {
                                    addToast("Para enviar WhatsApp, asegúrate de incluir @Hora y direccion del local.", "error");
                        playError();
                        return;
                      }
                      playSuccess();
                      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
                    }}
                  >
                    WhatsApp
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors">
        <div className="w-full overflow-x-auto">
        <table className="min-w-[860px] w-full divide-y divide-white/20 dark:divide-white/10">
          <thead className="bg-white dark:bg-zinc-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Fecha y hora</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">{customerWord}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">{serviceWord}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">{staffWord}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Pago</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Seña</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-transparent dark:bg-transparent divide-y divide-white/20 dark:divide-white/10">
            {appointments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500 dark:text-zinc-400">No hay turnos registrados</td>
              </tr>
            ) : (
              pagedAppointments.map((apt) => {
                const svcT = apt.services?.name ? extractEmoji(apt.services.name) : null;
                const serviceNameT = apt.services?.name || apt.custom_service_name || "";
                return (
                  <tr key={apt.id} className="hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                    <td suppressHydrationWarning className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-zinc-100 tabular-nums">
                      {formatArtDay(apt.start_time)} {formatArtTime(apt.start_time)}
                      {" a "}
                      {formatArtTime(apt.end_time)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-zinc-100 max-w-[180px]">
                      {apt.customers?.nombre || "N/A"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-zinc-100 max-w-[220px]">
                      {svcT ? `${svcT.emoji} ${svcT.label}` : serviceNameT || "N/A"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-zinc-100 max-w-[160px]">
                      {apt.staff?.name || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {apt.is_paid ? (
                        <span title="Pagado" className="inline-flex items-center text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-5 h-5" />
                        </span>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-zinc-300 tabular-nums">
                      {apt.deposit_amount ? `$${apt.deposit_amount.toFixed(2)}` : ""}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const urgent = needsStatusAttention(apt.start_time);
                          const phone = apt.customers?.telefono || null;
                          const serviceNames = (apt.services?.name || apt.custom_service_name) ? [apt.services?.name || apt.custom_service_name!] : undefined;
                          const whatsappUrl = buildWhatsAppUrl(phone, apt.customers?.nombre || customerWord, apt.start_time, serviceNames);
                          return (
                            <>
                              <button
                                type="button"
                                disabled={!phone}
                                title={phone ? "Enviar WhatsApp" : "Sin teléfono — editá el cliente para agregarlo"}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                  phone
                                    ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm cursor-pointer"
                                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                                }`}
                                onClick={() => {
                                  if (!phone) return;
                                  if (!hasRequiredWhatsappTemplate || !hasLocation) {
                        addToast("Para enviar WhatsApp, asegúrate de incluir @Hora y direccion del local.", "error");
                                    playError();
                                    return;
                                  }
                                  playSuccess();
                                  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
                                }}
                              >
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-zinc-900">
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
              className="rounded-lg border border-white/30 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              &laquo;
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-white/30 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
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
                    : "border-white/30 bg-white text-zinc-700 hover:bg-white dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-white/30 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              &rsaquo;
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded-lg border border-white/30 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
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
