"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, FileText, QrCode, X } from "lucide-react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";

interface QRModalProps {
  open: boolean;
  bookingUrl: string;
  onClose: () => void;
}

export default function QRModal({ open, bookingUrl, onClose }: QRModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    QRCode.toDataURL(bookingUrl, {
      width: 600,
      margin: 2,
      color: { dark: "#000000ff", light: "#ffffffff" },
    }).then((url) => {
      if (!cancelled) {
        setQrDataUrl(url);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [open, bookingUrl]);

  function downloadQR() {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.download = "qr-reserva.png";
    link.href = qrDataUrl;
    link.click();
  }

  function showPDF() {
    if (!qrDataUrl) return;
    const pdf = generatePDF();
    const blobUrl = pdf.output("bloburl");
    window.open(blobUrl, "_blank");
  }

  function generatePDF() {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();

    pdf.setDocumentProperties({ title: "Reserva tu turno", creator: "KLIP" });

    const sky600 = { r: 2, g: 132, b: 199 };
    const sky500 = { r: 14, g: 165, b: 233 };
    const sky400 = { r: 56, g: 189, b: 248 };
    const sky700 = { r: 3, g: 105, b: 161 };
    const navy = { r: 15, g: 23, b: 42 };
    const white = { r: 255, g: 255, b: 255 };
    const bg = { r: 240, g: 249, b: 255 };
    const muted = { r: 100, g: 116, b: 139 };
    const gray = { r: 148, g: 163, b: 184 };
    const border = { r: 186, g: 230, b: 253 };

    function fc(c: { r: number; g: number; b: number }) {
      pdf.setFillColor(c.r, c.g, c.b);
    }

    function sc(c: { r: number; g: number; b: number }) {
      pdf.setDrawColor(c.r, c.g, c.b);
    }

    function tc(c: { r: number; g: number; b: number }) {
      pdf.setTextColor(c.r, c.g, c.b);
    }

    // Background
    fc(bg);
    pdf.rect(0, 0, pw, ph, "F");

    // Top header bar (solid sky blue)
    const headH = 28;
    fc(sky600);
    pdf.rect(0, 0, pw, headH, "F");

    // White card overlapping the header
    const cm = 5;
    const cy = headH - 5;
    const cw = pw - cm * 2;
    const ch = ph - cy - 5;

    fc(white);
    pdf.rect(cm, cy, cw, ch, "F");
    sc(border);
    pdf.setLineWidth(0.3);
    pdf.rect(cm, cy, cw, ch, "S");

    const cx = pw / 2;

    // Title - bigger, no badge
    const ty = cy + 24;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    tc(navy);
    pdf.text("RESERVÁ TU", cx, ty, { align: "center" });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    tc(sky600);
    pdf.text("TURNO", cx, ty + 14, { align: "center" });

    // Simple divider (no circle)
    const dy = ty + 24;
    sc(border);
    pdf.setLineWidth(0.4);
    pdf.line(cx - 28, dy, cx + 28, dy);

    // QR code (larger, main focus)
    const qs = 66;
    const qp = 6;
    const qbox = qs + qp * 2;
    const qy = dy + 14;
    const qx = cx - qbox / 2;

    sc(border);
    pdf.setLineWidth(0.4);
    pdf.rect(qx, qy, qbox, qbox, "S");

    fc({ r: 240, g: 249, b: 255 });
    pdf.rect(qx + 1.5, qy + 1.5, qbox - 3, qbox - 3, "F");
    sc({ r: 186, g: 230, b: 253 });
    pdf.setLineWidth(0.2);
    pdf.rect(qx + 1.5, qy + 1.5, qbox - 3, qbox - 3, "S");

    pdf.addImage(qrDataUrl, "PNG", qx + qp, qy + qp, qs, qs);

    // Explanation below QR
    const ex = qy + qbox + 8;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    tc(sky700);
    const expLines = pdf.splitTextToSize(
      "Escaneá este QR para entrar a la tienda y reservar tu turno",
      cw - 16
    );
    let ely = ex;
    for (const line of expLines) {
      pdf.text(line, cx, ely, { align: "center" });
      ely += 4.5;
    }

    // URL
    const uy = ely + 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.5);
    tc(gray);
    pdf.text(bookingUrl.replace(/^https?:\/\//, ""), cx, uy, { align: "center", maxWidth: cw - 16 });

    // Bottom thin bar
    const bbH = 3;
    const bbY = ph - bbH;
    fc(sky500);
    pdf.rect(0, bbY, pw, bbH, "F");

    // Footer
    const fy = bbY - 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6);
    tc(muted);
    pdf.text("powered by KLIP", cx, fy, { align: "center" });

    return pdf;
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-sm rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white p-6 shadow-2xl dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-violet-600" />
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Código QR</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 flex flex-col items-center gap-2">
              {loading ? (
                <div className="w-48 h-48 rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
              ) : qrDataUrl ? (
                <>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200 text-center font-medium max-w-full px-2">
                    Escaneá este QR para entrar a la tienda y reservar tu turno
                  </p>
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-3 bg-white">
                    <img
                      src={qrDataUrl}
                      alt={`QR para ${bookingUrl}`}
                      className="w-48 h-48"
                    />
                  </div>
                </>
              ) : null}

              <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center break-all max-w-full px-2">
                {bookingUrl}
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={downloadQR}
                disabled={!qrDataUrl}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                <Download className="w-4 h-4" />
                Descargar QR
              </button>
              <button
                type="button"
                onClick={showPDF}
                disabled={!qrDataUrl}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                <FileText className="w-4 h-4" />
                Ver PDF
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
