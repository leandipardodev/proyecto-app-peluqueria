"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

const BUG_REPORT_EMAIL = "soporte@klip.com.ar";

function buildMailtoLink(subject: string, body: string) {
  const params = new URLSearchParams({
    subject,
    body,
  });
  return `mailto:${BUG_REPORT_EMAIL}?${params.toString()}`;
}

export default function BugReportModal() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const summaryRef = useRef<HTMLInputElement>(null);

  const environmentDetails = useMemo(() => {
    if (typeof window === "undefined") return "";
    return [
      `Ruta: ${pathname}`,
      `URL: ${window.location.href}`,
      `Navegador: ${window.navigator.userAgent}`,
      `Fecha: ${new Date().toISOString()}`,
    ].join("\n");
  }, [pathname]);

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }

    window.addEventListener("dashboard:open-bug-report", handleOpen as EventListener);
    return () => window.removeEventListener("dashboard:open-bug-report", handleOpen as EventListener);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => summaryRef.current?.focus(), 50);
    }
  }, [open]);

  function handleClose() {
    setOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = [
      `Resumen: ${summary || "Sin resumen"}`,
      "",
      "Descripcion:",
      details || "Sin detalles",
      "",
      "Contexto tecnico:",
      environmentDetails,
    ].join("\n");

    window.location.href = buildMailtoLink(`[Bug] ${summary || "Reporte desde dashboard"}`, message);
    setOpen(false);
    setSummary("");
    setDetails("");
  }

  if (!open) return null;

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
        className="w-full max-w-xl rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white p-6 shadow-2xl dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Reportar un bug</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Contanos que paso y abrimos tu cliente de correo con el reporte.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            ref={summaryRef}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Resumen corto del problema"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none ring-[#0071E3] placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            maxLength={120}
            required
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Que hiciste, que esperabas y que sucedio"
            className="min-h-36 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none ring-[#0071E3] placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            required
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-full bg-[#0071E3] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#005fcc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            >
              Enviar reporte
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
