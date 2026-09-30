"use client";

import { useState } from "react";
import { Check, Copy, HelpCircle, QrCode } from "lucide-react";
import BaseModal from "@/components/ui/modal";
import { buildPartnerReferralLink } from "@/lib/referrals/partner-message";
import ReferralQrModal from "@/components/referrals/referral-qr-modal";

type Props = {
  referralCode: string;
  /** Origen publico de Klip, resuelto en el server para no hidratar distinto. */
  baseUrl: string;
  partnerName: string;
  commissionPercent: number;
  commissionMonths: number;
};

/**
 * El link del vendedor, en una sola linea.
 *
 * Antes esto era un recuadro azul con boton de WhatsApp que, ademas, era un
 * <Link href="/r/<codigo>">: al apretarlo el propio panel se ponia la cookie de
 * atribucion y se convertia en su propio referido. Ahora es copiar y QR, que es
 * como un vendedor reparte un link.
 */
export default function PartnerShare({
  referralCode,
  baseUrl,
  partnerName,
  commissionPercent,
  commissionMonths,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const link = buildPartnerReferralLink(baseUrl, referralCode);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const input = document.getElementById("partner-share-link") as HTMLInputElement | null;
      input?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-white/70 px-4 py-2.5 dark:border-zinc-800 dark:bg-white/5">
          <span
            id="partner-share-link"
            className="block truncate font-mono text-sm text-zinc-600 dark:text-zinc-300"
            title={link}
          >
            {link}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copiar link"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white/70 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-white dark:border-zinc-800 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          <span className="hidden sm:inline">{copied ? "Copiado" : "Copiar"}</span>
        </button>

        <button
          type="button"
          onClick={() => setQrOpen(true)}
          aria-label="Ver QR del link"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white/70 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-white dark:border-zinc-800 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
        >
          <QrCode className="h-4 w-4" />
          <span className="hidden sm:inline">QR</span>
        </button>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="Para qué sirve este link"
          className="shrink-0 rounded-full p-2.5 text-zinc-300 transition hover:bg-white/60 hover:text-zinc-500 dark:text-zinc-700 dark:hover:bg-white/5 dark:hover:text-zinc-400"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>

      <BaseModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Para qué sirve este link"
        icon={<HelpCircle className="h-5 w-5" />}
        maxWidth="md"
      >
        <div className="space-y-4 px-6 py-6 text-sm font-light leading-relaxed text-zinc-600 dark:text-zinc-300">
          <p>
            Mandás este link a las peluquerías, barberías o centros de estética que conozcas. Si alguien entra
            por ahí y crea su cuenta de Klip, ese local queda asociado a vos.
          </p>
          <p>
            No hace falta que el dueño se registre enseguida: si alguien abre tu link y vuelve a Klip más
            tarde, el local todavía queda asociado a vos.
          </p>
          <p>
            Cada local que se registre te deja el {commissionPercent}% de lo que Klip recibe de ese local, durante
            los primeros {commissionMonths} pagos. Klip te transfiere una vez por local y por mes.
          </p>
          <p className="text-zinc-400">
            Un local puede quedar con un solo vendedor: se queda el primero que lo trajo.
          </p>
        </div>
      </BaseModal>

      <ReferralQrModal open={qrOpen} onClose={() => setQrOpen(false)} url={link} label={partnerName} />
    </>
  );
}
