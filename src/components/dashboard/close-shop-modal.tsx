"use client";

import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  confirmText: string;
  onConfirmTextChange: (v: string) => void;
  onConfirm: () => void;
  pending: boolean;
  portalReady: boolean;
};

export default function CloseShopModal({ isOpen, onClose, confirmText, onConfirmTextChange, onConfirm, pending, portalReady }: Props) {
  if (!portalReady) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/45 flex items-center justify-center p-4"
          onClick={() => { if (!pending) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md rounded-3xl border border-red-200/80 dark:border-red-700/40 bg-white dark:bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
              <h4 className="text-base font-semibold text-red-700 dark:text-red-300">Cerrar local</h4>
            </div>
            <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
              Esta acción <strong>no se puede deshacer</strong>. Se eliminarán todos los datos del local. Escribí <strong>CONFIRMAR</strong> para continuar.
            </p>
            <div className="mt-3">
              <input
                value={confirmText}
                onChange={(e) => onConfirmTextChange(e.target.value)}
                placeholder='Escribí "CONFIRMAR"'
                className="w-full rounded-xl border border-red-200 dark:border-red-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                autoFocus
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                onClick={onClose}
                disabled={pending}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending || confirmText.trim().toUpperCase() !== "CONFIRMAR"}
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              >
                {pending ? "Cerrando..." : "Cerrar local"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
