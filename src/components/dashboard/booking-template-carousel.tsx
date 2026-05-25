"use client";

import { useRef, useState, type PointerEvent } from "react";
import Image from "next/image";
import { BOOKING_TEMPLATE_PRESETS, type BookingTemplateId } from "@/lib/booking/theme-presets";

type Props = {
  selectedTemplateId: BookingTemplateId;
  onSelect: (templateId: BookingTemplateId) => void;
};

export default function BookingTemplateCarousel({ selectedTemplateId, onSelect }: Props) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inertiaFrameRef = useRef<number | null>(null);
  const dragStateRef = useRef<{ pointerId: number | null; startX: number; startScrollLeft: number; moved: boolean }>({
    pointerId: null,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const velocityRef = useRef<{ lastX: number; lastT: number; v: number }>({ lastX: 0, lastT: 0, v: 0 });

  const resolveTemplateIdFromTarget = (target: EventTarget | null): BookingTemplateId | null => {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLButtonElement>("button[data-template-id]");
    const raw = el?.dataset.templateId;
    if (!raw) return null;
    return BOOKING_TEMPLATE_PRESETS.some((item) => item.id === raw) ? (raw as BookingTemplateId) : null;
  };

  const resolveTemplateIdFromPoint = (x: number, y: number): BookingTemplateId | null => {
    if (typeof document === "undefined") return null;
    const el = document.elementFromPoint(x, y);
    return resolveTemplateIdFromTarget(el);
  };

  const stopInertia = () => {
    if (inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  };

  const startInertia = () => {
    const el = railRef.current;
    if (!el) return;
    let velocity = velocityRef.current.v;
    if (Math.abs(velocity) < 0.06) return;

    stopInertia();
    const step = () => {
      const target = railRef.current;
      if (!target) return;

      target.scrollLeft -= velocity * 14;
      velocity *= 0.92;

      const atLeft = target.scrollLeft <= 0;
      const atRight = target.scrollLeft >= target.scrollWidth - target.clientWidth - 1;
      if (Math.abs(velocity) < 0.06 || atLeft || atRight) {
        inertiaFrameRef.current = null;
        return;
      }
      inertiaFrameRef.current = requestAnimationFrame(step);
    };

    inertiaFrameRef.current = requestAnimationFrame(step);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!railRef.current) return;
    stopInertia();
    dragStateRef.current.pointerId = e.pointerId;
    dragStateRef.current.startX = e.clientX;
    dragStateRef.current.startScrollLeft = railRef.current.scrollLeft;
    dragStateRef.current.moved = false;
    velocityRef.current.lastX = e.clientX;
    velocityRef.current.lastT = performance.now();
    velocityRef.current.v = 0;
    setIsDragging(true);
    railRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = railRef.current;
    if (!el || dragStateRef.current.pointerId !== e.pointerId) return;
    const delta = e.clientX - dragStateRef.current.startX;
    if (Math.abs(delta) > 8) dragStateRef.current.moved = true;
    el.scrollLeft = dragStateRef.current.startScrollLeft - delta;

    const now = performance.now();
    const dt = now - velocityRef.current.lastT;
    if (dt > 0) {
      const dx = e.clientX - velocityRef.current.lastX;
      velocityRef.current.v = dx / dt;
      velocityRef.current.lastX = e.clientX;
      velocityRef.current.lastT = now;
    }
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const el = railRef.current;
    if (!el || dragStateRef.current.pointerId !== e.pointerId) return;
    const moved = dragStateRef.current.moved;
    const tappedTemplateId = moved ? null : (resolveTemplateIdFromTarget(e.target) ?? resolveTemplateIdFromPoint(e.clientX, e.clientY));
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {}
    dragStateRef.current.pointerId = null;
    dragStateRef.current.moved = false;
    setIsDragging(false);
    if (tappedTemplateId) {
      onSelect(tappedTemplateId);
      return;
    }
    startInertia();
  };

  return (
    <div className="-mx-1 pb-2">
      <div
        ref={railRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 select-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        {BOOKING_TEMPLATE_PRESETS.map((template) => {
          const selected = template.id === selectedTemplateId;
          return (
            <button
              key={template.id}
              data-template-id={template.id}
              type="button"
              onClick={(e) => {
                if (dragStateRef.current.moved) {
                  e.preventDefault();
                  dragStateRef.current.moved = false;
                  return;
                }
                onSelect(template.id);
              }}
              className={`min-h-12 min-w-[220px] max-w-[220px] snap-start rounded-3xl border p-3 text-left transition-all ${
                selected
                  ? "border-[#0071E3]/55 bg-[linear-gradient(168deg,rgba(255,255,255,0.95)_0%,rgba(236,245,255,0.86)_100%)] shadow-[0_22px_40px_-26px_rgba(0,113,227,0.45)] dark:bg-zinc-900/50"
                  : "border-white/35 bg-white/55 hover:bg-white/75 dark:bg-zinc-900/30 dark:hover:bg-zinc-900/45"
              }`}
            >
              <div className="overflow-hidden rounded-2xl border border-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <Image src={template.previewSrc} alt={template.name} width={220} height={390} className="h-[220px] w-full object-cover" />
              </div>
              <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-white">{template.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{template.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
