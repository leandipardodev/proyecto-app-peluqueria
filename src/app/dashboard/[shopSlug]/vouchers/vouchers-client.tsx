"use client";

import { useEffect, useMemo, useState, useTransition, useRef } from "react";
import { createVoucher, markVoucherRedeemed, markVoucherReminderSent, type VoucherRow } from "@/lib/dashboard/vouchers/voucher-actions";
import { DEFAULT_VOUCHER_WHATSAPP_TEMPLATE } from "@/lib/dashboard/vouchers/voucher-constants";
import { getArgentinaDateString } from "@/lib/argentina-time";
import { createPortal } from "react-dom";
import { CheckCircle2, Gift, MessageCircle, Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Props = {
  shopId: string;
  initialVouchers: VoucherRow[];
  initialTemplate?: string;
  initialServices?: { id: string; name: string }[];
  initialCustomers?: { id: string; nombre: string | null; telefono: string | null; cumpleaños: string | null }[];
};

function isBirthdayToday(dateStr: string): boolean {
  if (!dateStr) return false;
  const birthday = dateStr.slice(5);
  return birthday === getArgentinaDateString().slice(5);
}

function voucherWhatsappText(v: VoucherRow, template: string) {
  return template
    .replace(/\@Nombre/g, v.gifted_to_name)
    .replace(/\@Servicio/g, v.service_name)
    .replace(/\@Regala/g, v.gifted_by_name ? `, regalo de ${v.gifted_by_name}` : "");
}

export default function VouchersClient({ shopId, initialVouchers, initialTemplate, initialServices = [], initialCustomers = [] }: Props) {
  const [vouchers, setVouchers] = useState(initialVouchers);
  const template = useMemo(() => initialTemplate || DEFAULT_VOUCHER_WHATSAPP_TEMPLATE, [initialTemplate]);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [birthdayValue, setBirthdayValue] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [recipientDropdownStyle, setRecipientDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const recipientInputRef = useRef<HTMLInputElement>(null);
  const recipientDropdownRef = useRef<HTMLDivElement>(null);

  const filteredRecipients = useMemo(() => {
    if (!recipientQuery.trim()) return initialCustomers;
    const q = recipientQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return initialCustomers.filter((c) =>
      (c.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
    );
  }, [initialCustomers, recipientQuery]);

  function handleRecipientSelect(c: { id: string; nombre: string | null; telefono: string | null; cumpleaños: string | null }) {
    setSelectedCustomerId(c.id);
    setRecipientQuery(c.nombre ?? "");
    setPhoneValue(c.telefono ?? "");
    setBirthdayValue(c.cumpleaños ?? "");
    setRecipientOpen(false);
  }

  function handleRecipientChange(value: string) {
    if (selectedCustomerId) {
      const selected = initialCustomers.find((c) => c.id === selectedCustomerId);
      if (selected && (selected.nombre ?? "") !== value.trim()) setSelectedCustomerId("");
    }
    setRecipientQuery(value);
    if (!recipientOpen) {
      setRecipientOpen(true);
      if (recipientInputRef.current) {
        const r = recipientInputRef.current.getBoundingClientRect();
        setRecipientDropdownStyle({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    }
  }

  useEffect(() => {
    if (!recipientOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (recipientDropdownRef.current?.contains(target)) return;
      if (recipientInputRef.current?.contains(target)) return;
      setRecipientOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [recipientOpen]);

  useEffect(() => {
    if (!recipientOpen) return;
    const recalc = () => {
      if (recipientInputRef.current) {
        const r = recipientInputRef.current.getBoundingClientRect();
        setRecipientDropdownStyle({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    };
    function handleMove(e: Event) {
      if (e.type === "resize") {
        recalc();
        return;
      }
      const target = e.target as Node;
      if (recipientDropdownRef.current?.contains(target)) return;
      setRecipientOpen(false);
    }
    window.addEventListener("scroll", handleMove, true);
    window.addEventListener("resize", handleMove);
    window.visualViewport?.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("scroll", handleMove, true);
      window.removeEventListener("resize", handleMove);
      window.visualViewport?.removeEventListener("resize", recalc);
    };
  }, [recipientOpen]);

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
      setTimeout(() => { realtimeCooldown.current = false; }, 5000);
      const { data, error } = await supabase
        .from("vouchers")
        .select("id, gifted_to_name, gifted_to_phone, gifted_to_birthday, gifted_by_name, service_name, voucher_message, status, reminder_sent_at, redeemed_at, created_at")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false });
      if (!error && data) {
        setVouchers(data as VoucherRow[]);
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
        <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-tight leading-none">Vouchers</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Regalos de cumple y recordatorio por WhatsApp.</p>
      </div>

      {todayBirthdays.length > 0 && (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
          Hoy cumplen {todayBirthdays.length} cliente(s) con voucher pendiente.
        </div>
      )}

      <form action={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl shadow-black/[0.03]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          <input
            ref={recipientInputRef}
            name="gifted_to_name"
            required
            placeholder="Nombre de quien recibe"
            value={recipientQuery}
            onChange={(e) => handleRecipientChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && recipientOpen && filteredRecipients.length > 0) {
                e.preventDefault();
                recipientDropdownRef.current?.querySelector<HTMLButtonElement>("button")?.click();
              } else if (e.key === "ArrowDown" && recipientOpen) {
                e.preventDefault();
                recipientDropdownRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setRecipientOpen(false);
                recipientInputRef.current?.focus();
              }
            }}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100"
          />
          {recipientOpen && recipientDropdownStyle && (filteredRecipients.length > 0 || recipientQuery.trim()) && typeof document !== "undefined" && createPortal(
            <div
              ref={recipientDropdownRef}
              onMouseDown={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
                const activeIdx = buttons.indexOf(document.activeElement as HTMLButtonElement);
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const next = activeIdx < buttons.length - 1 ? activeIdx + 1 : 0;
                  buttons[next]?.focus();
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  if (activeIdx > 0) {
                    buttons[activeIdx - 1]?.focus();
                  } else {
                    recipientInputRef.current?.focus();
                  }
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setRecipientOpen(false);
                  recipientInputRef.current?.focus();
                }
              }}
              style={{ position: "fixed", top: recipientDropdownStyle.top, left: recipientDropdownStyle.left, width: recipientDropdownStyle.width, zIndex: 9999 }}
              className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden py-1 max-h-48 overflow-y-auto"
            >
              {filteredRecipients.length > 0 ? (
                filteredRecipients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleRecipientSelect(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRecipientSelect(c);
                      }
                    }}
                    className="w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer select-none text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                  >
                    <span className="font-medium">{c.nombre || "Sin nombre"}</span>
                    {c.telefono && <span className="ml-2 text-xs text-zinc-400">{c.telefono}</span>}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2.5 text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Se creará como cliente nuevo
                </div>
              )}
            </div>,
            document.body
          )}
          <input type="hidden" name="customer_id" value={selectedCustomerId} />
        </div>
        <div>
          <select
            name="service_id"
            value={selectedServiceId}
            onChange={(e) => setSelectedServiceId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="">Servicio (del catálogo)</option>
            {initialServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {initialServices.length === 0 && (
            <p className="mt-1 px-1 text-xs text-zinc-500 dark:text-zinc-400">No hay servicios en el catálogo todavía.</p>
          )}
        </div>
        <input name="gifted_to_phone" placeholder="Telefono (WhatsApp)" value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" />
        <input name="gifted_to_birthday" required type="date" value={birthdayValue} onChange={(e) => setBirthdayValue(e.target.value)} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" />
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
