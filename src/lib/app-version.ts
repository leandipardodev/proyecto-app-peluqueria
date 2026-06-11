import packageJson from "../../package.json";

export const APP_VERSION = packageJson.version;

export const RELEASE_NOTES_TITLE = `Correcciones varias v${APP_VERSION}`;

export const RELEASE_NOTES_ITEMS: string[] = [
  "Ya no pedimos email ni teléfono obligatorio al agregar un turno.",
  "Si el cliente no aparece en la búsqueda, ofrecemos agregarlo con un solo clic.",
  "Cada profesional tiene su propio horario configurable desde la sección Personal.",
  "Cada profesional puede tener servicios asignados individualmente desde cada servicio.",
  "En /book, los profesionales se muestran como tarjetas con foto, descripción, Instagram y WhatsApp.",
  "Corregido un bug que mostraba turnos disponibles cuando en realidad no había (filtros de pending_bookings, timezone, etc.).",
  "Cuando elegís 'Sin preferencia' se asigna automáticamente un profesional disponible.",
  "Modales rediseñados con mejor estructura, fondo sólido y botón de cerrar.",
];
