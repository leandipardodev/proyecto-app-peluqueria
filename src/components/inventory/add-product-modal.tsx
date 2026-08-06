"use client";

import { Package, ImagePlus, X, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProduct } from "@/lib/dashboard/inventory/inventory-actions";
import BaseModal from "@/components/ui/modal";
import { FormWithKeyboardNav } from "@/lib/use-form-keyboard-nav";
import { InputForm } from "@/components/ui/input-form";
import { SubmitBtn } from "@/components/ui/submit-btn";

interface AddProductModalProps {
  shopId: string;
  open: boolean;
  onClose: () => void;
  storeEnabled?: boolean;
}

export default function AddProductModal({ shopId, open, onClose, storeEnabled = true }: AddProductModalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [forSale, setForSale] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [hasImage, setHasImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForSale(false);
      setPreview(null);
      setHasImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("La imagen supera 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(typeof reader.result === "string" ? reader.result : null);
      setHasImage(true);
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("for_sale", forSale ? "true" : "false");
    startTransition(async () => {
      const result = await addProduct(formData, shopId);
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
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

        {storeEnabled && (
          <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-600 dark:text-zinc-300 font-medium">Vender online</span>
            </div>
            <button
              type="button"
              onClick={() => setForSale((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                forSale ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-600"
              }`}
              role="switch"
              aria-checked={forSale}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                  forSale ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        )}

        {storeEnabled && forSale && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative w-full h-32 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 overflow-hidden hover:border-violet-400 dark:hover:border-violet-500 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              aria-label="Subir imagen del producto"
            >
              <input
                ref={fileInputRef}
                type="file"
                name="image"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={handleFileChange}
              />
              {preview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Vista previa" className="absolute inset-0 w-full h-full object-cover" />
                  <span className="absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
                    <X className="w-4 h-4" />
                  </span>
                </>
              ) : (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500 group-hover:text-violet-500 transition-colors">
                  <ImagePlus className="w-6 h-6" />
                  <span className="text-sm font-medium">Subir imagen</span>
                </span>
              )}
            </button>
            {hasImage && !preview && (
              <p className="text-xs text-red-500">No se pudo leer la imagen</p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <InputForm
                label="Precio de venta ($)"
                name="price"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
              />
              <InputForm
                label="Categoría"
                name="category"
                type="text"
                placeholder="Ej: Productos"
              />
            </div>

            <InputForm
              label="Descripción"
              name="description"
              type="text"
              placeholder="Opcional"
            />
          </div>
        )}

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
