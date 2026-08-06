"use client";

import { ShoppingBag, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toggleForSale, updateSaleDetails, type StockItem } from "@/lib/dashboard/inventory/inventory-actions";
import BaseModal from "@/components/ui/modal";
import { FormWithKeyboardNav } from "@/lib/use-form-keyboard-nav";
import { InputForm } from "@/components/ui/input-form";
import { SubmitBtn } from "@/components/ui/submit-btn";

interface SaleConfigModalProps {
  shopId: string;
  item: StockItem;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function SaleConfigModal({ shopId, item, open, onClose, onSaved }: SaleConfigModalProps) {
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(item.image_url ?? null);
  const [hasImage, setHasImage] = useState(false);
  const [visible, setVisible] = useState(item.visible);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setPreview(item.image_url ?? null);
      setHasImage(false);
      setVisible(item.visible);
    }
  }, [open, item]);

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
    formData.set("visible", visible ? "true" : "false");
    startTransition(async () => {
      const result = await updateSaleDetails(item.id, formData, shopId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  function handleRemoveFromStore() {
    setError(null);
    setRemoving(true);
    startTransition(async () => {
      const result = await toggleForSale(item.id, false, shopId);
      setRemoving(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title="Configurar venta online"
      subtitle={item.nombre_producto}
      maxWidth="lg"
      icon={<ShoppingBag className="w-5 h-5" />}
    >
      <FormWithKeyboardNav onSubmit={handleSubmit} onCancel={onClose} className="p-5 space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-4 py-2.5 rounded-xl border border-red-200/50 dark:border-red-700/50">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative w-full h-36 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 overflow-hidden hover:border-violet-400 dark:hover:border-violet-500 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
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
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 text-white text-xs font-medium backdrop-blur-sm">
                <ImagePlus className="w-3.5 h-3.5" />
                Cambiar
              </span>
            </>
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500 group-hover:text-violet-500 transition-colors">
              <ImagePlus className="w-7 h-7" />
              <span className="text-sm font-medium">Subir imagen</span>
              <span className="text-xs">PNG o JPG hasta 2MB · se optimiza automáticamente</span>
            </span>
          )}
        </button>
        {hasImage && !preview && (
          <p className="text-xs text-red-500">No se pudo leer la imagen</p>
        )}

        <InputForm label="Precio de venta ($)" name="price" type="number" step="0.01" min="0" required placeholder="0.00" defaultValue={item.price || ""} />

        <InputForm
          label="Descripción"
          name="description"
          type="text"
          placeholder="Opcional"
          defaultValue={item.description ?? ""}
        />

        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Visible en la tienda</span>
          <button
            type="button"
            onClick={() => setVisible((prev) => !prev)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
              visible ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-600"
            }`}
            role="switch"
            aria-checked={visible}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                visible ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <SubmitBtn
            isPending={pending}
            pendingText="Guardando..."
            defaultText="Guardar configuración"
            className="flex-1 flex items-center justify-center gap-2"
          />
          <button
            type="button"
            onClick={handleRemoveFromStore}
            disabled={pending || removing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
          >
            <X className="w-4 h-4" />
            Quitar de la tienda
          </button>
        </div>
      </FormWithKeyboardNav>
    </BaseModal>
  );
}
