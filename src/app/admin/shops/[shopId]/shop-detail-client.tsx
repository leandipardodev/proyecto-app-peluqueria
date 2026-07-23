"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  MapPin,
  ExternalLink,
  Globe,
  Globe2,
  CreditCard,
  Shield,
  Users,
  Scissors,
  Calendar,
  DollarSign,
  FileText,
  Zap,
  CheckCircle,
  XCircle,
  Link as LinkIcon,
} from "lucide-react";
import type { ShopDetail } from "@/lib/admin/shop-detail";

const DAY_NAMES = [
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
  "Domingo",
];

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  completed: {
    label: "Completado",
    className: "bg-emerald-100 text-emerald-700",
  },
  scheduled: {
    label: "Programado",
    className: "bg-blue-100 text-blue-700",
  },
  confirmed: {
    label: "Confirmado",
    className: "bg-violet-100 text-violet-700",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-red-100 text-red-700",
  },
  in_progress: {
    label: "En curso",
    className: "bg-amber-100 text-amber-700",
  },
  pending_payment: {
    label: "Pago pendiente",
    className: "bg-orange-100 text-orange-700",
  },
  no_show: {
    label: "No asistio",
    className: "bg-zinc-100 text-zinc-600",
  },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function AccordionSection({
  title,
  icon: Icon,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white/95 shadow-sm shadow-zinc-200/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
            <Icon className="h-4 w-4 text-zinc-600" />
          </div>
          <span className="text-sm font-semibold text-zinc-900">{title}</span>
          {badge}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-100 px-5 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200/60 bg-zinc-50/80 p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold text-zinc-900">{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <span
        className={`text-right text-sm text-zinc-900 ${mono ? "font-mono" : ""}`}
      >
        {value || "-"}
      </span>
    </div>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export default function ShopDetailClient({ shop }: { shop: ShopDetail }) {
  const planDaysLeft = daysUntil(shop.planExpiry);
  const planExpired = planDaysLeft !== null && planDaysLeft < 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-6 text-zinc-100 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{shop.nombre}</h1>
              <Badge
                className={
                  shop.active
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-zinc-500/20 text-zinc-400"
                }
              >
                {shop.active ? "Activa" : "Inactiva"}
              </Badge>
              <Badge className="bg-violet-500/20 text-violet-300">
                {shop.industryLabel}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-400">/{shop.slug}</p>
            {shop.ownerName && (
              <p className="mt-1 text-sm text-zinc-400">
                Owner: {shop.ownerName}
                {shop.ownerEmail && (
                  <span className="text-zinc-500"> ({shop.ownerEmail})</span>
                )}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <a
              href={`/book/${shop.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              Ver booking
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`/dashboard/${shop.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              Dashboard
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Servicios" value={shop.servicesCount} />
        <StatCard label="Clientes" value={shop.customersCount} />
        <StatCard label="Staff" value={shop.staffCount} />
        <StatCard label="Turnos (30d)" value={shop.appointments30d} sub={`${shop.completedAppointments30d} completados`} />
        <StatCard label="Ingresos (30d)" value={formatCurrency(shop.revenue30d)} />
        <StatCard
          label="Plan"
          value={
            planExpired
              ? "Vencido"
              : planDaysLeft !== null
                ? `${planDaysLeft}d`
                : "-"
          }
          sub={
            shop.planExpiry
              ? formatDate(shop.planExpiry)
              : undefined
          }
        />
      </div>

      {/* Secciones acordeón */}
      <div className="space-y-3">
        {/* Info del negocio */}
        <AccordionSection title="Informacion del negocio" icon={MapPin} defaultOpen>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1 divide-y divide-zinc-100">
              <InfoRow label="Direccion" value={shop.address} />
              <InfoRow label="Localidad" value={shop.localidad} />
              <InfoRow label="Telefono" value={shop.phone} />
              <InfoRow label="Descripcion" value={shop.description} />
              <InfoRow label="Creado" value={formatDate(shop.createdAt)} />
              <InfoRow label="Actualizado" value={formatDate(shop.updatedAt)} />
            </div>
            <div className="space-y-1 divide-y divide-zinc-100">
              <InfoRow
                label="Instagram"
                value={
                  shop.instagramUrl ? (
                    <a
                      href={shop.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-violet-600 hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {shop.instagramUrl.replace(/https?:\/\/(www\.)?/, "")}
                    </a>
                  ) : (
                    "-"
                  )
                }
              />
              <InfoRow
                label="Facebook"
                value={
                  shop.facebookUrl ? (
                    <a
                      href={shop.facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-violet-600 hover:underline"
                    >
                      <Globe2 className="h-3.5 w-3.5" />
                      {shop.facebookUrl.replace(/https?:\/\/(www\.)?/, "")}
                    </a>
                  ) : (
                    "-"
                  )
                }
              />
              <InfoRow
                label="TikTok"
                value={
                  shop.tiktokUrl ? (
                    <a
                      href={shop.tiktokUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-violet-600 hover:underline"
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                      {shop.tiktokUrl.replace(/https?:\/\/(www\.)?/, "")}
                    </a>
                  ) : (
                    "-"
                  )
                }
              />
              <InfoRow
                label="Google Maps"
                value={
                  shop.googleMapsUrl ? (
                    <a
                      href={shop.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-violet-600 hover:underline"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      Abrir mapa
                    </a>
                  ) : (
                    "-"
                  )
                }
              />
            </div>
          </div>

          {/* Horarios */}
          {shop.businessHours != null && (
            <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Horarios de atencion
              </p>
              <div className="grid gap-1 sm:grid-cols-2">
                {DAY_NAMES.map((day, i) => {
                  const hours = (shop.businessHours as Record<string, unknown>)?.[
                    String(i)
                  ] as
                    | { open?: string; close?: string; closed?: boolean }
                    | undefined;
                  const isClosed = hours?.closed || !hours?.open;
                  return (
                    <div
                      key={day}
                      className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm"
                    >
                      <span className="font-medium text-zinc-700">{day}</span>
                      {isClosed ? (
                        <span className="text-xs text-zinc-400">Cerrado</span>
                      ) : (
                        <span className="text-xs text-zinc-600">
                          {hours?.open} - {hours?.close}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </AccordionSection>

        {/* Configuracion de pagos */}
        <AccordionSection title="Configuracion de pagos" icon={CreditCard}>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1 divide-y divide-zinc-100">
              <InfoRow
                label="Mercado Pago"
                value={
                  shop.mpTokenConfigured ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Configurado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-zinc-400">
                      <XCircle className="h-3.5 w-3.5" />
                      No configurado
                    </span>
                  )
                }
              />
              <InfoRow
                label="MP Public Key"
                value={
                  shop.mpPublicKey ? (
                    <span className="font-mono text-xs">
                      {shop.mpPublicKey.slice(0, 20)}...
                    </span>
                  ) : (
                    "-"
                  )
                }
              />
              <InfoRow
                label="Cobro en local"
                value={
                  shop.payAtShop ? (
                    <Badge className="bg-emerald-100 text-emerald-700">Si</Badge>
                  ) : (
                    <Badge className="bg-zinc-100 text-zinc-600">No</Badge>
                  )
                }
              />
            </div>
            <div className="space-y-1 divide-y divide-zinc-100">
              <InfoRow
                label="Transferencia bancaria"
                value={
                  shop.bankTransferEnabled ? (
                    <Badge className="bg-emerald-100 text-emerald-700">
                      Habilitada
                    </Badge>
                  ) : (
                    <Badge className="bg-zinc-100 text-zinc-600">
                      Deshabilitada
                    </Badge>
                  )
                }
              />
              {shop.bankTransferEnabled && (
                <>
                  <InfoRow label="Banco" value={shop.bankName} />
                  <InfoRow
                    label="CVU / CBU"
                    value={shop.bankCvuCbu}
                    mono
                  />
                  <InfoRow label="Alias" value={shop.bankAlias} mono />
                </>
              )}
              <InfoRow
                label="Deposito habilitado"
                value={
                  shop.bookingDepositEnabled ? (
                    <span className="text-emerald-600">
                      Si - {formatCurrency(shop.bookingDepositAmount)}
                    </span>
                  ) : (
                    <span className="text-zinc-400">No</span>
                  )
                }
              />
            </div>
          </div>
        </AccordionSection>

        {/* Fidelizacion */}
        <AccordionSection title="Programa de fidelizacion" icon={Shield}>
          <div className="space-y-1 divide-y divide-zinc-100">
            <InfoRow
              label="Activo"
              value={
                shop.loyaltyEnabled ? (
                  <Badge className="bg-emerald-100 text-emerald-700">Si</Badge>
                ) : (
                  <Badge className="bg-zinc-100 text-zinc-600">No</Badge>
                )
              }
            />
            {shop.loyaltyEnabled && (
              <>
                <InfoRow
                  label="Cortes requeridos"
                  value={shop.loyaltyCutsRequired}
                />
                <InfoRow
                  label="Descuento"
                  value={`${shop.loyaltyDiscountPercent}%`}
                />
              </>
            )}
          </div>
        </AccordionSection>

        {/* Miembros */}
        <AccordionSection
          title="Miembros"
          icon={Users}
          badge={
            <Badge className="bg-zinc-100 text-zinc-600">
              {shop.members.length}
            </Badge>
          }
        >
          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Rol</th>
                </tr>
              </thead>
              <tbody>
                {shop.members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-6 text-center text-zinc-500"
                    >
                      Sin miembros
                    </td>
                  </tr>
                ) : (
                  shop.members.map((m) => (
                    <tr
                      key={m.userId}
                      className="border-b border-zinc-100 last:border-0"
                    >
                      <td className="px-3 py-2 font-medium text-zinc-900">
                        {m.name || "-"}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">
                        {m.email || "-"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          className={
                            m.role === "owner"
                              ? "bg-blue-100 text-blue-700"
                              : m.role === "admin"
                                ? "bg-violet-100 text-violet-700"
                                : "bg-zinc-100 text-zinc-600"
                          }
                        >
                          {m.role}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AccordionSection>

        {/* Servicios */}
        <AccordionSection
          title="Servicios"
          icon={Scissors}
          badge={
            <Badge className="bg-zinc-100 text-zinc-600">
              {shop.servicesCount}
            </Badge>
          }
        >
          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Duracion</th>
                </tr>
              </thead>
              <tbody>
                {shop.services.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-6 text-center text-zinc-500"
                    >
                      Sin servicios
                    </td>
                  </tr>
                ) : (
                  shop.services.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-zinc-100 last:border-0"
                    >
                      <td className="px-3 py-2 font-medium text-zinc-900">
                        {s.name}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-600">
                        {formatCurrency(s.price)}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-600">
                        {s.durationMinutes ? `${s.durationMinutes} min` : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AccordionSection>

        {/* Suscripcion y facturacion */}
        <AccordionSection
          title="Suscripcion y facturacion"
          icon={DollarSign}
        >
          <div className="space-y-4">
            {/* Plan status */}
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    Plan Mensual
                  </p>
                  <p className="text-xs text-zinc-500">
                    Vence:{" "}
                    {shop.planExpiry ? (
                      <span
                        className={
                          planExpired
                            ? "font-medium text-red-600"
                            : "text-zinc-600"
                        }
                      >
                        {formatDate(shop.planExpiry)}
                        {planExpired && " (vencido)"}
                        {!planExpired &&
                          planDaysLeft !== null &&
                          ` (${planDaysLeft} dias)`}
                      </span>
                    ) : (
                      "-"
                    )}
                  </p>
                </div>
                {shop.active ? (
                  <Badge className="bg-emerald-100 text-emerald-700">
                    Activa
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-700">Inactiva</Badge>
                )}
              </div>
            </div>

            {/* Subscription MP */}
            {shop.subscription && (
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      Suscripcion automatica MP
                    </p>
                    <p className="text-xs text-zinc-500">
                      Preapproval: {shop.subscription.preapprovalId}
                    </p>
                    {shop.subscription.nextChargeDate && (
                      <p className="text-xs text-zinc-500">
                        Proximo cobro:{" "}
                        {formatDate(shop.subscription.nextChargeDate)}
                      </p>
                    )}
                  </div>
                  <Badge
                    className={
                      shop.subscription.status === "authorized"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-zinc-100 text-zinc-600"
                    }
                  >
                    {shop.subscription.status}
                  </Badge>
                </div>
              </div>
            )}

            {/* Billing events */}
            {shop.billingEvents.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Historial de facturacion
                </p>
                <div className="space-y-1">
                  {shop.billingEvents.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="text-zinc-700">{e.eventType}</span>
                      </div>
                      <span className="text-xs text-zinc-500">
                        {formatDateTime(e.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </AccordionSection>

        {/* Turnos recientes */}
        <AccordionSection
          title="Turnos recientes"
          icon={Calendar}
          badge={
            <Badge className="bg-zinc-100 text-zinc-600">
              {shop.recentAppointments.length}
            </Badge>
          }
        >
          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Servicio</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {shop.recentAppointments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-zinc-500"
                    >
                      Sin turnos recientes
                    </td>
                  </tr>
                ) : (
                  shop.recentAppointments.map((a) => {
                    const statusBadge =
                      STATUS_BADGES[a.status] || STATUS_BADGES.scheduled;
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-zinc-100 last:border-0"
                      >
                        <td className="px-3 py-2 font-medium text-zinc-900">
                          {a.customerName}
                        </td>
                        <td className="px-3 py-2 text-zinc-600">
                          {a.serviceName}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-500">
                          {formatDateTime(a.startTime)}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-600">
                          {formatCurrency(a.price)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge className={statusBadge.className}>
                            {statusBadge.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </AccordionSection>

        {/* Logs de Mercado Pago */}
        <AccordionSection
          title="Logs de Mercado Pago"
          icon={Zap}
          badge={
            <Badge className="bg-zinc-100 text-zinc-600">
              {shop.mpLogs.length}
            </Badge>
          }
        >
          {shop.mpLogs.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">Sin logs</p>
          ) : (
            <div className="space-y-1">
              {shop.mpLogs.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="text-zinc-700">{l.eventType}</span>
                    {l.mpPreferenceId && (
                      <span className="font-mono text-xs text-zinc-400">
                        pref:{l.mpPreferenceId.slice(0, 12)}...
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500">
                    {formatDateTime(l.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </AccordionSection>
      </div>
    </div>
  );
}
