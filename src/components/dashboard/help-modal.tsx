"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleHelp, CalendarDays, Users, Scissors, UserRound, Wallet, Package, Gift, Store, CreditCard, LayoutDashboard, ChevronDown, ArrowLeftRight, Download } from "lucide-react";
import BaseModal from "@/components/ui/modal";
import { openGuideModal } from "@/components/dashboard/guide-modal";

type HelpSection = {
  icon: typeof CircleHelp;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
};

const HELP_SECTIONS: HelpSection[] = [
  {
    icon: LayoutDashboard,
    title: "Panel Principal",
    description:
      "Es tu pantalla de inicio, lo primero que ves al entrar a Klip. Acá tenés un resumen completo de tu negocio en tiempo real.\n\n" +
      "Las tarjetas superiores muestran los datos clave del día: cantidad de turnos programados para hoy, ingresos del día (suma de todos los cobros registrados), cantidad de nuevos clientes que te reservaron por primera vez y los servicios que más se vendieron esta semana.\n\n" +
      "Si hacés clic en cualquiera de esas tarjetas, te lleva directamente a la sección correspondiente (calendario, caja, clientes o servicios).\n\n" +
      "El gráfico de barras semanal muestra la facturación de los últimos 7 días para que veas tendencias: si un día facturaste más o menos que otros, y cómo viene la semana.\n\n" +
      "Si tenés el plan activo y datos suficientes, Klip también te muestra un \"Score de Salud\" del negocio (de 0 a 100) que combina facturación, regularidad de turnos y fidelización de clientes. Un score alto significa que tu negocio está bien organizado y creciendo.\n\n" +
      "Las alertas de IA aparecen arriba del gráfico con recomendaciones automáticas basadas en tus datos: si hay mucho stock bajo, si hay turnos por confirmar, si la caja no cuadra, etc.",
  },
  {
    icon: CalendarDays,
    title: "Calendario",
    description:
      "Es el corazón de Klip. Acá organizás todos los turnos de tu negocio.\n\n" +
      "Para crear un turno nuevo, hacé clic en cualquier celda vacía del calendario. Se abre un formulario donde elegís: el cliente (o escribís el nombre si es nuevo), el servicio que quiere, el empleado que lo va a atender y la fecha/hora. Al guardar, el turno queda registrado y el cliente puede recibir un recordatorio automático por WhatsApp.\n\n" +
      "Para ver o editar un turno existente, hacé clic directamente sobre él. Se abre el detalle donde podés cambiar cualquier cosa: mover la hora, cambiar el servicio, asignar otro empleado, marcarlo como completado, cancelado, o como \"no se presentó\" (no-show).\n\n" +
      "Los filtros de la parte superior te permiten ver solo los turnos de un empleado en particular, o filtrar por estado: pendientes, confirmados, completados, cancelados. Esto es útil cuando tenés mucha agenda y querés ver solo lo que te importa.\n\n" +
      "Podés alternar entre vista diaria y semanal usando las pestañas de arriba a la derecha. La vista semanal es ideal para ver la ocupación general de la semana de un vistazo.\n\n" +
      "Los colores de cada turno indican su estado: azul para confirmados, amarillo para pendientes de pago, verde para completados, rojo para cancelados. Si un turno está pagado con Mercado Pago, tiene un ícono especial.\n\n" +
      "Si tenés varios locales, usá el selector de la parte superior para cambiar entre agendas de cada local.",
  },
  {
    icon: Users,
    title: "Clientes",
    description:
      "Acá gestionás toda la base de datos de tus clientes. Cada persona que te reserva queda registrada automáticamente.\n\n" +
      "En la lista principal ves todos tus clientes ordenados por nombre. Podés buscar cualquiera escribiendo su nombre o número de teléfono en el buscador de arriba.\n\n" +
      "Al hacer clic en un cliente, se abre su ficha completa con toda la información:\n" +
      "• Datos de contacto: nombre, teléfono, email y fecha de cumpleaños.\n" +
      "• Historial de turnos: todos los turnos que tuvo, fechas, servicios y con qué empleado.\n" +
      "• Resumen de gasto: cuánto gastó en total desde su primera visita.\n" +
      "• Frecuencia: cada cuánto tiempo viene, cuántas veces vino y si es un cliente recurrente o esporádico.\n" +
      "• Puntos de fidelización: si tu negocio usa el sistema de puntos, acá ves cuántos acumuló y si tiene recompensas disponibles.\n\n" +
      "Desde la ficha podés editar los datos del cliente, contactarlo directamente por WhatsApp, o ver su próxima reserva.\n\n" +
      "Para agregar un cliente manualmente, usá el botón \"+ Cliente\" arriba a la derecha. Es recomendable siempre tener el teléfono completo con código de área, porque Klip usa ese número para enviar recordatorios automáticos.\n\n" +
      "Si un cliente tiene el checkbox de \"cumpleaños\" configurado, Klip te avisa cuando está por cumplir años para que le mandes un saludo o le ofrezcas un descuento especial.",
  },
  {
    icon: Scissors,
    title: "Servicios",
    description:
      "Acá cargás todos los servicios que ofrecés en tu negocio. Cada turno que se crea está vinculado a un servicio.\n\n" +
      "Para cada servicio configurás:\n" +
      "• Nombre: como lo conocés vos y tus clientes (ej: \"Corte de caballero\", \"Tinte\", \"Barba\").\n" +
      "• Precio: lo que cobra el cliente. Este precio se usa para generar la factura y para los reportes de ingresos.\n" +
      "• Duración: cuántos minutos dura el servicio. Esto es clave porque el calendario usa esta duración para bloquear el tiempo correcto en la agenda del empleado.\n" +
      "• Empleados asignados: a qué personal puede atender este servicio. Si solo un empleado sabe hacer un servicio, lo asignás solo a él. Si varios lo hacen, los seleccionás a todos.\n\n" +
      "Para crear un servicio nuevo, usá el botón \"+ Servicio\". Completá los datos y guardalo.\n\n" +
      "Para editar, hacé clic en el servicio en la lista. Podés cambiar precio, duración o empleados en cualquier momento. Si un servicio ya no lo ofrecés, no lo elimines (porque perderías el historial de turnos asociados): simplemente desactivalo y no volverá a aparecer al crear turnos nuevos.\n\n" +
      "Si tu negocio tiene opciones de personalización (por ejemplo, largo del pelo, tipo de tinte), Klip te permite agregar campos extra al servicio para que el cliente elija al reservar.",
  },
  {
    icon: UserRound,
    title: "Personal",
    description:
      "Acá gestionás todo tu equipo de trabajo. Cada empleado tiene su propia ficha con configuración personalizada.\n\n" +
      "Para cada empleado cargás:\n" +
      "• Nombre y apodo: el nombre que se muestra en el calendario y en la página de reservas.\n" +
      "• Rol: owner (dueño) o staff (empleado). El dueño tiene acceso a todo, incluyendo configuración de negocio y reportes. El staff solo ve lo que le corresponde.\n" +
      "• Color identificador: cada empleado tiene un color asignado que aparece en los turnos del calendario para distinguir rápidamente a quién le toca cada turno.\n" +
      "• Días y horarios de trabajo: los días que trabaja y su horario de entrada y salida. Esto define la disponibilidad que se muestra en la página de reservas pública.\n" +
      "• Comisiones: podés configurar qué porcentaje del precio de cada servicio se lleva el empleado. Por ejemplo, si un corte cuesta $5.000 y el empleado tiene 50% de comisión, se le acreditan $2.500.\n\n" +
      "Para agregar un empleado nuevo, usá el botón \"+ Empleado\". Le enviás una invitación por email y él acepta para crear su cuenta.\n\n" +
      "Si un empleado se fue del local, no lo elimines (porque perderías su historial de turnos y comisiones). En su lugar, desactivalo y no volverá a aparecer en la agenda ni en la página de reservas.\n\n" +
      "El calendario de cada empleado se puede ver desde \"Mi Horario\" en el menú lateral (solo disponible para empleados, no para el dueño).",
  },
  {
    icon: Wallet,
    title: "Caja",
    description:
      "La caja es el registro de todos los movimientos de dinero de tu negocio. Acá controlás de dónde viene y a dónde va cada peso.\n\n" +
      "Al iniciar tu jornada, tocá \"Abrir caja\". Esto registra el momento exacto en que empezás a operar y el saldo inicial (si tenés plata de la jornada anterior o empezás de cero).\n\n" +
      "Durante el día, cada vez que cobrás un turno o registrás un gasto, se suma o resta de la caja automáticamente. También podés agregar movimientos manuales con \"+ Movimiento\": desde un gasto de limpieza hasta un ingreso extra por venta de producto.\n\n" +
      "Los métodos de pago disponibles son: efectivo, débito, crédito, transferencia bancaria y Mercado Pago. Elegí el método correcto al registrar cada movimiento, porque los reportes de finanzas usan esa información para desglosar por tipo de cobro.\n\n" +
      "Al final del día (o cuando quieras), tocá \"Cerrar caja\". Klip te muestra un resumen con:\n" +
      "• Total de ingresos (desglosado por método de pago).\n" +
      "• Total de gastos.\n" +
      "• Saldo final esperado.\n" +
      "• Diferencia entre lo esperado y lo contado (si contás el efectivo manualmente).\n\n" +
      "Si tenés empleados con comisiones, al cerrar caja se calcula automáticamente cuánto le corresponde a cada uno según los turnos que atendió.\n\n" +
      "El historial de cierres queda guardado permanentemente, así que podés ver reportes de días anteriores y comparar la facturación entre semanas o meses.",
  },
  {
    icon: ArrowLeftRight,
    title: "Transferencias",
    description:
      "Cuando un cliente elige pagar por transferencia bancaria en la reserva online, Klip genera automáticamente una reserva pendiente con todos los datos necesarios para que el cliente pueda transferir.\n\n" +
      "El proceso funciona así:\n" +
      "1. El cliente elige \"Transferencia\" como método de pago al reservar.\n" +
      "2. Klip le muestra (y le envía por WhatsApp) los datos de tu cuenta: alias, CVU/CBU y nombre del banco. Estos datos se configuran en la sección \"Mi Negocio\".\n" +
      "3. El cliente transfiere el dinero y te avisa (o sube el comprobante).\n" +
      "4. Desde acá, en la sección de Transferencias, vos revisás y confirmás o rechazás cada una.\n\n" +
      "Las transferencias pendientes tienen un tiempo de expiración de 12 horas. Si el cliente no transfiere en ese plazo, la reserva se cancela automáticamente y el turno vuelve a estar disponible para otros clientes.\n\n" +
      "En la lista de transferencias ves: nombre del cliente, monto, fecha de la reserva, estado (pendiente, confirmada o rechazada) y un botón para confirmar o rechazar.\n\n" +
      "Si una transferencia se rechaza, el cliente recibe una notificación y el turno se libera.\n\n" +
      "Para configurar los datos de transferencia de tu negocio, andá a \"Mi Negocio\" > \"Datos de transferencia\".",
  },
  {
    icon: Package,
    title: "Stock",
    description:
      "El control de inventario te permite llevar registro de todos los productos que vendés en tu negocio: shampoos, cremas, tintes, herramientas, etc.\n\n" +
      "Para cada producto cargás:\n" +
      "• Nombre: como lo identificás vos (ej: \"Shampoo Head & Shoulders 400ml\").\n" +
      "• Precio de compra: cuánto te cuesta a vos (para calcular márgenes de ganancia).\n" +
      "• Precio de venta: cuánto le cobrás al cliente.\n" +
      "• Cantidad disponible: cuántas unidades tenés en stock.\n" +
      "• Proveedor: quién te lo vende (para saber a quién contactar cuando necesitás reponer).\n\n" +
      "Activá la alerta de stock mínimo: cuando las unidades bajan de cierto número, Klip te avisa automáticamente en el panel de notificaciones y con un punto rojo en el menú lateral.\n\n" +
      "Los productos con stock bajo se marcan en rojo en la lista para que los veas de un vistazo.\n\n" +
      "Si vendés un servicio que usa un producto (ej: tinte), podés vincularlo para que cada vez que se complete un turno con ese servicio, se descuente automáticamente la cantidad de stock usada.\n\n" +
      "El historial de movimientos de stock queda registrado: cada vez que agregás, quitás o vendés un producto, queda la fecha y el motivo. Así siempre sabés qué pasó con cada producto.",
  },
  {
    icon: Gift,
    title: "Fidelización",
    description:
      "La fidelización es el sistema de recompensas para que tus clientes sigan volviendo. Cuando un cliente acumula cierta cantidad de visitas o gasto, recibe beneficios que lo incentivan a reservar de nuevo.\n\n" +
      "Tipos de recompensa que podés crear:\n" +
      "• Recompensa por visitas: después de una cantidad determinada de turnos completados, el cliente recibe un descuento o un servicio gratis. Ejemplo: \"En la 5ta visita, regalamos un acondicionamiento\".\n" +
      "• Recompensa por gasto acumulado: cuando el cliente supera cierto monto total en tu negocio, recibe una recompensa. Ejemplo: \"Al gastar $50.000, tenés 20% de descuento en tu próximo corte\".\n" +
      "• Promociones temporales: creás una promoción con fecha de inicio y fin que se aplica automáticamente. Ejemplo: \"Esta semana, 2x1 en barba para nuevos clientes\".\n" +
      "• Vouchers: generás cupones de regalo que podés regalar a clientes especiales o usar en campañas de marketing.\n\n" +
      "Los clientes pueden ver su progreso (cuántas visitas llevan, cuánto les falta para la próxima recompensa) desde su panel de reservas. Esto los motiva a seguir viniendo.\n\n" +
      "Desde la sección de clientes también ves quiénes tienen recompensas disponibles para canjear, y podés registrar el canje manualmente desde la ficha del cliente.",
  },
  {
    icon: Store,
    title: "Mi Negocio",
    description:
      "Acá configurás todo lo que define a tu negocio. Es la sección más importante para que Klip funcione correctamente.\n\n" +
      "Datos generales:\n" +
      "• Nombre del negocio: es lo que aparece en la página de reservas, en los recordatorios de WhatsApp y en los comprobantes.\n" +
      "• Dirección: tu dirección física, que se muestra en la página de reservas para que el cliente sepa dónde ir.\n" +
      "• Teléfono y redes sociales: datos de contacto que aparecen en tu página pública.\n" +
      "• Logo: subí el logo de tu negocio para que se vea profesional en la página de reservas y en los mensajes.\n\n" +
      "Horarios de atención:\n" +
      "Configurás los días y horarios que tu negocio está abierto. Por ejemplo: Lunes a Viernes de 9:00 a 19:00, Sábados de 9:00 a 14:00. Los domingos y feriados los dejás marcados como cerrado. Estos horarios se usan para:\n" +
      "• La página de reservas: el cliente solo ve horarios disponibles dentro de tu horario de atención.\n" +
      "• La agenda del calendario: los días cerrados se marcan automáticamente como no disponibles.\n\n" +
      "Datos de transferencia bancaria:\n" +
      "Si aceptás pagos por transferencia, cargá acá tu alias, CVU/CBU y banco. Esta información se le muestra al cliente cuando elige pagar por transferencia.\n\n" +
      "Industria:\n" +
      "Elegí tu rubro (peluquería, barbería, estética, etc.) para que Klip adapte los términos y las sugerencias a tu negocio. Por ejemplo, si elegís \"barbería\", los servicios se llaman \"barbería\" en vez de \"salón\".",
  },
  {
    icon: CreditCard,
    title: "Suscripción",
    description:
      "Acá manageás tu plan de Klip. Tu plan te da acceso a todas las funcionalidades del sistema.\n\n" +
      "En esta sección ves:\n" +
      "• Plan actual: el nombre del plan que tenés contratado.\n" +
      "• Días restantes: cuántos días te quedan de suscripción antes de que venza.\n" +
      "• Fecha de próximo vencimiento: la fecha exacta en que se renueva o vence tu plan.\n" +
      "• Último pago: cuándo fue tu último pago y cuánto fue.\n\n" +
      "Si tu plan está por vencer, aparece un botón para renovar. Los métodos de pago disponibles son transferencia bancaria y Mercado Pago (con tarjeta de débito, crédito o QR).\n\n" +
      "Si tu plan vence:\n" +
      "• Tenés 2 días de cortesía donde tu cuenta sigue funcionando normalmente para que puedas renovar sin perder nada.\n" +
      "• Después de esos 2 días, tu cuenta se pausa: no podés crear turnos nuevos ni enviar recordatorios, pero tus datos no se borran.\n" +
      "• Si renovás dentro de los 30 días después del vencimiento, recuperás todo exactamente como lo dejaste.\n" +
      "• Si pasan más de 30 días, los datos se eliminan permanentemente.\n\n" +
      "Si sos dueño de varios locales, cada local tiene su propia suscripción independiente. Podés gestionar todas desde el selector de locales arriba a la izquierda.",
  },
  {
    icon: Download,
    title: "Instalar Klip",
    description:
      "Klip es una aplicación web progresiva (PWA), lo que significa que podés instalarla directamente en tu dispositivo sin pasar por ninguna tienda de apps.\n\n" +
      "Una vez instalada, Klip se abre como una app nativa: tiene su propio ícono en la pantalla de inicio, ocupa toda la pantalla y funciona sin la barra de direcciones del navegador.\n\n" +
      "Los pasos varían según tu dispositivo. Tocá el botón de abajo para ver la guía visual completa para tu plataforma.",
    action: { label: "Ver guía de instalación", onClick: openGuideModal },
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
    <BaseModal open={open} onClose={handleClose} title="Ayuda" subtitle="Todo lo que necesitás saber para usar Klip." maxWidth="lg" icon={<CircleHelp className="h-5 w-5 text-[#0071E3]" />}>
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
                      <div className="px-4 pb-3 pt-0.5 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed whitespace-pre-line">
                        {section.description}
                      </div>
                      {section.action && (
                        <div className="px-4 pb-3">
                          <button
                            type="button"
                            onClick={section.action.onClick}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2 text-sm font-medium text-white hover:bg-[#0071E3]/90 transition-colors cursor-pointer"
                          >
                            <Download className="h-4 w-4" />
                            {section.action.label}
                          </button>
                        </div>
                      )}
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
