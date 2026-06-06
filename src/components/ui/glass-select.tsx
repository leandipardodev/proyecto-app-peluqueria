"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

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

const dropVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, damping: 28, stiffness: 350 } },
  exit: { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.15 } },
};

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

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) setSearchQuery("");
  }, [open]);

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
        type="button"
        onClick={() => setOpen(!open)}
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

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute z-50 mt-1.5 w-full bg-white dark:bg-zinc-800 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden py-1"
            variants={dropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {searchable && (
              <div className="px-2 pb-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
      </AnimatePresence>
    </div>
  );
}
