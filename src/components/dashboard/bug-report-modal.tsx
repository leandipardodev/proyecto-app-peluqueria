"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/20 bg-white/95 p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950/92">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Reportar un bug</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Contanos que paso y abrimos tu cliente de correo con el reporte.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Resumen corto del problema"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none ring-[#0071E3] placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            maxLength={120}
            required
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Que hiciste, que esperabas y que sucedio"
            className="min-h-36 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none ring-[#0071E3] placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            required
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-full bg-[#0071E3] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#005fcc]"
            >
              Enviar reporte
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
