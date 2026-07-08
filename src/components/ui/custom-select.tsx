"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) || null, [options, value]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleMove(e: Event) {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener("scroll", handleMove, true);
    window.addEventListener("resize", handleMove);
    return () => {
      window.removeEventListener("scroll", handleMove, true);
      window.removeEventListener("resize", handleMove);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const first = dropdownRef.current?.querySelector<HTMLButtonElement>("button");
      first?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  }, []);

  const handleOptionKeyDown = useCallback(
    (e: React.KeyboardEvent, opt: Option) => {
      const parent = dropdownRef.current;
      if (!parent) return;
      const buttons = Array.from(parent.querySelectorAll("button"));
      const idx = buttons.indexOf(e.currentTarget as HTMLButtonElement);

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onChange(opt.value);
        setOpen(false);
        containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (idx < buttons.length - 1) buttons[idx + 1].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (idx > 0) {
          buttons[idx - 1].focus();
        } else {
          setOpen(false);
          containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    },
    [onChange]
  );

  return (
    <div ref={containerRef} className={`relative z-50 ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        data-form-nav="skip"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        className="ui-btn-ghost flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm"
      >
        <span className={selected ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}>
          {selected?.label || placeholder || "Seleccionar..."}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="ui-card absolute left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto overflow-x-hidden rounded-xl p-1"
          style={{ zIndex: 9999 }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              onKeyDown={(e) => handleOptionKeyDown(e, opt)}
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
