"use client";

import { useEffect, useState } from "react";
import { Download, QrCode } from "lucide-react";
import QRCode from "qrcode";
import BaseModal from "@/components/ui/modal";

type Props = {
  open: boolean;
  onClose: () => void;
  url: string;
  /** Nombre del local o vendedor, para el texto del modal. */
  label?: string;
};

/**
 * QR del link de referido. Deliberadamente sin PDF ni jspdf: el QR de referido lo
 * usa el vendedor para ponerlo en un cartel o compartirlo, no para imprimir una
 * landing. El QR de reservas tiene su propio modal, mas pesado.
 */
export default function ReferralQrModal({ open, onClose, url, label }: Props) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    setDataUrl("");

    QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      color: { dark: "#0f172aff", light: "#ffffffff" },
    })
      .then((result) => {
        if (!cancelled) setDataUrl(result);
      })
      .catch(() => {
        if (!cancelled) setDataUrl("");
      });

    return () => {
      cancelled = true;
    };
  }, [open, url]);

  function download() {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.download = `qr-referido-${label || "klip"}.png`;
    link.href = dataUrl;
    link.click();
  }

  return (
    <BaseModal open={open} onClose={onClose} title="QR de tu link" icon={<QrCode className="h-5 w-5" />}>
      <div className="flex flex-col items-center gap-4 px-6 py-6">
        {dataUrl ? (
          <img src={dataUrl} alt={`QR de ${url}`} className="h-56 w-56 rounded-2xl" />
        ) : (
          <div className="h-56 w-56 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        )}

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-300">
          {label ? `Compartilo como link de ${label}.` : "Compartilo como tu link de referido."}
        </p>

        <p className="break-all text-center font-mono text-xs text-zinc-400">{url}</p>

        <button
          type="button"
          onClick={download}
          disabled={!dataUrl}
          className="ui-btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Descargar
        </button>
      </div>
    </BaseModal>
  );
}
