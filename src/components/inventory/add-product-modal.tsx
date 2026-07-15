"use client";

import { Package } from "lucide-react";
import { useState, useTransition } from "react";
import { addProduct } from "@/lib/dashboard/inventory/inventory-actions";
import BaseModal from "@/components/ui/modal";
import { FormWithKeyboardNav } from "@/lib/use-form-keyboard-nav";
import { InputForm } from "@/components/ui/input-form";
import { SubmitBtn } from "@/components/ui/submit-btn";

interface AddProductModalProps {
  shopId: string;
  open: boolean;
  onClose: () => void;
}

export default function AddProductModal({ shopId, open, onClose }: AddProductModalProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

        <InputForm
          label="Nombre del producto"
          name="nombre_producto"
          type="text"
          required
          autoFocus
          placeholder="Ej: Tinte rubio cenizo"
        />

        <div className="grid grid-cols-2 gap-4">
          <InputForm
            label="Cantidad inicial"
            name="quantity"
            type="number"
            min="0"
            defaultValue="0"
            required
          />

          <InputForm
            label="Costo unitario ($)"
            name="unit_cost"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="0.00"
          />
        </div>

        <SubmitBtn
          isPending={pending}
          pendingText="Agregando..."
          defaultText="Agregar producto"
          className="flex items-center justify-center gap-2"
        />
      </FormWithKeyboardNav>
    </BaseModal>
  );
}
