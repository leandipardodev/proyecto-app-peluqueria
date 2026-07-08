"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleHelp, CalendarDays, Users, Scissors, UserRound, Wallet, Package, Gift, Store, CreditCard, LayoutDashboard, ChevronDown } from "lucide-react";
import BaseModal from "@/components/ui/modal";

const HELP_SECTIONS = [
  {
    icon: LayoutDashboard,
    title: "Panel Principal",
    description: "Vista general del negocio. Las cards muestran: turnos de hoy, ingresos del día, nuevos clientes y servicios más vendidos. Hacé clic en cada card para ir directo a esa sección. El gráfico semanal muestra la facturación de los últimos 7 días.",
  },
  {
    icon: CalendarDays,
    title: "Calendario",
    description: "Hacé clic en cualquier horario vacío para crear un turno. Usá los filtros de arriba para ver turnos por personal o por estado (pendiente, confirmado, cancelado). Para editar un turno, hacé clic sobre él. Podés cambiar el servicio, el horario, el staff y el estado de pago desde la ventana que se abre. Vista por día o semana con las pestañas de arriba a la derecha.",
  },
  {
    icon: Users,
    title: "Clientes",
    description: "Buscá clientes por nombre o teléfono. Hacé clic en uno para ver su ficha completa: datos de contacto, historial de visitas, servicios que más saca, gasto total y puntos de fidelización. Desde la ficha podés editar sus datos, ver el historial de turnos o contactarlo directamente. Usá el botón \"+ Cliente\" para agregar uno nuevo.",
  },
  {
    icon: Scissors,
    title: "Servicios",
    description: "Lista completa de servicios que ofrecés. Cada servicio tiene: nombre, precio, duración y a qué personal está asignado. Para crear uno nuevo usá el botón \"+ Servicio\". Puedés editar el precio y la duración directamente desde la lista. Los servicios que no se usan se pueden ocultar (no eliminar) para mantener el historial.",
  },
  {
    icon: UserRound,
    title: "Personal",
    description: "Gestioná tu equipo. Cada empleado tiene: nombre, rol, días y horarios de trabajo, y color identificador en el calendario. Desde la ficha de cada uno podés asignar comisiones por servicio (ej: 50% para el peluquero). Usá el botón \"+ Empleado\" para agregar. Podés desactivar empleados sin borrar su historial.",
  },
  {
    icon: Wallet,
    title: "Caja",
    description: "Registrá todos los movimientos del día. Botón \"Abrir caja\" al iniciar el turno. Para registrar un ingreso o gasto usá \"+ Movimiento\". Los métodos de pago disponibles: efectivo, débito, crédito, transferencia y Mercado Pago. Al final del día usá \"Cerrar caja\" para ver el resumen con totales y diferencias.",
  },
  {
    icon: Package,
    title: "Stock",
    description: "Control de inventario. Agregá productos con nombre, precio de compra, precio de venta, cantidad y proveedor. Activá la alerta de stock mínimo para recibir avisos cuando queden pocas unidades. Los productos con stock bajo se marcan en rojo automáticamente.",
  },
  {
    icon: Gift,
    title: "Fidelización",
    description: "Programá promociones para premiar clientes frecuentes. Podés crear: descuento por cantidad de visitas (ej: 20% en la 5ta visita), promociones por tiempo limitado, o regalar un servicio después de cierto gasto acumulado. Los clientes ven su progreso en el panel del cliente.",
  },
  {
    icon: Store,
    title: "Mi Negocio",
    description: "Toda la configuración de tu local. Editá: nombre, dirección, teléfono, redes sociales, sitio web, horarios de atención y días laborales. Subí el logo de tu negocio para que aparezca en la página de reservas pública y en los comprobantes.",
  },
  {
    icon: CreditCard,
    title: "Suscripción",
    description: "Acá manejás tu plan. Podés ver los días restantes, la fecha del último pago y el plan actual. Si estás por vencer, el botón te lleva a pagar. Los métodos de pago disponibles son transferencia y Mercado Pago. Si el plan vence, tenés 2 días de cortesía para renovar sin perder datos.",
  },
];

export default function HelpModal() {
  const [open, setOpen] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }
    window.addEventListener("dashboard:open-help", handleOpen as EventListener);
    return () => window.removeEventListener("dashboard:open-help", handleOpen as EventListener);
  }, []);

  useEffect(() => {
    if (open) {
      setExpandedIndex(null);
    }
  }, [open]);

  function handleClose() {
    setOpen(false);
  }

  function toggleSection(index: number) {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }

  return (
    <BaseModal open={open} onClose={handleClose} title="Ayuda" subtitle="Manual rápido de Klip." maxWidth="lg" icon={<CircleHelp className="h-5 w-5 text-[#0071E3]" />}>
      <div className="overflow-y-auto px-5 pb-5 flex-1">
        <div className="space-y-1">
          {HELP_SECTIONS.map((section, index) => {
            const isExpanded = expandedIndex === index;
            const Icon = section.icon;
            return (
              <div
                key={section.title}
                className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(index)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"
                >
                  <Icon className="h-4 w-4 text-zinc-400 shrink-0" />
                  <span className="flex-1">{section.title}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="px-4 pb-3 pt-0.5 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {section.description}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </BaseModal>
  );
}
