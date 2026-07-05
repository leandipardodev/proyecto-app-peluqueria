import packageJson from "../../package.json";

export const APP_VERSION = packageJson.version;

export const RELEASE_NOTES_TITLE = `Novedades v${APP_VERSION}`;

export const RELEASE_NOTES_ITEMS: string[] = [
  // Funcionalidades nuevas
  "Notificaciones en el header con panel dropdown de turnos.",
  "Drag & drop para mover turnos en el calendario.",
  "Stock rediseñado con tarjetas en grid y filtros de orden.",
  "Auto-confirmación de turnos pasada su hora.",
  "Carga múltiple de productos al stock.",
  "Mini tienda personalizable con skins, drag & drop y preview en vivo.",
  "Tecla ESC cierra modales; Enter navega entre campos en multiturno, Ctrl+Enter crea.",
  // Correcciones
  "Corregidos turnos fantasmas cancelados que aparecían en el calendario.",
  "Conflictos de horario ahora respetan el profesional asignado.",
  "Crash en preview de la minitienda corregido.",
  "Duplicados en catálogo de secciones al renombrar categorías.",
  "Overflow horizontal en /book y minitienda solucionado.",
  "Auto-save de horarios con dirty tracking para no perder cambios.",
  "Calendario carga 21 días (era 49) y dashboard 6 meses para mejor rendimiento.",
  "Suscripciones Realtime con cooldown para evitar refrescos infinitos.",
  "Error .single() reemplazado por .maybeSingle() en consultas para evitar crashes.",
  "Scroll horizontal en categorías de servicios con rueda del mouse.",
  "Título cortado en /book corregido con break-words.",
  "Texto invisible al arrastrar categoría en minitienda corregido.",
  "Fix en drag direction change lag y transiciones.",
  "Corregido error en fetchPublicAvailableSlots y validación de teléfono server-side.",
  "Turnos recurrentes ahora funcionan correctamente.",
  "Pago con Mercado Pago redirige correctamente (sin error Bricks.create).",
  "Filtros de pending_bookings y timezone corregidos para que los slots disponibles se muestren bien.",
  "Sidebar logout oculto por overflow en mobile corregido.",
  // UI/UX
  "Títulos de secciones más grandes (mismo estilo que Calendario).",
  "Botones con animación press (scale 0.96) en toda la app.",
  "Feedback táctil (haptic) en Android en todas las interacciones.",
  "Transiciones suaves al cambiar entre modo claro y oscuro.",
  "Sidebar responsive con logout visible en mobile.",
  "Esquinas rectas en cards del dashboard.",
  "Modo bajo rendimiento automático en dispositivos de gama baja.",
  "Presionar ESC cierra modales y scroll lock en mobile.",
  "Drag & drop en minitienda con long-press 2s en mobile.",
];
