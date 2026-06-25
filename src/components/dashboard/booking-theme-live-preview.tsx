"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Image from "next/image";
import type { Industry } from "@/lib/industry/types";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import type { BookingTemplateId } from "@/lib/booking/theme-presets";
import { resolveTemplate } from "@/app/book/[slug]/booking-themes";
import type { BookingTheme } from "@/app/book/[slug]/booking-themes";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import InlineEdit from "@/components/ui/inline-edit";

type PreviewService = {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration_minutes: number;
  category: string;
};

type Props = {
  templateId: BookingTemplateId;
  logoUrl: string;
  shopName: string;
  heroTitle: string;
  onHeroTitleChange: (v: string) => void;
  heroSubtitle: string;
  onHeroSubtitleChange: (v: string) => void;
  aboutTitle: string;
  onAboutTitleChange: (v: string) => void;
  aboutText: string;
  onAboutTextChange: (v: string) => void;
  services: PreviewService[];
  sectionCatalog: string[];
  onServiceMove: (serviceId: string, toSection: string, beforeServiceId?: string) => void;
  onSectionAdd: (sectionName: string) => void;
  onSectionRemove: (sectionName: string) => void;
  onLogoUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  industry?: Industry;
  disabled?: boolean;
  address?: string;
  phone?: string;
  instagramUrl?: string;
};

type PreviewTheme = Pick<BookingTheme,
  'page' | 'isDark' | 'pageAura' | 'pageLightFx' | 'glowA' | 'glowB' | 'glowC' |
  'glowBlend' | 'shell' | 'heading' | 'headingFx' |
  'titleGradient' | 'subtitleGradient' | 'tiny' | 'accent' | 'sectionTag' |
  'sectionTagAll' | 'sectionTagActive' | 'sectionFocus' | 'next' | 'nextDisabled' |
  'meta' | 'metaHover' | 'progressFill' | 'priceText' | 'priceFx' |
  'cardDepth' | 'plate' | 'hoverBorder' | 'selected' | 'back' |
  'ctaMain' | 'ctaDepth'
> & {
  sectionBg: string;
};

function getPreviewTheme(templateId: BookingTemplateId): PreviewTheme {
  const t = resolveTemplate(templateId);
  return {
    page: t.page,
    isDark: t.isDark,
    pageAura: t.pageAura,
    pageLightFx: t.pageLightFx,
    glowA: t.glowA,
    glowB: t.glowB,
    glowC: t.glowC,
    glowBlend: t.glowBlend,
    shell: t.shell,
    heading: t.heading,
    headingFx: t.headingFx,
    titleGradient: t.titleGradient,
    subtitleGradient: t.subtitleGradient,
    tiny: t.tiny,
    accent: t.accent,
    sectionTag: t.sectionTag,
    sectionTagAll: t.sectionTagAll,
    sectionTagActive: t.sectionTagActive,
    sectionFocus: t.sectionFocus,
    cardDepth: t.cardDepth,
    plate: t.plate,
    hoverBorder: t.hoverBorder,
    selected: t.selected,
    back: t.back,
    ctaMain: t.ctaMain,
    ctaDepth: t.ctaDepth,
    next: t.next,
    nextDisabled: t.nextDisabled,
    meta: t.meta,
    metaHover: t.metaHover,
    progressFill: t.progressFill,
    priceText: t.priceText,
    priceFx: t.priceFx,
    sectionBg: t.isDark ? "bg-white/5" : "bg-black/[0.04]",
  };
}

function SortableServiceCard({
  service,
  disabled,
  s,
  isOver,
  isActive,
}: {
  service: PreviewService;
  disabled: boolean;
  s: PreviewTheme;
  isOver: boolean;
  isActive: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: service.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div className="relative">
      {/* Drop indicator line above the card */}
      {isOver && !isActive && (
        <div className="absolute -top-[1px] left-4 right-4 z-20 flex items-center gap-1 pointer-events-none">
          <div className="h-[3px] flex-1 rounded-full bg-blue-500/80" />
          <svg className="w-2 h-2 text-blue-500/80" viewBox="0 0 10 10" fill="currentColor">
            <polygon points="5,10 0,0 10,0" />
          </svg>
        </div>
      )}
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`rounded-3xl border-2 transition-[transform,box-shadow] duration-200 ${s.cardDepth} ${s.plate} ${s.hoverBorder} ${isOver && !isActive ? "border-blue-400/60 ring-2 ring-blue-400/30 opacity-60" : ""} ${!disabled ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <div className="overflow-hidden rounded-3xl">
          <div className="px-4 py-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium break-words whitespace-normal text-left ${s.heading}`}>{service.name}</p>
                {service.description && (
                  <p className={`mt-0.5 text-[11px] leading-relaxed line-clamp-2 ${s.tiny}`}>{service.description}</p>
                )}
                <p className={`mt-0.5 text-[11px] ${s.tiny}`}>{service.duration_minutes} min</p>
              </div>
              <p className={`shrink-0 tabular-nums font-semibold ${s.priceText} ${s.priceFx}`}>
                <span className="mr-0.5 align-top text-[0.72em] font-semibold opacity-85">$</span>
                <span className="tracking-[-0.045em]">{service.price.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceCardOverlay({ service, s }: { service: PreviewService; s: PreviewTheme }) {
  return (
    <div className={`rounded-3xl border-2 shadow-2xl ${s.cardDepth} ${s.plate} opacity-90`}>
      <div className="overflow-hidden rounded-3xl">
        <div className="px-4 py-3 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${s.heading}`}>{service.name}</p>
              <p className={`mt-0.5 text-[11px] ${s.tiny}`}>{service.duration_minutes} min</p>
            </div>
            <p className={`shrink-0 tabular-nums font-semibold ${s.priceText} ${s.priceFx}`}>
              ${service.price.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookingThemeLivePreview({
  templateId,
  logoUrl,
  shopName,
  heroTitle,
  onHeroTitleChange,
  heroSubtitle,
  onHeroSubtitleChange,
  aboutTitle,
  onAboutTitleChange,
  aboutText,
  onAboutTextChange,
  services,
  sectionCatalog,
  onServiceMove,
  onSectionAdd,
  onSectionRemove,
  onLogoUpload,
  industry = "peluqueria",
  disabled = false,
  address,
  phone,
  instagramUrl,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeDragService, setActiveDragService] = useState<PreviewService | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionInput, setNewSectionInput] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const hasRealServices = services.length > 0;
  const fallbackServices: PreviewService[] = [
    { id: "demo-1", name: "Corte Clasico", description: "Corte de pelo con navaja y tijera", price: 12000, duration_minutes: 45, category: "Cortes" },
    { id: "demo-2", name: "Barba Completa", description: "Perfilado de barba con toalla caliente", price: 9000, duration_minutes: 35, category: "Barberia" },
  ];
  const sourceServices = hasRealServices ? services : fallbackServices;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const service of sourceServices) {
      const category = (service.category || "General").trim() || "General";
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0], "es");
      })
      .map(([category]) => category);
  }, [sourceServices]);

  const activeCategory = selectedCategory && categories.includes(selectedCategory)
    ? selectedCategory
    : "Todos";

  const s = getPreviewTheme(templateId);

  const servicesByCategory = useMemo(() => {
    const map = new Map<string, PreviewService[]>();
    for (const service of sourceServices) {
      const cat = (service.category || "General").trim() || "General";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(service);
    }
    return map;
  }, [sourceServices]);

  const visibleSections = activeCategory === "Todos"
    ? sectionCatalog.filter((sec) => (servicesByCategory.get(sec)?.length ?? 0) > 0)
    : [activeCategory];

  const serviceMap = useMemo(() => {
    const map = new Map<string, PreviewService>();
    for (const service of sourceServices) {
      map.set(service.id, service);
    }
    return map;
  }, [sourceServices]);

  const labels = INDUSTRY_CONFIG[industry].labels;
  const serviceWordLower = labels.serviceSingular.toLowerCase();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 300,
        tolerance: 5,
      },
    }),
  );

  const dragPointerRef = useRef({ x: 0, y: 0 });

  function handleDragStart(event: DragStartEvent) {
    const service = serviceMap.get(event.active.id as string);
    if (service) setActiveDragService(service);
    const e = event.activatorEvent as PointerEvent | null;
    if (e) {
      dragPointerRef.current = { x: e.clientX, y: e.clientY };
      setDragPos({ x: e.clientX, y: e.clientY });
    }
  }

  function handleDragMove(event: DragMoveEvent) {
    const e = event.activatorEvent as PointerEvent | null;
    if (e) {
      setDragPos({ x: e.clientX, y: e.clientY });
    } else {
      setDragPos({
        x: dragPointerRef.current.x + event.delta.x,
        y: dragPointerRef.current.y + event.delta.y,
      });
    }
  }

  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over ? (event.over.id as string) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragService(null);
    setOverId(null);
    setDragPos(null);
    const { active, over } = event;
    if (!over || disabled) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    const activeService = serviceMap.get(activeId);
    if (!activeService) return;

    const isOverService = serviceMap.has(overId);

    if (isOverService) {
      const overService = serviceMap.get(overId)!;
      const toSection = (overService.category || "General").trim() || "General";
      onServiceMove(activeId, toSection, overId);
    } else if (sectionCatalog.includes(overId)) {
      onServiceMove(activeId, overId);
    }
  }

  useEffect(() => {
    if (addingSection) addInputRef.current?.focus();
  }, [addingSection]);

  function handleAddSection() {
    const clean = newSectionInput.trim();
    if (!clean) return;
    const normalized = clean
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return;

    const exists = sectionCatalog.some((section) => {
      const sectionNorm = section
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return sectionNorm === normalized;
    });
    if (exists) {
      setNewSectionInput("");
      setAddingSection(false);
      return;
    }

    const display = clean
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    onSectionAdd(display);
    setNewSectionInput("");
    setAddingSection(false);
  }

  const allServiceIds = useMemo(() => sourceServices.map((s) => s.id), [sourceServices]);

  const sectionServiceIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const section of sectionCatalog) {
      map.set(section, sourceServices.filter((s) => (s.category || "General").trim() || "General" === section).map((s) => s.id));
    }
    return map;
  }, [sectionCatalog, sourceServices]);

  const currentServiceIds = useMemo(() => {
    if (activeCategory === "Todos") return allServiceIds;
    return (servicesByCategory.get(activeCategory) || []).map((s) => s.id);
  }, [activeCategory, allServiceIds, servicesByCategory]);

  return (
    <section className="self-start max-sm:-mx-6 max-sm:w-screen max-sm:rounded-none max-sm:border-x-0 rounded-3xl border border-white/30 bg-white p-3 dark:border-white/10 dark:bg-zinc-800">
      <div className="flex justify-center">
        <div className="w-full max-w-sm">
          <div className={`relative rounded-[2.5rem] overflow-hidden ${s.page}`}>
            <div className={`pointer-events-none absolute inset-0 z-0 bg-gradient-to-br ${s.pageAura}`} />
            <div className={`pointer-events-none absolute inset-0 z-[1] ${s.pageLightFx}`} />
            <div aria-hidden className={`pointer-events-none absolute top-[-12%] right-[-10%] z-[2] h-[170px] w-[170px] rounded-full blur-[90px] ${s.glowA} ${s.glowBlend}`} />
            <div aria-hidden className={`pointer-events-none absolute bottom-[-12%] left-[-10%] z-[2] h-[160px] w-[160px] rounded-full blur-[85px] ${s.glowB} ${s.glowBlend}`} />
            <div aria-hidden className={`pointer-events-none absolute top-[34%] right-[18%] z-[2] h-[140px] w-[140px] rounded-full blur-[70px] ${s.glowC} ${s.glowBlend}`} />
            <div aria-hidden className={`pointer-events-none absolute top-[58%] left-[22%] z-[2] h-[110px] w-[110px] rounded-full blur-[60px] ${s.glowA} ${s.glowBlend}`} />
            <div aria-hidden className="pointer-events-none absolute inset-0 z-[2] opacity-15" style={{
              background: "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.10), transparent 52%), radial-gradient(circle at 28% 68%, rgba(255,255,255,0.08), transparent 48%)",
            }} />

            <div className="relative z-10 flex items-start justify-center p-2 sm:p-4">
              <div className="w-full">
                <div className={`rounded-[32px] p-3 sm:p-5 flex flex-col ${s.shell}`}>
                  {/* Header */}
                  <div className="pb-3">
                    <div className="flex items-center gap-3">
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" ref={logoInputRef} className="hidden" onChange={onLogoUpload} disabled={disabled} />
                      <button type="button" onClick={() => logoInputRef.current?.click()} disabled={disabled} className="h-12 w-12 flex items-center justify-center shrink-0 overflow-hidden rounded-full focus-visible:ring-2 focus-visible:ring-[#7AB8FF]/50 outline-none">
                        {logoUrl ? (
                          <Image src={logoUrl} alt="Logo" width={96} height={96} sizes="48px" className="h-full w-full object-contain" />
                        ) : (
                          <span className={`text-lg font-semibold tracking-tight ${s.accent}`}>K</span>
                        )}
                      </button>
                      <div className="min-w-0">
                        <InlineEdit
                          value={heroTitle || shopName || "Reserva online"}
                          onChange={onHeroTitleChange}
                          placeholder="Reserva tu turno"
                          disabled={disabled}
                          className={`text-xl font-black leading-[1.1] tracking-[-0.035em] cursor-pointer bg-gradient-to-r ${s.titleGradient} bg-clip-text text-transparent ${s.headingFx}`}
                          inputClassName="text-xl font-black leading-[1.1] tracking-[-0.035em] text-[#1C1C1E] bg-transparent"
                        />
                        <InlineEdit
                          value={heroSubtitle || ""}
                          onChange={onHeroSubtitleChange}
                          placeholder="Reserva online"
                          disabled={disabled}
                          className={`text-[11px] uppercase tracking-[0.18em] cursor-pointer bg-gradient-to-r ${s.subtitleGradient} bg-clip-text text-transparent`}
                          inputClassName="text-[11px] uppercase tracking-[0.18em] text-[#6B7280] bg-transparent"
                        />
                      </div>
                    </div>
                    <div className="flex justify-center pt-3">
                      <div className={`relative h-[3px] w-3/5 rounded-full ${s.progressFill}`} />
                    </div>
                  </div>

                  {/* Category chips + add/delete */}
                  <div className="pt-1">
                    <p className={`text-center text-sm font-semibold ${s.heading}`}>
                      Elegi tu {serviceWordLower}
                    </p>
                    <div className="mt-2 -mx-1 overflow-x-auto pb-0.5 no-scrollbar">
                      <div className="flex items-center gap-2 px-1">
                        {["Todos", ...sectionCatalog].map((category) => {
                          const isActive = category === activeCategory;
                          const isAll = category === "Todos";
                          const isGeneral = category === "General";
                          return (
                            <div key={category} className="relative shrink-0 group">
                              <button
                                type="button"
                                onClick={() => setSelectedCategory(category)}
                                className={`relative min-h-10 rounded-full px-4 text-xs sm:text-sm whitespace-nowrap text-center ${
                                  isAll
                                    ? (isActive ? "font-semibold" : s.sectionTagAll)
                                    : (isActive ? "font-semibold" : s.sectionTag)
                                } ${s.sectionFocus} active:scale-[0.97] transition-transform duration-150`}
                              >
                                {isActive && (
                                  <span className={`absolute inset-0 rounded-full ${s.sectionTagActive}`} />
                                )}
                                <span className="relative z-10">{category}</span>
                              </button>
                              {!isAll && !isGeneral && !disabled && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemove(category)}
                                  className="absolute -top-1 -right-1 z-20 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                  title={`Eliminar ${category}`}
                                >
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {!disabled && (
                          <button
                            type="button"
                            onClick={() => setAddingSection(true)}
                            className="shrink-0 w-10 h-10 rounded-full border border-dashed border-white/40 flex items-center justify-center text-zinc-500 hover:text-zinc-700 hover:border-white/70 transition-colors"
                            title="Agregar seccion"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {addingSection && (
                      <div className="mt-2 flex gap-2">
                        <input
                          ref={addInputRef}
                          value={newSectionInput}
                          onChange={(e) => setNewSectionInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddSection();
                            if (e.key === "Escape") { setAddingSection(false); setNewSectionInput(""); }
                          }}
                          onBlur={() => {
                            if (!newSectionInput.trim()) { setAddingSection(false); }
                          }}
                          className="flex-1 min-h-10 rounded-full border border-white/40 bg-white px-4 py-1 text-xs text-zinc-800 outline-none ring-[#0071E3] focus:ring-2"
                          placeholder="Nueva seccion"
                        />
                        <button
                          type="button"
                          onClick={handleAddSection}
                          className="min-h-10 rounded-full bg-[#111114] px-4 py-1 text-xs font-medium text-white"
                        >
                          OK
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Service list with DnD */}
                  <div className="pt-3 pb-1 min-h-0">
                    {!hasRealServices && (
                      <p className={`text-[11px] italic mb-2 ${s.tiny}`}>
                        {labels.servicePlural} de ejemplo hasta que cargues los tuyos.
                      </p>
                    )}
                    <div className="max-h-[50vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragMove={handleDragMove}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext items={allServiceIds} strategy={verticalListSortingStrategy}>
                        {activeCategory === "Todos" ? (
                          <div className="space-y-3">
                            {visibleSections.map((section) => {
                              const sectionServices = (servicesByCategory.get(section) || []);
                              return (
                                <div key={section} className={`rounded-xl p-2 ${s.sectionBg}`}>
                                  <p className={`text-xs font-semibold mb-1.5 px-1 ${s.tiny}`}>
                                    {section} <span className="opacity-50">({sectionServices.length})</span>
                                  </p>
                                  <div className="space-y-1.5">
                                    {sectionServices.map((service) => (
                                      <SortableServiceCard
                                        key={service.id}
                                        service={service}
                                        disabled={disabled}
                                        s={s}
                                        isOver={overId === service.id}
                                        isActive={activeDragService?.id === service.id}
                                      />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {(servicesByCategory.get(activeCategory) || []).map((service) => (
                              <SortableServiceCard
                                key={service.id}
                                service={service}
                                disabled={disabled}
                                s={s}
                                isOver={overId === service.id}
                                isActive={activeDragService?.id === service.id}
                              />
                            ))}
                          </div>
                        )}
                      </SortableContext>
                    </DndContext>
                    </div>
                  </div>
                  {/* About section */}
                  <div className="pt-3 border-t border-white/15">
                    <InlineEdit
                      value={aboutTitle || ""}
                      onChange={onAboutTitleChange}
                      placeholder="Sobre nosotros"
                      disabled={disabled}
                      className={`text-sm font-semibold bg-gradient-to-r ${s.titleGradient} bg-clip-text text-transparent`}
                      inputClassName="text-sm font-semibold text-[#1C1C1E] bg-transparent"
                    />
                    <InlineEdit
                      value={aboutText || ""}
                      onChange={onAboutTextChange}
                      placeholder="Tu mensaje de marca aparece aca para reforzar la experiencia del local."
                      multiline
                      disabled={disabled}
                      className={`mt-1 text-xs leading-relaxed ${s.tiny}`}
                      inputClassName="mt-1 text-xs leading-relaxed text-[#6B7280] bg-transparent w-full resize-none"
                    />
                  </div>

                  {/* Footer */}
                  <div className={`mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs ${s.meta}`}>
                    {address && (
                      <span className={`inline-flex items-center gap-1 ${s.metaHover}`}>
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {address}
                      </span>
                    )}
                    {phone && (
                      <span className={`inline-flex items-center gap-1 ${s.metaHover}`}>
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {phone}
                      </span>
                    )}
                    {instagramUrl && (
                      <span className={`inline-flex items-center gap-1 ${s.metaHover}`}>
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Instagram
                      </span>
                    )}
                    <span className="opacity-50">— powered by KLIP</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom drag overlay follows cursor */}
      {activeDragService && dragPos && (
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{
            left: dragPos.x,
            top: dragPos.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          <ServiceCardOverlay service={activeDragService} s={s} />
        </div>
      )}

      {/* Confirm remove section */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmRemove(null)}>
          <div className="rounded-2xl bg-white p-5 shadow-xl max-w-xs w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-zinc-900">Eliminar seccion</p>
            <p className="mt-2 text-xs text-zinc-600">
              Los servicios de <strong>{confirmRemove}</strong> se moveran a General.
            </p>
            <div className="mt-4 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="rounded-full border border-zinc-200 px-4 py-1.5 text-xs font-medium text-zinc-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onSectionRemove(confirmRemove);
                  setConfirmRemove(null);
                }}
                className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
