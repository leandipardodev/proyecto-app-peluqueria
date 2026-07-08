"use client";

import BaseModal from "@/components/ui/modal";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  shopName: string;
  onShopNameChange: (v: string) => void;
  onCreate: () => void;
  creating: boolean;
};

export default function CreateShopModal({ isOpen, onClose, shopName, onShopNameChange, onCreate, creating }: Props) {
  return (
    <BaseModal open={isOpen} onClose={() => { if (!creating) onClose(); }} title="Crear nuevo local" maxWidth="sm">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
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
          className="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-violet-500"
          autoFocus
        />
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button type="button" className="ui-btn-ghost rounded-lg px-4 py-2 text-sm" onClick={onClose} disabled={creating}>Cancelar</button>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating || !shopName.trim()}
          className="ui-btn-primary rounded-lg px-4 py-2 text-sm"
        >
          {creating ? "Creando..." : "Crear local"}
        </button>
      </div>
    </BaseModal>
  );
}
