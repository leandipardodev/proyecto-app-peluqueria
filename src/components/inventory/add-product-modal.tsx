"use client";

import { Plus, Package } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { addProduct } from "@/lib/dashboard/inventory/inventory-actions";
import BaseModal from "@/components/ui/modal";
import { FormWithKeyboardNav } from "@/lib/use-form-keyboard-nav";

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
  }, [open]);

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

  return (
    <BaseModal open={open} onClose={onClose} title="Nuevo producto" subtitle="Agregá un producto al inventario" maxWidth="sm" icon={<Package className="w-5 h-5" />}>
      <FormWithKeyboardNav onSubmit={handleSubmit} onCancel={onClose} className="p-5 space-y-4">
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
          className="ui-btn-primary w-full flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          {pending ? "Agregando..." : "Agregar producto"}
        </button>
      </FormWithKeyboardNav>
    </BaseModal>
  );
}
