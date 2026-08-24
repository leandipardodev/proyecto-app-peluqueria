"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { X, Plus, Check, AlertCircle, ShoppingBag, ImagePlus, Loader } from "lucide-react";
import { addProducts } from "@/lib/dashboard/inventory/inventory-actions";
import { getUserFriendlyError } from "@/lib/dashboard/appointments/errors";
import { useToast } from "@/components/ui/toast";
import { FormWithKeyboardNav } from "@/lib/use-form-keyboard-nav";

interface BatchEntry {
  id: string;
  nombre_producto: string;
  quantity: number | "";
  unit_cost: number | "";
  for_sale: boolean;
  price: number | "";
  description: string;
  image: File | null;
  imagePreview: string | null;
}

interface HistoryItem {
  id: string;
  status: "pending" | "ok" | "error";
  productName: string;
  qty: number;
  errorMsg?: string;
  snapshot?: BatchEntry;
}

let entryCounter = 0;

function createEmptyEntry(): BatchEntry {
  entryCounter++;
  return {
    id: `entry-${entryCounter}`,
    nombre_producto: "",
    quantity: "",
    unit_cost: "",
    for_sale: false,
    price: "",
    description: "",
    image: null,
    imagePreview: null,
  };
}

interface BatchAddProductModalProps {
  shopId: string;
  open: boolean;
  onClose: () => void;
  storeEnabled?: boolean;
}

export default function BatchAddProductModal({ shopId, open, onClose, storeEnabled = true }: BatchAddProductModalProps) {
  const { addToast } = useToast();
  const router = useRouter();
  const [entry, setEntry] = useState<BatchEntry>(() => createEmptyEntry());
  const [entryError, setEntryError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const pendingCountRef = useRef(0);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const handleClose = useCallback(() => {
    const hasData =
      entry.nombre_producto.trim() !== "" ||
      entry.quantity !== "" ||
      entry.unit_cost !== "" ||
      entry.image !== null;
    const hasPending = pendingCountRef.current > 0;
    if ((hasData || hasPending) && !window.confirm(hasPending
      ? "Hay productos guardándose. ¿Cerrar de todos modos?"
      : "¿Cerrar? Se perderá el producto sin guardar.")) return;
    onCloseRef.current();
  }, [entry]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, handleClose]);

  useEffect(() => {
    if (open) {
      entryCounter = 0;
      setEntry(createEmptyEntry());
      setEntryError(null);
      setHistory([]);
      pendingCountRef.current = 0;
      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
      });
    }
  }, [open]);

  function updateEntry(patch: Partial<BatchEntry>) {
    setEntry((prev) => ({ ...prev, ...patch }));
  }

  function validate(): string | null {
    if (!entry.nombre_producto.trim()) return "Ingresá el nombre del producto";
    if (entry.for_sale && (entry.price === "" || Number(entry.price) < 0 || isNaN(Number(entry.price))))
      return "Ingresá un precio de venta válido";
    return null;
  }

  function buildSnapshot(e: BatchEntry): BatchEntry {
    return { ...e };
  }

  function handleSave(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const err = validate();
    if (err) {
      setEntryError(err);
      return;
    }
    setEntryError(null);

    const snapshot = buildSnapshot(entry);
    const historyId = `hist-${Date.now()}`;
    const newHistoryItem: HistoryItem = {
      id: historyId,
      status: "pending",
      productName: snapshot.nombre_producto.trim(),
      qty: Number(snapshot.quantity || 0),
      snapshot,
    };
    setHistory((prev) => [newHistoryItem, ...prev]);

    setEntry(createEmptyEntry());
    pendingCountRef.current++;
    setSaving(true);
    setTimeout(() => setSaving(false), 800);

    requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });

    const resultPromise = addProducts([{
      nombre_producto: snapshot.nombre_producto.trim(),
      quantity: Number(snapshot.quantity || 0),
      unit_cost: Number(snapshot.unit_cost || 0),
      for_sale: snapshot.for_sale,
      price: snapshot.for_sale ? Number(snapshot.price || 0) : undefined,
      description: snapshot.for_sale ? snapshot.description : undefined,
      image: snapshot.for_sale ? snapshot.image : undefined,
    }], shopId);

    resultPromise.then((result) => {
      pendingCountRef.current--;
      if (result.success) {
        router.refresh();
        setHistory((prev) =>
          prev.map((h) => (h.id === historyId ? { ...h, status: "ok" as const } : h))
        );
        addToast("Producto agregado", "success");
      } else {
        setHistory((prev) =>
          prev.map((h) =>
            h.id === historyId
              ? { ...h, status: "error" as const, errorMsg: getUserFriendlyError(result.error) }
              : h
          )
        );
        addToast(getUserFriendlyError(result.error), "error");
      }
    });
  }

  function restoreFailedEntry(item: HistoryItem) {
    if (!item.snapshot) return;
    setEntry({
      ...item.snapshot,
      id: `entry-${++entryCounter}`,
    });
    requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  }

  if (!open) return null;

  const okCount = history.filter((h) => h.status === "ok").length;
  const pendingCount = history.filter((h) => h.status === "pending").length;

  const modalNode = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) handleClose(); }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/20 sm:backdrop-blur-sm p-3 sm:p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.65 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-xl overflow-hidden max-h-[88dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Agregar múltiples productos
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {history.length > 0
                    ? `${okCount} agregado${okCount !== 1 ? "s" : ""}${pendingCount > 0 ? `, ${pendingCount} guardando...` : ""}`
                    : "Completá el producto y guardá para crear otro"}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <FormWithKeyboardNav onSubmit={handleSave} onCancel={handleClose} className="flex flex-col flex-1 min-h-0" autoFocusOnMount={false}>
              <div className="overflow-y-auto flex-1 p-4 space-y-3">
                {entryError && (
                  <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs px-3 py-2 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{entryError}</span>
                  </div>
                )}
                <EntryForm
                  entry={entry}
                  storeEnabled={storeEnabled}
                  onUpdate={updateEntry}
                  nameInputRef={nameInputRef}
                />

                {history.length > 0 && (
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-700/50">
                    <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mb-1.5 uppercase tracking-wide">
                      Productos recientes
                    </p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
                      {history.map((h) => (
                        <div
                          key={h.id}
                          onClick={() => h.status === "error" && restoreFailedEntry(h)}
                          title={h.status === "error" && h.errorMsg ? `${h.productName} — ${h.errorMsg}` : undefined}
                          className={`shrink-0 flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg border text-xs min-w-[110px] max-w-[140px] ${
                            h.status === "error" ? "cursor-pointer hover:ring-2 hover:ring-red-400/50 active:scale-95 transition-all" : ""
                          } ${
                            h.status === "ok"
                              ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                              : h.status === "error"
                                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                                : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            {h.status === "ok" ? (
                              <Check className="w-3 h-3 shrink-0" />
                            ) : h.status === "error" ? (
                              <AlertCircle className="w-3 h-3 shrink-0" />
                            ) : (
                              <Loader className="w-3 h-3 shrink-0 animate-spin" />
                            )}
                            <span className="font-medium truncate">{h.productName}</span>
                          </div>
                          <span className="text-[10px] tabular-nums opacity-60">x{h.qty}</span>
                          {h.status === "error" && h.errorMsg && (
                            <span className="text-[10px] truncate opacity-70">{h.errorMsg}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end shrink-0">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white py-2 px-6 rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 disabled:opacity-70 disabled:cursor-wait disabled:shadow-none transition-all duration-300 cursor-pointer select-none"
                >
                  {saving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar"
                  )}
                </button>
              </div>
            </FormWithKeyboardNav>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modalNode, document.body);
}

function EntryForm({
  entry,
  storeEnabled,
  onUpdate,
  nameInputRef,
}: {
  entry: BatchEntry;
  storeEnabled: boolean;
  onUpdate: (patch: Partial<BatchEntry>) => void;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      onUpdate({
        image: file,
        imagePreview: typeof reader.result === "string" ? reader.result : null,
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3">
      {/* Nombre */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Producto <span className="text-red-500">*</span>
        </label>
        <input
          ref={nameInputRef}
          data-form-nav="self"
          type="text"
          placeholder="Nombre del producto"
          value={entry.nombre_producto}
          onChange={(e) => onUpdate({ nombre_producto: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
        />
      </div>

      {/* Cantidad + Costo */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Cantidad inicial
          </label>
          <input
            type="number"
            data-form-nav="self"
            min="0"
            value={entry.quantity}
            onChange={(e) => {
              const val = e.target.value;
              onUpdate({ quantity: val === "" ? "" : Math.max(0, parseInt(val) || 0) });
            }}
            className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Costo unitario ($)
          </label>
          <input
            type="number"
            data-form-nav="self"
            min="0"
            step="0.01"
            value={entry.unit_cost}
            onChange={(e) => {
              const val = e.target.value;
              onUpdate({ unit_cost: val === "" ? "" : Math.max(0, parseFloat(val) || 0) });
            }}
            className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
          />
        </div>
      </div>

      {/* Vender online */}
      {storeEnabled && (
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">Vender online</span>
          </div>
          <button
            type="button"
            data-form-nav="skip"
            onClick={() => onUpdate({ for_sale: !entry.for_sale })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
              entry.for_sale ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-600"
            }`}
            role="switch"
            aria-checked={entry.for_sale}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                entry.for_sale ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      {/* Datos de venta */}
      {storeEnabled && entry.for_sale && (
        <div className="space-y-3">
          <button
            type="button"
            data-form-nav="skip"
            onClick={() => fileInputRef.current?.click()}
            className="group relative w-full h-24 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 overflow-hidden hover:border-violet-400 dark:hover:border-violet-500 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label="Subir imagen del producto"
          >
            <input
              ref={fileInputRef}
              key={entry.id}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              tabIndex={-1}
              onChange={handleFileChange}
            />
            {entry.imagePreview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={entry.imagePreview} alt="Vista previa" className="absolute inset-0 w-full h-full object-cover" />
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate({ image: null, imagePreview: null });
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </span>
              </>
            ) : (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-zinc-400 dark:text-zinc-500 group-hover:text-violet-500 transition-colors">
                <ImagePlus className="w-5 h-5" />
                <span className="text-xs font-medium">Subir imagen</span>
              </span>
            )}
          </button>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Precio de venta ($) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              data-form-nav="self"
              min="0"
              step="0.01"
              value={entry.price}
              onChange={(e) => {
                const val = e.target.value;
                onUpdate({ price: val === "" ? "" : Math.max(0, parseFloat(val) || 0) });
              }}
              className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Descripción
            </label>
            <input
              type="text"
              data-form-nav="self"
              placeholder="Opcional"
              value={entry.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
        <Plus className="w-3 h-3" />
        Al guardar, el formulario se limpia para cargar el próximo producto
      </div>
    </div>
  );
}
