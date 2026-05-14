"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
    <div className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl border border-amber-300/40 bg-amber-50/95 p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-amber-900">Cumpleanos con voucher hoy</h3>
        <p className="text-sm text-amber-800 mt-1">Tenes {items.length} voucher(s) para recordar hoy.</p>
        <div className="mt-4 space-y-2 max-h-60 overflow-auto pr-1">
          {items.map((v) => (
            <div key={v.id} className="rounded-xl bg-white/70 border border-amber-200 px-3 py-2 text-sm text-amber-900">
              <span className="font-medium">{v.gifted_to_name}</span>
              <span> - {v.service_name}</span>
              {v.gifted_by_name ? <span className="text-amber-700"> (regala: {v.gifted_by_name})</span> : null}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Link
            href={`/dashboard/${shopSlug}/vouchers`}
            className="rounded-xl bg-amber-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-amber-700"
          >
            Ver vouchers
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-xl bg-zinc-900 text-white px-3 py-1.5 text-sm font-medium"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
