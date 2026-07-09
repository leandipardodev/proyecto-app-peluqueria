"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";

interface GlassSelectOption {
  value: string;
  label: string;
  prefix?: React.ReactNode;
}

interface GlassSelectProps {
  options: GlassSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  name?: string;
  required?: boolean;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}

export default function GlassSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar...",
  name,
  required,
  className = "",
  searchable = false,
  searchPlaceholder = "Buscar...",
}: GlassSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
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
    if (!open) setSearchQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      if (searchable) {
        const searchInput = dropdownRef.current?.querySelector<HTMLInputElement>('input[type="text"]');
        searchInput?.focus();
      } else {
        const first = dropdownRef.current?.querySelector<HTMLButtonElement>("button");
        first?.focus();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [open, searchable]);

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
          top: rect.bottom + 6,
          left: rect.left,
          width: rect.width,
        });
      }
    }
    setOpen((prev) => !prev);
  }, [open]);

  const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setOpen((prev) => !prev);
    } else if (searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      setSearchQuery(e.key);
      setOpen(true);
    }
  }, [searchable]);

  const handleOptionKeyDown = useCallback(
    (e: React.KeyboardEvent, opt: GlassSelectOption) => {
      const parent = dropdownRef.current;
      if (!parent) return;
      const buttons = Array.from(parent.querySelectorAll<HTMLButtonElement>("button"));
      const idx = buttons.indexOf(e.currentTarget as HTMLButtonElement);

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onChange(opt.value);
        setOpen(false);
        buttonRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        if (idx < buttons.length - 1) buttons[idx + 1].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        if (idx > 0) {
          buttons[idx - 1].focus();
        } else {
          setOpen(false);
          buttonRef.current?.focus();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    },
    [onChange]
  );

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const first = dropdownRef.current?.querySelector<HTMLButtonElement>("button");
      first?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.nativeEvent.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Enter" && !searchQuery) {
      e.preventDefault();
      e.stopPropagation();
      const first = dropdownRef.current?.querySelector<HTMLButtonElement>("button");
      first?.focus();
    }
  }, [searchQuery]);

  const normalizedQuery = searchQuery
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const filteredOptions = !normalizedQuery
    ? options
    : options.filter((opt) =>
        opt.label
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .includes(normalizedQuery)
      );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input type="hidden" name={name} value={value} required={required} />
      <button
        ref={buttonRef}
        type="button"
        data-form-nav="skip"
        onClick={handleToggle}
        onKeyDown={handleTriggerKeyDown}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-violet-500/20 transition-all cursor-pointer select-none ${
          selected ? "text-gray-900 dark:text-gray-100" : "text-zinc-400 dark:text-zinc-500"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {selected?.prefix && <span className="shrink-0">{selected.prefix}</span>}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && dropdownStyle && (
          <motion.div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropdownStyle.top,
              left: dropdownStyle.left,
              width: dropdownStyle.width,
              zIndex: 9999,
            }}
            className="bg-white dark:bg-zinc-800 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden py-1"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            {searchable && (
              <div className="px-2 pb-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-500/25"
                />
              </div>
            )}
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-400">Sin opciones</div>
            ) : (
              filteredOptions.map((opt) => {
                const isActive = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    onKeyDown={(e) => handleOptionKeyDown(e, opt)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer select-none flex items-center gap-2 ${
                      isActive
                        ? "text-violet-700 dark:text-violet-300 bg-violet-500/10"
                        : "text-gray-700 dark:text-gray-300 hover:bg-violet-500/10"
                    }`}
                  >
                    {opt.prefix && <span className="shrink-0">{opt.prefix}</span>}
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })
            )}
          </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
