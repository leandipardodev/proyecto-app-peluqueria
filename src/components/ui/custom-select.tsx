"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Option = { value: string; label: string };

export default function CustomSelect({
  name,
  value,
  onChange,
  options,
  placeholder,
  className = "",
}: {
  name?: string;
  value: string;
  onChange: (next: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) || null, [options, value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ui-btn-ghost flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm"
      >
        <span className={selected ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}>
          {selected?.label || placeholder || "Seleccionar..."}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="ui-card absolute z-50 mt-1 max-h-64 w-full overflow-y-auto overflow-x-hidden rounded-xl p-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full rounded-lg px-2.5 py-2 text-left text-sm whitespace-normal break-words ${
                opt.value === value
                  ? "bg-[color-mix(in_srgb,var(--ui-primary)_15%,transparent)] text-slate-900 dark:text-slate-100"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
