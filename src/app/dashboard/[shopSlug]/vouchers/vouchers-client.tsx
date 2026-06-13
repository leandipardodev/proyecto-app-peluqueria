"use client";

import { useEffect, useMemo, useState, useTransition, useRef } from "react";
import { fetchVouchers, createVoucher, markVoucherRedeemed, markVoucherReminderSent, type VoucherRow } from "@/lib/dashboard/voucher-actions";
import { DEFAULT_VOUCHER_WHATSAPP_TEMPLATE } from "@/lib/dashboard/voucher-constants";
import { CheckCircle2, Gift, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Props = {
  shopId: string;
  initialVouchers: VoucherRow[];
  initialTemplate?: string;
};

function isBirthdayToday(dateStr: string): boolean {
  const d = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
}

function voucherWhatsappText(v: VoucherRow, template: string) {
  return template
    .replace(/\@Nombre/g, v.gifted_to_name)
    .replace(/\@Servicio/g, v.service_name)
    .replace(/\@Regala/g, v.gifted_by_name ? `, regalo de ${v.gifted_by_name}` : "");
}

export default function VouchersClient({ shopId, initialVouchers, initialTemplate }: Props) {
  const [vouchers, setVouchers] = useState(initialVouchers);
  const template = useMemo(() => initialTemplate || DEFAULT_VOUCHER_WHATSAPP_TEMPLATE, [initialTemplate]);

  useEffect(() => {
    setVouchers(initialVouchers);
  }, [initialVouchers]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const realtimeCooldown = useRef(false);

  useEffect(() => {
    const handleChange = async () => {
      if (realtimeCooldown.current) return;
      realtimeCooldown.current = true;
      setTimeout(() => { realtimeCooldown.current = false; }, 2000);
      const result = await fetchVouchers(shopId);
      if (result.success && Array.isArray(result.data)) {
        setVouchers(result.data);
      }
    };

    const channel = supabase
      .channel(`vouchers-${shopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vouchers", filter: `shop_id=eq.${shopId}` },
        handleChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId]);

  const todayBirthdays = useMemo(() => vouchers.filter((v) => isBirthdayToday(v.gifted_to_birthday) && v.status !== "redeemed"), [vouchers]);

  async function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createVoucher(formData, shopId);
      if (!result.success) {
        setError(result.error);
        return;
      }
    });
  }

  function openWhatsapp(v: VoucherRow) {
    if (!v.gifted_to_phone) return;
    const phone = v.gifted_to_phone.replace(/[^\d]/g, "");
    const text = voucherWhatsappText(v, template);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");

    startTransition(async () => {
      await markVoucherReminderSent(v.id, shopId);
      setVouchers((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: "sent", reminder_sent_at: new Date().toISOString() } : x)));
    });
  }

  function markRedeemed(v: VoucherRow) {
    startTransition(async () => {
      const res = await markVoucherRedeemed(v.id, shopId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setVouchers((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: "redeemed", redeemed_at: new Date().toISOString() } : x)));
    });
  }

  return (
    <div className="space-y-6 p-3 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Vouchers</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Regalos de cumple y recordatorio por WhatsApp.</p>
      </div>

      {todayBirthdays.length > 0 && (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
          Hoy cumplen {todayBirthdays.length} cliente(s) con voucher pendiente.
        </div>
      )}

      <form action={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl shadow-black/[0.03]">
        <input name="gifted_to_name" required placeholder="Nombre de quien recibe" className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" />
        <input name="gifted_to_phone" placeholder="Telefono (WhatsApp)" className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" />
        <input name="gifted_to_birthday" required type="date" className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" />
        <input name="gifted_by_name" placeholder="Quien regala" className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" />
        <input name="service_name" required placeholder="Servicio (ej: Color + brushing)" className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 md:col-span-2" />
        <textarea name="voucher_message" placeholder="Mensaje del voucher (opcional)" className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 md:col-span-2" rows={2} />
        {error && <div className="text-red-600 dark:text-red-300 text-sm md:col-span-2">{error}</div>}
        <button disabled={pending} className="md:col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-60">
          <Gift className="w-4 h-4" />
          Crear voucher
        </button>
      </form>

      <div className="rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xl shadow-black/[0.03]">
        <table className="w-full text-sm">
          <thead className="bg-white dark:bg-zinc-900">
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-white/20 dark:border-white/10">
              <th className="px-4 py-3">Recibe</th>
              <th className="px-4 py-3">Cumple</th>
              <th className="px-4 py-3">Servicio</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id} className="border-b border-white/15 last:border-0">
                <td className="px-4 py-3">{v.gifted_to_name}</td>
                <td className="px-4 py-3">{new Date(`${v.gifted_to_birthday}T00:00:00`).toLocaleDateString("es-AR")}</td>
                <td className="px-4 py-3">{v.service_name}</td>
                <td className="px-4 py-3 capitalize text-gray-700 dark:text-gray-300">{v.status}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button disabled={!v.gifted_to_phone || pending || v.status === "redeemed"} onClick={() => openWhatsapp(v)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 bg-emerald-600 text-white disabled:opacity-40">
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp
                  </button>
                  <button disabled={pending || v.status === "redeemed"} onClick={() => markRedeemed(v)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 disabled:opacity-40">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Canjeado
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
