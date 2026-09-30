"use client";

import { useState } from "react";
import { Check, Copy, Link2, QrCode } from "lucide-react";
import BaseModal from "@/components/ui/modal";
import ReferralQrModal from "@/components/referrals/referral-qr-modal";
import { PinReveal, PinButton } from "@/components/admin/referrals/partner-access";
import { buildPartnerReferralLink, buildPartnerPortalLink } from "@/lib/referrals/partner-message";

type Props = {
  partnerId: string;
  partnerName: string;
  referralCode: string;
  hasPin: boolean;
  pinLast4: string | null;
  baseUrl: string;
};

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard bloqueado: el valor esta a la vista igual */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</p>
        <p className={`truncate text-sm text-zinc-800 ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copiar ${label.toLowerCase()}`}
        className="shrink-0 rounded-full border border-zinc-200 p-2 text-zinc-500 transition hover:bg-zinc-50"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/**
 * Todo lo que necesita un vendedor, en un solo lugar.
 *
 * El codigo de referido se ve siempre y jamas hay que regenerarlo para
 * consultarlo: es publico, va en el link y no es un secreto. Lo secreto es el
 * PIN, y ese sale una sola vez al generarlo.
 */
export default function PartnerLinkModal({
  partnerId,
  partnerName,
  referralCode,
  hasPin,
  pinLast4,
  baseUrl,
}: Props) {
  const [open, setOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [pin, setPin] = useState<string | null>(null);

  const link = buildPartnerReferralLink(baseUrl, referralCode);
  const portal = buildPartnerPortalLink(baseUrl);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        <Link2 className="h-3.5 w-3.5" />
        Link
      </button>

      <BaseModal
        open={open}
        onClose={() => {
          setOpen(false);
          setPin(null);
        }}
        title={partnerName}
        icon={<Link2 className="h-5 w-5" />}
        subtitle="Mandale esto y el vendedor ya puede repartir"
        maxWidth="lg"
      >
        <div className="space-y-6 px-6 py-6">
          <CopyRow label="Link de referido" value={link} />
          <CopyRow label="Código" value={referralCode} />
          <CopyRow label="Panel del vendedor" value={portal} />

          <div className="rounded-2xl border border-zinc-200 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-400">PIN de acceso</p>
            {pin ? (
              <PinReveal partnerName={partnerName} pin={pin} />
            ) : hasPin ? (
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="font-mono text-sm text-zinc-600">
                  Activo, termina en {pinLast4 || "????"}
                </p>
                <PinButton
                  partnerId={partnerId}
                  partnerName={partnerName}
                  hasPin
                  onGenerated={setPin}
                  compact
                />
              </div>
            ) : (
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-500">Todavía no tiene PIN</p>
                <PinButton
                  partnerId={partnerId}
                  partnerName={partnerName}
                  hasPin={false}
                  onGenerated={setPin}
                  compact
                />
              </div>
            )}
            <p className="mt-2 text-xs text-zinc-400">
              El PIN se muestra una sola vez. Si el vendedor lo pierde, generá uno nuevo acá.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50 inline-flex w-full items-center justify-center gap-2  px-5 py-2.5 text-sm font-medium"
          >
            <QrCode className="h-4 w-4" />
            Ver QR del link
          </button>
        </div>
      </BaseModal>

      <ReferralQrModal open={qrOpen} onClose={() => setQrOpen(false)} url={link} label={partnerName} />
    </>
  );
}
