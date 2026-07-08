"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { X, Plus, Loader2, Check, AlertCircle } from "lucide-react";
import { addProducts } from "@/lib/dashboard/inventory/inventory-actions";
import { useToast } from "@/components/ui/toast";

interface BatchEntry {
  id: string;
  nombre_producto: string;
  quantity: number | "";
  unit_cost: number | "";
}

let entryCounter = 0;

function createEmptyEntry(): BatchEntry {
  entryCounter++;
  return { id: `entry-${entryCounter}`, nombre_producto: "", quantity: "", unit_cost: "" };
}

interface BatchAddProductModalProps {
  shopId: string;
  open: boolean;
  onClose: () => void;
}

export default function BatchAddProductModal({ shopId, open, onClose }: BatchAddProductModalProps) {
  const { addToast } = useToast();
  const router = useRouter();
  const [entries, setEntries] = useState<BatchEntry[]>([createEmptyEntry()]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ ok: number; fail: number } | null>(null);

  function updateEntry(id: string, patch: Partial<BatchEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function addEntry() {
    setEntries((prev) => [...prev, createEmptyEntry()]);
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function reset() {
    setEntries([createEmptyEntry()]);
    setSaving(false);
    setProgress({ current: 0, total: 0 });
    setResults(null);
  }

  async function handleSave() {
    setSaving(true);
    setResults(null);

    const valid = entries.filter((e) => e.nombre_producto.trim());
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < valid.length; i++) {
      setProgress({ current: i + 1, total: valid.length });
      const result = await addProducts([{
        nombre_producto: valid[i].nombre_producto,
        quantity: Number(valid[i].quantity || 0),
        unit_cost: Number(valid[i].unit_cost || 0),
      }], shopId);
      if (result.success) ok++;
      else fail++;
    }

    setResults({ ok, fail });
    setSaving(false);
    router.refresh();
    addToast(`${ok} producto${ok !== 1 ? "s" : ""} agregado${ok !== 1 ? "s" : ""}${fail > 0 ? `, ${fail} error${fail !== 1 ? "es" : ""}` : ""}`, fail > 0 ? "error" : "success");
    if (fail === 0) {
      onClose();
      reset();
    }
  }

  function handleRetry() {
    setResults(null);
    setProgress({ current: 0, total: 0 });
  }

  if (!open) return null;

  const modalNode = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/20 p-3 sm:p-4"
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
                  {entries.filter((e) => e.nombre_producto.trim()).length} producto{entries.filter((e) => e.nombre_producto.trim()).length !== 1 ? "s" : ""} para agregar
                </p>
              </div>
              <button
                onClick={() => { reset(); onClose(); }}
                disabled={saving}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {results ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  {results.fail === 0 ? (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                      <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                      <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                  )}
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {results.ok} agregado{results.ok !== 1 ? "s" : ""}
                    {results.fail > 0 && `, ${results.fail} error${results.fail !== 1 ? "es" : ""}`}
                  </p>
                  {results.fail > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="ui-btn-ghost rounded-lg px-4 py-1.5 text-sm"
                      >
                        Revisar errores
                      </button>
                      <button
                        type="button"
                        onClick={() => { reset(); onClose(); }}
                        className="ui-btn-primary rounded-lg px-4 py-1.5 text-sm font-medium"
                      >
                        Cerrar
                      </button>
                    </div>
                  )}
                </div>
              ) : saving ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="h-8 w-8 text-[#0071E3] animate-spin" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Agregando producto {progress.current} de {progress.total}...
                  </p>
                  <div className="w-48 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-[#0071E3]"
                      initial={{ width: 0 }}
                      animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              ) : (
                entries.map((entry, index) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    index={index}
                    onUpdate={(patch) => updateEntry(entry.id, patch)}
                    onRemove={() => removeEntry(entry.id)}
                    canRemove={entries.length > 1}
                  />
                ))
              )}
            </div>

            {!saving && !results && (
              <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={addEntry}
                  className="ui-btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Agregar otro producto
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!entries.some((e) => e.nombre_producto.trim())}
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white py-2 px-6 rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all cursor-pointer select-none"
                >
                  Guardar todos ({entries.length})
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modalNode, document.body);
}

function EntryCard({
  entry,
  index,
  onUpdate,
  onRemove,
  canRemove,
}: {
  entry: BatchEntry;
  index: number;
  onUpdate: (patch: Partial<BatchEntry>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-[11px] font-semibold text-violet-700 dark:text-violet-300 shrink-0">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              placeholder="Nombre del producto"
              value={entry.nombre_producto}
              onChange={(e) => onUpdate({ nombre_producto: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
            />
          </div>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer select-none shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cantidad inicial
            </label>
            <input
              type="number"
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
      </div>
    </div>
  );
}
