"use client";

import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  shopName: string;
  onShopNameChange: (v: string) => void;
  onCreate: () => void;
  creating: boolean;
  portalReady: boolean;
};

export default function CreateShopModal({ isOpen, onClose, shopName, onShopNameChange, onCreate, creating, portalReady }: Props) {
  if (!portalReady) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/45 flex items-center justify-center p-4"
          onClick={() => { if (!creating) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md rounded-3xl border border-violet-200/80 dark:border-violet-700/40 bg-white dark:bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-semibold text-violet-700 dark:text-violet-300">Crear nuevo local</h4>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              Elegí un nombre para el local. Luego podrás editarlo desde configuración.
            </p>
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              El trial de 15 días aplica solo a la primera tienda de la cuenta. Las tiendas adicionales ingresan sin trial.
            </p>
            <div className="mt-4">
              <input
                value={shopName}
                onChange={(e) => onShopNameChange(e.target.value)}
                placeholder="Nombre del nuevo local"
                className="w-full rounded-xl border border-violet-200 dark:border-violet-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                autoFocus
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                onClick={onClose}
                disabled={creating}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onCreate}
                disabled={creating || !shopName.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                {creating ? "Creando..." : "Crear local"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
