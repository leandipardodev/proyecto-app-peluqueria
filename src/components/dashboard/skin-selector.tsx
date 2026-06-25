"use client";

import { useState, useRef, useEffect } from "react";
import {
  BOOKING_TEMPLATE_PRESETS,
  SKIN_CATEGORIES,
  type BookingTemplateId,
} from "@/lib/booking/theme-presets";

type Props = {
  selectedTemplateId: BookingTemplateId;
  onSelect: (templateId: BookingTemplateId) => void;
};

function PaletteCircles({ palette }: { palette: readonly [string, string, string, string] }) {
  return (
    <div className="grid grid-cols-2 gap-px w-7 h-7 shrink-0 rounded-md overflow-hidden ring-1 ring-black/10">
      {palette.map((color, i) => (
        <div key={i} className="w-full h-full" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

export default function SkinSelector({ selectedTemplateId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = BOOKING_TEMPLATE_PRESETS.find((s) => s.id === selectedTemplateId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-left hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
      >
        {selected && (
          <>
            <PaletteCircles palette={selected.palette} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{selected.name}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{selected.description}</p>
            </div>
          </>
        )}
        <svg className={`w-4 h-4 text-zinc-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full max-h-80 overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-xl">
          {SKIN_CATEGORIES.map((cat) => {
            const skins = BOOKING_TEMPLATE_PRESETS.filter((s) => s.category === cat.id);
            return (
              <div key={cat.id}>
                <div className="sticky top-0 z-10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-100 dark:border-zinc-700">
                  {cat.icon} {cat.name}
                </div>
                {skins.map((skin) => {
                  const isSelected = skin.id === selectedTemplateId;
                  return (
                    <button
                      key={skin.id}
                      type="button"
                      onClick={() => { onSelect(skin.id); setOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      }`}
                    >
                      <PaletteCircles palette={skin.palette} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-white"}`}>
                          {skin.name}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{skin.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
