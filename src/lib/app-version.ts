import packageJson from "../../package.json";

export const APP_VERSION = packageJson.version;

export const RELEASE_NOTES_TITLE = `Notas de version v${APP_VERSION}`;

export const RELEASE_NOTES_ITEMS: string[] = [
  "Fortalecimos el login con Google y el callback OAuth para evitar redirecciones incorrectas y errores de acceso admin.",
  "Extendimos el trial a 15 dias y aplicamos la politica de un solo trial por cuenta en la primera tienda.",
  "Mejoramos el panel admin con nuevos KPIs, metricas por rubro, top negocios y tendencias comparativas 7/30/90.",
  "Activamos sonido y vibracion en acciones clave del dashboard, con control para silenciar desde el menu.",
  "Actualizamos favicon e iconos de marca en toda la app para una identidad visual mas consistente.",
  "Corregimos modales para que no se cierren por accidente al seleccionar texto o hacer drag en mobile.",
  "Mejoramos la vista previa de templates (/book), corregimos seleccion de skins y renovamos miniaturas de estilo.",
  "Agregamos busqueda global Ctrl+K con sinonimos por rubro, tolerancia a typos y mejor ranking de resultados.",
  "Desactivar animaciones ahora corta practicamente todas las animaciones CSS y Framer Motion en toda la plataforma.",
  "La seccion de turnos ahora muestra paginacion real: 10 por pagina con navegacion para ver todos.",
];
