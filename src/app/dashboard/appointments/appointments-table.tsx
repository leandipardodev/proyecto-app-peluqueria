"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Bell, CreditCard, Copy, Check } from "lucide-react";
import AppointmentFormModal from "@/components/calendar/appointment-form-modal";
import { Button } from "@/components/ui/button";
import { useAppointmentAlarm } from "@/lib/use-appointment-alarm";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import { createPaymentLink } from "@/lib/payments/mercadopago-actions";
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

function needsStatusAttention(status: string): boolean {
  return status === "scheduled";
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
  canManageBilling?: boolean;
  error?: string | null;
}

export default function AppointmentsTable({ shopId, initialAppointments, services, staff, customers, shopName, shopAddress, whatsappTemplate, canManageBilling = false, error }: Props) {
  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerWord = INDUSTRY_CONFIG[industry].labels.customerSingular;
  const serviceWord = INDUSTRY_CONFIG[industry].labels.serviceSingular;
  const staffWord = INDUSTRY_CONFIG[industry].labels.staffSingular;
  const router = useRouter();
  const { playSuccess, playError, playClick } = useKlipSounds();
  const [appointments] = useState(initialAppointments);
  const [showForm, setShowForm] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [paymentLinks, setPaymentLinks] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { addToast } = useToast();

  useAppointmentAlarm(appointments);

  useEffect(() => {
    const channel = supabase
      .channel(`appointments-${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `shop_id=eq.${shopId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `shop_id=eq.${shopId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "services", filter: `shop_id=eq.${shopId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_memberships", filter: `shop_id=eq.${shopId}` }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId, router]);

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
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Proximos 10 turnos</h1>
        <Button onClick={() => setShowForm(true)}>Nuevo Turno</Button>
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
          appointments.map((apt) => {
            const svc = apt.services?.name ? extractEmoji(apt.services.name) : null;
            const urgent = needsStatusAttention(apt.status);
            const phone = apt.customers?.telefono || null;
            const whatsappUrl = buildWhatsAppUrl(phone, apt.customers?.nombre || customerWord, apt.start_time);
            const link = paymentLinks[apt.id];
            const generating = generatingId === apt.id;
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
                  <a
                    href={whatsappUrl}
                    target={phone ? "_blank" : undefined}
                    rel={phone ? "noopener noreferrer" : undefined}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-colors ${
                      phone
                        ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm cursor-pointer select-none"
                        : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                    }`}
                    onMouseDown={() => {
                      if (!phone || !hasRequiredWhatsappTemplate || !hasLocation) {
                        playError();
                        return;
                      }
                      playSuccess();
                    }}
                    onClick={(e) => {
                      if (!phone) {
                        e.preventDefault();
                        return;
                      }
                      if (!hasRequiredWhatsappTemplate || !hasLocation) {
                        e.preventDefault();
                        addToast("Para enviar WhatsApp, asegúrate de incluir {Hora} y direccion del local.", "error");
                      }
                    }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </a>
                  {apt.is_paid ? (
                    <span className="text-xs text-emerald-600 font-medium">Pagado</span>
                  ) : link ? (
                    <>
                      <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer select-none">
                        <CreditCard className="w-3.5 h-3.5" />
                        Link
                      </a>
                      <button
                        onClick={async () => {
                          playClick();
                          await navigator.clipboard.writeText(link);
                          setCopiedId(apt.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer select-none"
                        title="Copiar link"
                      >
                        {copiedId === apt.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </>
                  ) : canManageBilling ? (
                    <button
                      onClick={async () => {
                        setGeneratingId(apt.id);
                        setPaymentLinks((prev) => {
                          const next = { ...prev };
                          delete next[apt.id];
                          return next;
                        });
                        const result = await createPaymentLink(apt.id);
                        if (result.success && result.data?.init_point) {
                          setPaymentLinks((prev) => ({ ...prev, [apt.id]: result.data!.init_point }));
                        } else {
                          addToast("Error al generar el link", "error");
                        }
                        setGeneratingId(null);
                      }}
                      disabled={generating}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer select-none"
                    >
                      <CreditCard className="w-4 h-4" />
                      {generating ? "Generando..." : "Cobrar"}
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-500">Solo owner</span>
                  )}
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
              appointments.map((apt) => {
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
                          const urgent = needsStatusAttention(apt.status);
                          const phone = apt.customers?.telefono || null;
                          const whatsappUrl = buildWhatsAppUrl(phone, apt.customers?.nombre || customerWord, apt.start_time);
                          const link = paymentLinks[apt.id];
                          const generating = generatingId === apt.id;
                          return (
                            <>
                              <a
                                href={whatsappUrl}
                                target={phone ? "_blank" : undefined}
                                rel={phone ? "noopener noreferrer" : undefined}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-colors ${
                                  phone
                                    ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm cursor-pointer select-none"
                                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                                }`}
                                title={phone ? "Enviar WhatsApp" : "Sin teléfono — editá el cliente para agregarlo"}
                                onMouseDown={() => {
                                  if (!phone || !hasRequiredWhatsappTemplate || !hasLocation) {
                                    playError();
                                    return;
                                  }
                                  playSuccess();
                                }}
                                onClick={(e) => {
                                  if (!phone) {
                                    e.preventDefault();
                                    return;
                                  }
                                  if (!hasRequiredWhatsappTemplate || !hasLocation) {
                                    e.preventDefault();
                                    addToast("Para enviar WhatsApp, asegúrate de incluir {Hora} y direccion del local.", "error");
                                  }
                                }}
                              >
                                <MessageCircle className="w-4 h-4" />
                                WhatsApp
                              </a>
                              {apt.is_paid ? (
                                <span className="text-xs text-emerald-600 font-medium">Pagado</span>
                              ) : link ? (
                                <div className="flex items-center gap-1">
                                  <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer select-none"
                                    title="Abrir link de pago"
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                    Link
                                  </a>
                                  <button
                                    onClick={async () => {
                                      playClick();
                                      await navigator.clipboard.writeText(link);
                                      setCopiedId(apt.id);
                                      setTimeout(() => setCopiedId(null), 2000);
                                    }}
                                    className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer select-none"
                                    title="Copiar link"
                                  >
                                    {copiedId === apt.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                  {phone && (
                                    <a
                                      href={`https://wa.me/${phone.replace(/[^\d]/g, "").replace(/^00/, "")}?text=${encodeURIComponent(`Hola! Te paso el link para pagar tu turno: ${link}`)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1.5 rounded-md text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors cursor-pointer select-none"
                                      title="Enviar por WhatsApp"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              ) : canManageBilling ? (
                                <button
                                  onClick={async () => {
                                    setGeneratingId(apt.id);
                                    setPaymentLinks((prev) => {
                                      const next = { ...prev };
                                      delete next[apt.id];
                                      return next;
                                    });
                                    const result = await createPaymentLink(apt.id);
                                    if (result.success && result.data?.init_point) {
                                      setPaymentLinks((prev) => ({ ...prev, [apt.id]: result.data!.init_point }));
                                    } else {
                                      addToast("Error al generar el link", "error");
                                    }
                                    setGeneratingId(null);
                                  }}
                                  disabled={generating}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer select-none"
                                >
                                  <CreditCard className="w-4 h-4" />
                                  {generating ? "Generando..." : "Cobrar"}
                                </button>
                              ) : (
                                <span className="text-xs text-zinc-500">Solo owner</span>
                              )}
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
    </div>
  );
}
