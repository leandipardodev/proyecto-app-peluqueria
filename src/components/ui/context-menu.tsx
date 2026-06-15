"use client";

import { useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";

export type ContextMenuItem = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number } | null;
  onClose: () => void;
}

export default function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [position, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {position && (
        <motion.div
          ref={menuRef}
          style={{
            position: "fixed",
            top: Math.min(position.y, window.innerHeight - 60),
            left: Math.min(position.x, window.innerWidth - 200),
            zIndex: 9999,
            minWidth: 180,
          }}
          className="bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden py-1"
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.12 }}
        >
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onClick();
              }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors cursor-pointer select-none ${
                item.disabled
                  ? "text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
                  : item.danger
                    ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    : "text-gray-700 dark:text-gray-300 hover:bg-violet-500/10"
              }`}
            >
              {item.icon && <span className="shrink-0 w-4 h-4">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
