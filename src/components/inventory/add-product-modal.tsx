"use client";

import { X, Plus, Package } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, useTransition } from "react";
import { addProduct } from "@/lib/dashboard/inventory-actions";
import { createPortal } from "react-dom";

interface AddProductModalProps {
  shopId: string;
  open: boolean;
  onClose: () => void;
}

export default function AddProductModal({ shopId, open, onClose }: AddProductModalProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTimeout(() => nameRef.current?.focus(), 50);
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addProduct(formData, shopId);
      if (!result.success) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  if (typeof document === "undefined") return null;

  const modalNode = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/20 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.65 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-violet-500 dark:from-violet-500 dark:to-violet-600 text-white shadow-lg shadow-violet-200/50 dark:shadow-violet-900/50">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Nuevo producto</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Agregá un producto al inventario</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-4 py-2.5 rounded-xl border border-red-200/50 dark:border-red-700/50">
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="nombre_producto"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  Nombre del producto
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  id="nombre_producto"
                  name="nombre_producto"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                  placeholder="Ej: Tinte rubio cenizo"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="quantity"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
                  >
                    Cantidad inicial
                  </label>
                  <input
                    type="number"
                    id="quantity"
                    name="quantity"
                    min="0"
                    defaultValue="0"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="unit_cost"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
                  >
                    Costo unitario ($)
                  </label>
                  <input
                    type="number"
                    id="unit_cost"
                    name="unit_cost"
                    step="0.01"
                    min="0"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={pending}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white py-2.5 px-4 rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer select-none"
              >
                <Plus className="w-4 h-4" />
                {pending ? "Agregando..." : "Agregar producto"}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalNode, document.body);
}
