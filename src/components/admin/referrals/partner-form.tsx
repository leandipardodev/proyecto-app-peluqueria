"use client";

import { useMemo, useState } from "react";

type ExistingCode = {
  partnerId: string;
  referralCode: string;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  existingCodes: ExistingCode[];
  partnerId?: string;
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  defaultReferralCode?: string;
  defaultCommissionPercentOverride?: number | null;
  defaultCommissionMonthsOverride?: number | null;
  defaultIsActive?: boolean;
  compact?: boolean;
  submitLabel: string;
};

export default function PartnerForm({
  action,
  existingCodes,
  partnerId,
  defaultName = "",
  defaultEmail = "",
  defaultPhone = "",
  defaultReferralCode = "",
  defaultCommissionPercentOverride = null,
  defaultCommissionMonthsOverride = null,
  defaultIsActive = true,
  compact = false,
  submitLabel,
}: Props) {
  const [referralCode, setReferralCode] = useState(defaultReferralCode);

  const normalized = referralCode.trim().toLowerCase();
  const duplicate = useMemo(() => {
    if (!normalized) return false;
    return existingCodes.some((item) => item.referralCode.trim().toLowerCase() === normalized && item.partnerId !== (partnerId || ""));
  }, [existingCodes, normalized, partnerId]);

  if (compact) {
    return (
      <form action={action} className="flex items-center gap-1">
        <input type="hidden" name="partnerId" value={partnerId || ""} />
        <input name="name" defaultValue={defaultName} className="w-28 rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
        <input name="email" defaultValue={defaultEmail} className="w-36 rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
        <input name="phone" defaultValue={defaultPhone} className="w-24 rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
        <input
          name="referralCode"
          value={referralCode}
          onChange={(event) => setReferralCode(event.target.value)}
          className={`w-24 rounded-lg border px-2 py-1 text-xs ${duplicate ? "border-rose-400 bg-rose-50" : "border-zinc-300"}`}
        />
        <input type="hidden" name="commissionPercentOverride" value={defaultCommissionPercentOverride ?? ""} />
        <input type="hidden" name="commissionMonthsOverride" value={defaultCommissionMonthsOverride ?? ""} />
        <label className="inline-flex items-center gap-1 text-[11px] text-zinc-600"><input type="checkbox" name="isActive" defaultChecked={defaultIsActive} /> activo</label>
        <button type="submit" disabled={duplicate} className="rounded-full bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40">{submitLabel}</button>
      </form>
    );
  }

  return (
    <form action={action} className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
      <h3 className="text-base font-semibold">Crear partner</h3>
      <input type="hidden" name="partnerId" value={partnerId || ""} />
      <input name="name" placeholder="Nombre" defaultValue={defaultName} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" required />
      <input name="email" placeholder="Email" type="email" defaultValue={defaultEmail} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
      <input name="phone" placeholder="Telefono" defaultValue={defaultPhone} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
      <div>
        <input
          name="referralCode"
          placeholder="Codigo referido"
          value={referralCode}
          onChange={(event) => setReferralCode(event.target.value)}
          className={`w-full rounded-xl border px-3 py-2 text-sm ${duplicate ? "border-rose-400 bg-rose-50" : "border-zinc-300"}`}
          required
        />
        {duplicate ? <p className="mt-1 text-xs text-rose-600">Ese codigo ya existe. Usa uno diferente.</p> : null}
      </div>
      <input name="commissionPercentOverride" placeholder="Override % (opcional)" defaultValue={defaultCommissionPercentOverride ?? ""} type="number" min="0" max="100" step="0.1" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
      <input name="commissionMonthsOverride" placeholder="Override meses (opcional)" defaultValue={defaultCommissionMonthsOverride ?? ""} type="number" min="1" max="24" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
      <button type="submit" disabled={duplicate} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{submitLabel}</button>
    </form>
  );
}
