"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) || null, [options, value]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleMove() { setOpen(false); }
    window.addEventListener("scroll", handleMove, true);
    window.addEventListener("resize", handleMove);
    return () => {
      window.removeEventListener("scroll", handleMove, true);
      window.removeEventListener("resize", handleMove);
    };
  }, [open]);

  const handleToggle = useCallback(() => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 200 && rect.top > spaceBelow) {
        setDropdownStyle({
          top: Math.max(8, rect.top - 260),
          left: rect.left,
          width: rect.width,
        });
      } else {
        setDropdownStyle({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        });
      }
    }
    setOpen((prev) => !prev);
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="ui-btn-ghost flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm"
      >
        <span className={selected ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}>
          {selected?.label || placeholder || "Seleccionar..."}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && dropdownStyle && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: dropdownStyle.top,
            left: dropdownStyle.left,
            width: dropdownStyle.width,
            zIndex: 9999,
          }}
          className="ui-card max-h-64 overflow-y-auto overflow-x-hidden rounded-xl p-1"
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
