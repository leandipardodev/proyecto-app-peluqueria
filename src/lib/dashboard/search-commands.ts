export type CommandNav = { id: string; kind: "nav"; label: string; hint: string; to: string; keywords: string[] };
export type CommandAction = { id: string; kind: "action"; label: string; hint: string; action: "toggleTheme" | "togglePerformance" | "logout"; keywords: string[] };
export type CommandData = { id: string; kind: "data"; value: import("@/lib/dashboard/global-search-actions").OmniSearchResult };
export type CommandItem = CommandNav | CommandAction | CommandData;

export const NAV_COMMANDS: CommandNav[] = [
  { id: "nav-home", kind: "nav", label: "Ir a Inicio", hint: "Resumen del negocio", to: "/dashboard", keywords: ["inicio", "home", "panel", "dashboard", "resumen", "principal", "portada", "tablero", "estadisticas", "metricas", "metrcas"] },
  { id: "nav-calendar", kind: "nav", label: "Ir a Calendario", hint: "Agenda de turnos", to: "/dashboard/calendar", keywords: ["calendario", "agenda", "turnos", "citas", "reservas", "horarios", "proximos", "proximo", "agendar", "agendaa", "calendaario"] },
  { id: "nav-cash", kind: "nav", label: "Ir a Caja", hint: "Ingresos, egresos y liquidaciones", to: "/dashboard/finances", keywords: ["caja", "finanzas", "plata", "dinero", "cobros", "gastos", "ingresos", "egresos", "movimientos", "arqueo", "cierres", "liquidaciones", "comisiones", "balance", "contabilidad", "tesoreria"] },
  { id: "nav-stock", kind: "nav", label: "Ir a Stock", hint: "Inventario y productos", to: "/dashboard/inventory", keywords: ["stock", "inventario", "productos", "insumos", "deposito", "existencias", "reposicion", "bajo stock", "almacen", "almacen", "materiales", "inventrio"] },
  { id: "nav-marketing", kind: "nav", label: "Ir a Marketing", hint: "Fidelizacion, canjes y vouchers", to: "/dashboard/fidelizacion", keywords: ["marketing", "fidelizacion", "fidelidad", "puntos", "canjes", "voucher", "vouchers", "descuentos", "promos", "cupones", "campanas", "campanias", "cumpleanos", "retencion"] },
  { id: "nav-customers", kind: "nav", label: "Ir a __CUSTOMERS_LABEL__", hint: "Base de clientes", to: "/dashboard/customers", keywords: ["clientes", "clientela", "contactos", "whatsapp", "telefonos", "historial", "ficha cliente", "pacientes", "paciente", "usuario", "usuarios", "clientse", "clietnes"] },
  { id: "nav-business", kind: "nav", label: "Ir a Mi Negocio", hint: "Datos, horarios y cobros", to: "/dashboard/business", keywords: ["mi negocio", "negocio", "local", "empresa", "perfil negocio", "datos publicos", "horarios", "mercado pago", "cobro", "seña", "sena", "whatsapp template", "configuracion", "personalizacion", "branding", "book"] },
  { id: "nav-services", kind: "nav", label: "Ir a __SERVICES_LABEL__", hint: "Catalogo y duraciones", to: "/dashboard/services", keywords: ["servicios", "catalogo", "precios", "duracion", "duraciones", "barba", "corte", "tratamientos", "sesiones", "menu", "prestaciones", "servicois"] },
  { id: "nav-staff", kind: "nav", label: "Ir a __STAFF_LABEL__", hint: "Equipo y roles", to: "/dashboard/staff", keywords: ["staff", "equipo", "empleados", "barberos", "roles", "personal", "terapeutas", "profesionales", "colaboradores", "agenda staff", "staf", "empleado"] },
  { id: "nav-billing", kind: "nav", label: "Ir a Pagos", hint: "Pagar mensualidad", to: "/billing-required", keywords: ["pago", "pagos", "mensualidad", "membresia", "suscripcion", "renovar", "plan", "vencimiento", "factura", "abono", "precio", "cobro plan"] },
];

export const ACTION_COMMANDS: CommandAction[] = [
  { id: "act-theme", kind: "action", label: "Cambiar tema", hint: "oscuro o claro", action: "toggleTheme", keywords: ["tema", "oscuro", "claro", "dark", "light", "colores", "apariencia", "modo noche", "modo dia", "paleta", "contraste"] },
  { id: "act-performance", kind: "action", label: "Desactivar animaciones", hint: "interfaz estatica", action: "togglePerformance", keywords: ["rendimiento", "performance", "lag", "animaciones", "fluidez", "rapido", "optimizar", "modo liviano", "bateria", "andar lento", "traba", "sin animaciones", "estatico", "estática"] },
  { id: "act-logout", kind: "action", label: "Cerrar sesion", hint: "salir", action: "logout", keywords: ["cerrar", "salir", "logout", "desconectar", "terminar sesion", "salirme", "desloguear"] },
];
