/* =============================================================================
 * DATOS DE LA WEB DE TUTORIALES
 * =============================================================================
 * Para AGRAGAR / QUITAR videos, edita el array TUTORIALS de abajo: cada objeto
 * entre llaves es un video. La cantidad de videos y el grid se adaptan solos.
 *
 * Como agregar un video:
 *   1. Subi el video a YouTube (publico o "no listado").
 *   2. Copia el ID de la URL. Ej: https://www.youtube.com/watch?v=AbC123xYz
 *      -> el ID es "AbC123xYz".
 *   3. Pega ese ID en el campo youtubeId del video nuevo.
 *   4. (Opcional) Ponele una miniatura propia en /public/tutoriales y pegala en
 *      `thumbnail`. Si lo dejas vacio se usa la miniatura de YouTube.
 *   5. (Opcional) importance: 0 a 100. Es la barra de importancia de la card.
 *      Sin ese campo la barra no se muestra.
 *
 * Si youtubeId esta vacio (""), la card muestra una tapa con degradado y el
 * texto "Proximamente" (no se puede reproducir hasta que cargues el ID).
 * =============================================================================
 */

/* -----------------------------------------------------------------------------
 * CATEGORIAS
 * La primera (id: "todos") es el filtro que muestra todo junto.
 * Para crear una categoria nueva:
 *   1. Copia una linea dentro de CATEGORIES y cambia el id (sin espacios, en
 *      minusculas) y el label (texto visible del boton).
 *   2. En TUTORIALS usa el mismo id en el campo `category` de los videos.
 *   3. `cover` es el degradado de tapa para videos sin youtubeId.
 *      `tag` son los colores del badge (texto de categoria) sobre la card.
 * ---------------------------------------------------------------------------
 */
export type TutorialCategoryId =
  | "primeros-pasos"
  | "agenda"
  | "cobros"
  | "clientes"
  | "inventario"
  | "finanzas";

export type TutorialCategory = {
  id: TutorialCategoryId | "todos";
  label: string;
  cover: string;
  tag: string;
};

export const CATEGORIES: TutorialCategory[] = [
  { id: "todos", label: "Todos", cover: "", tag: "" },
  { id: "primeros-pasos", label: "Primeros pasos", cover: "from-[#1d4ed8]/25 via-[#0ea5e9]/15 to-transparent", tag: "bg-sky-500/15 text-sky-700" },
  { id: "agenda", label: "Agenda y turnos", cover: "from-[#0ea5e9]/25 via-cyan-300/15 to-transparent", tag: "bg-cyan-500/15 text-cyan-700" },
  { id: "cobros", label: "Cobros y pagos", cover: "from-[#6d28d9]/25 via-violet-400/15 to-transparent", tag: "bg-violet-500/15 text-violet-700" },
  { id: "clientes", label: "Clientes", cover: "from-[#059669]/25 via-emerald-300/15 to-transparent", tag: "bg-emerald-500/15 text-emerald-700" },
  { id: "inventario", label: "Inventario", cover: "from-[#d97706]/25 via-amber-300/15 to-transparent", tag: "bg-amber-500/15 text-amber-700" },
  { id: "finanzas", label: "Finanzas", cover: "from-[#db2777]/25 via-pink-300/15 to-transparent", tag: "bg-pink-500/15 text-pink-700" },
];

/* -----------------------------------------------------------------------------
 * VIDEOS / TUTORIALES
 * Fields:
 *   - youtubeId:  ID del video de YouTube (""). Si esta vacio -> "Proximamente".
 *   - title:      Titulo visible de la card.
 *   - description: Descripcion corta que aparece debajo del titulo.
 *   - duration:   Texto de duracion. Es texto libre: "3 min" o "3:35".
 *                 Solo visible cuando hay youtubeId.
 *   - category:   Debe coincidir con un id de CATEGORIES (sin "todos").
 *   - popular:    true muestra el badge "Popular" (opcional, podes omitirlo).
 *   - thumbnail:  Ruta en /public de la miniatura (opcional). Si esta vacio se
 *                 usa la miniatura de YouTube. Ver /public/tutoriales.
 *   - importance: Cuanto conviene mirarlo, de 0 a 100 (opcional). Es la barra
 *                 "Importancia" de la card. Si lo omitis, la barra no se dibuja.
 *                 Escala sugerida: 0-39 opcional, 40-69 recomendado,
 *                 70-89 importante, 90-100 imprescindible.
 * ---------------------------------------------------------------------------
 */
export type Tutorial = {
  youtubeId: string;
  title: string;
  description: string;
  duration: string;
  category: Exclude<TutorialCategoryId, "todos">;
  popular?: boolean;
  thumbnail?: string;
  importance?: number;
};

/** Path dentro de /public de la miniatura de un tutorial. */
export const TUTORIAL_THUMBNAIL_DIR = "/tutoriales";

export const TUTORIALS: Tutorial[] = [
  {
    youtubeId: "AX5nauXYfH4",
    title: "Primeros pasos: configurá tu negocio",
    description: "Alta de local, servicios, horarios y tu pagina publica lista en menos de 10 minutos.",
    duration: "3:35",
    category: "primeros-pasos",
    popular: true,
    thumbnail: `${TUTORIAL_THUMBNAIL_DIR}/configuracion-del-local.webp`,
    importance: 100,
  },
  {
    youtubeId: "vdC7ftPdYzM",
    title: "Profesionales y servicios",
    description: "Carga tu equipo, crea cada servicio con su duracion y precio, y asigna quien lo hace.",
    duration: "11:10",
    category: "primeros-pasos",
    popular: true,
    thumbnail: `${TUTORIAL_THUMBNAIL_DIR}/profesionales-y-servicios.webp`,
    importance: 100,
  },
  {
    youtubeId: "",
    title: "Reservas online con tu link",
    description: "Tu pagina de reservas, como promocionarla y como llegan los turnos a tu agenda.",
    duration: "4 min",
    category: "agenda",
    popular: true,
  },
  {
    youtubeId: "",
    title: "Recordatorios automaticos",
    description: "Activá los recordatorios por WhatsApp y empeza a bajar los ausentismos.",
    duration: "3 min",
    category: "agenda",
    popular: true,
  },
  {
    youtubeId: "",
    title: "Agenda",
    description: "Maneja la jornada del local y los horarios de cada profesional en un solo lugar.",
    duration: "2 min",
    category: "agenda",
  },
  {
    youtubeId: "",
    title: "Pagos online",
    description: "Cobra la seña de cada turno en la reserva y reduci las cancelaciones de ultimo momento.",
    duration: "3 min",
    category: "cobros",
    popular: true,
  },
  {
    youtubeId: "",
    title: "Caja y cierre del dia",
    description: "Controla lo cobrado, transferencias y el estado de caja para no perder dinero.",
    duration: "3 min",
    category: "cobros",
  },
  {
    youtubeId: "",
    title: "Ficha de clientes e historial",
    description: "Sabe que servicio realza cada cliente, cuando vino y lanzale una fidelizacion.",
    duration: "2 min",
    category: "clientes",
  },
  {
    youtubeId: "",
    title: "Programa de fidelizacion",
    description: "Suma puntos, premios y mensajes para que tus clientes vuelvan mas seguido.",
    duration: "4 min",
    category: "clientes",
    popular: true,
  },
  {
    youtubeId: "",
    title: "Tienda e inventario",
    description: "Registra productos, baja stock con cada venta y activá alertas cuando se agote.",
    duration: "3 min",
    category: "inventario",
  },
  {
    youtubeId: "",
    title: "Metricas: lo que importa mirar",
    description: "Turnos, ventas, ausentismo y crecimiento en un panel simple de interpretar.",
    duration: "5 min",
    category: "finanzas",
    popular: true,
  },
];

/* -----------------------------------------------------------------------------
 * BARRA DE IMPORTANCIA
 * Convierte el numero de `importance` (0 a 100) en un valor seguro para pintar
 * y en una etiqueta de texto. Devuelve null cuando el video no tiene
 * importancia cargada, y en ese caso la barra no se dibuja.
 * ---------------------------------------------------------------------------
 */
export type ImportanceTone = {
  value: number;
  label: string;
};

export function resolveImportance(raw: number | undefined): ImportanceTone | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const value = Math.max(0, Math.min(100, Math.round(raw)));
  const label =
    value >= 90 ? "Imprescindible" : value >= 70 ? "Importante" : value >= 40 ? "Recomendado" : "Opcional";
  return { value, label };
}

/* -----------------------------------------------------------------------------
 * MINIATURA
 * Devuelve la miniatura a mostrar: la propia del tutorial si tiene, y si no la
 * de YouTube. Devuelve null si el tutorial todavia no tiene video.
 * ---------------------------------------------------------------------------
 */
export function tutorialThumbnail(tutorial: Tutorial): string | null {
  if (tutorial.youtubeId.trim().length === 0) return null;
  const own = tutorial.thumbnail?.trim();
  if (own) return own;
  return `https://i.ytimg.com/vi/${tutorial.youtubeId}/hqdefault.jpg`;
}

/* -----------------------------------------------------------------------------
 * TEXTOS DE LA PAGINA (badge, hero, botones, seccion final)
 * Editalos aca y se reflejan en toda la web sin tocar el componente.
 * ---------------------------------------------------------------------------
 */
export const TUTORIALS_PAGE = {
  badge: "Centro de ayuda",
  title: "Tutoriales Klip",
  subtitle:
    "Aprende paso a paso a usar cada parte de Klip: agenda, cobros, clientes, inventario y finanzas. Videos cortos para que configures y aproveches todo el sistema.",
  ctaLabel: "Empezar gratis ahora",
  ctaHref: "/register",
  comingSoonLabel: "Proximamente",
  popularLabel: "Popular",
  emptyCategoryLabel: "Todavia no hay videos en esta categoria.",
  importance: {
    title: "Importancia",
    /** Texto para lectores de pantalla de la barra. */
    aria: (value: number) => `Importancia ${value} de 100`,
  },
  /** Reproductor ampliado que se abre al hacer click en una miniatura. */
  player: {
    closeLabel: "Cerrar reproductor",
    listTitle: "En esta lista",
    nextLabel: "Siguiente tutorial",
    prevLabel: "Tutorial anterior",
    playingLabel: "Reproduciendo",
    emptyListLabel: "No hay mas tutoriales en esta categoria.",
    toggleListLabel: "Mostrar u ocultar la lista de tutoriales",
    watchHereLabel: "Este tutorial todavia no esta publicado.",
  },
  finalCta: {
    kicker: "Siguiente paso",
    title: "Ponelo en practica en tu local.",
    body: "Abre tu cuenta gratis, mira los tutoriales y tené tu negocio online en menos de 10 minutos. Si en algun paso te trabas, escribinos y te ayudamos.",
    primaryLabel: "Crear cuenta gratis",
    primaryHref: "/register",
    secondaryLabel: "Hablar con soporte",
    secondaryHref: "mailto:soporte@klip.com.ar",
  },
};

/* -----------------------------------------------------------------------------
 * GUIA FLOTANTE (boton "Guia" abajo a la derecha dentro del dashboard)
 *   - threshold:  numero de turnos completados (status: "completed") a partir
 *                 del cual el boton flotante desaparece. Con 50, la guia deja
 *                 de mostrarse.
 *   - label:      texto que muestra el boton flotante.
 *   - menuLabel:  texto del item destacado "Web de tutoriales" en el menu del
 *                 avatar del dashboard.
 *   - href:       a donde navega (la web de tutoriales).
 * ---------------------------------------------------------------------------
 */
export const TUTORIALES_GUIDE = {
  threshold: 50,
  label: "Guía",
  menuLabel: "Web de tutoriales",
  href: "/tutoriales",
};