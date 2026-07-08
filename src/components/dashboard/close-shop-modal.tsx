"use client";

import { Trash2 } from "lucide-react";
import BaseModal from "@/components/ui/modal";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  confirmText: string;
  onConfirmTextChange: (v: string) => void;
  onConfirm: () => void;
  pending: boolean;
};

export default function CloseShopModal({ isOpen, onClose, confirmText, onConfirmTextChange, onConfirm, pending }: Props) {
  return (
    <BaseModal open={isOpen} onClose={() => { if (!pending) onClose(); }} title="Cerrar local" maxWidth="sm" icon={<Trash2 className="h-4 w-4 text-red-500" />}>
      <div className="p-5">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
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
      </div>
      <div className="px-5 pb-5 flex items-center justify-end gap-2">
        <button type="button" className="ui-btn-ghost rounded-lg px-4 py-2 text-sm" onClick={onClose} disabled={pending}>Cancelar</button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || confirmText.trim().toUpperCase() !== "CONFIRMAR"}
          className="ui-btn-primary rounded-lg px-4 py-2 text-sm"
        >
          {pending ? "Cerrando..." : "Cerrar local"}
        </button>
      </div>
    </BaseModal>
  );
}
