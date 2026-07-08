"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BaseModal from "@/components/ui/modal";

type AlertItem = {
  id: string;
  gifted_to_name: string;
  service_name: string;
  gifted_by_name: string | null;
};

type Props = {
  shopSlug: string;
  items: AlertItem[];
};

export default function VoucherBirthdayAlert({ shopSlug, items }: Props) {
  const [open, setOpen] = useState(false);
  const todayKey = useMemo(() => {
    const now = new Date();
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return `voucher-alert-dismissed:${shopSlug}:${d}`;
  }, [shopSlug]);

  useEffect(() => {
    if (items.length === 0) {
      setOpen(false);
      return;
    }
    try {
      const dismissed = window.localStorage.getItem(todayKey);
      setOpen(!dismissed);
    } catch {
      setOpen(true);
    }
  }, [items.length, todayKey]);

  function handleDismiss() {
    try {
      window.localStorage.setItem(todayKey, "1");
    } catch {}
    setOpen(false);
  }

  if (!open || items.length === 0) return null;

  return (
    <BaseModal open={open} onClose={handleDismiss} title="Cumpleanos con voucher hoy" subtitle={`Tenes ${items.length} voucher(s) para recordar hoy.`} maxWidth="md">
      <div className="p-5 space-y-2 max-h-60 overflow-auto">
        {items.map((v) => (
          <div key={v.id} className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/50 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            <span className="font-medium">{v.gifted_to_name}</span>
            <span> - {v.service_name}</span>
            {v.gifted_by_name ? <span className="text-amber-700 dark:text-amber-400"> (regala: {v.gifted_by_name})</span> : null}
          </div>
        ))}
      </div>
      <div className="px-5 pb-5 flex items-center justify-end gap-2">
        <Link
          href={`/dashboard/${shopSlug}/vouchers`}
          className="ui-btn-primary rounded-lg px-3 py-1.5 text-sm font-medium"
        >
          Ver vouchers
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          className="ui-btn-ghost rounded-lg px-3 py-1.5 text-sm font-medium"
        >
          Entendido
        </button>
      </div>
    </BaseModal>
  );
}
