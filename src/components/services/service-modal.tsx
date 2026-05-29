"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ServiceModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function ServiceModal({
  open,
  onClose,
  title,
  children,
}: ServiceModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const backdropPointerDownRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-y-contain backdrop-blur-sm p-3 sm:p-4"
      onPointerDown={(e) => {
        backdropPointerDownRef.current = e.target === backdropRef.current;
      }}
      onPointerUp={(e) => {
        if (backdropPointerDownRef.current && e.target === backdropRef.current) onClose();
        backdropPointerDownRef.current = false;
      }}
    >
      <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] w-full max-w-md overflow-hidden max-h-[88dvh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/20 dark:border-white/10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer select-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto overscroll-y-contain">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
