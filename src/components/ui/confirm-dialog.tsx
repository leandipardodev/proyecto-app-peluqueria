"use client";

import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import MorphCard from "./morph-card";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4"
          role="dialog"
          aria-modal="true"
        >
          <MorphCard className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{message}</p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="ui-btn-ghost rounded-lg px-3 py-1.5 text-sm"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                  danger
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "ui-btn-primary"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </MorphCard>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
