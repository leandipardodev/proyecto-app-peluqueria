"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { Bug } from "lucide-react";
import BaseModal from "@/components/ui/modal";

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

  return (
    <BaseModal open={open} onClose={handleClose} title="Reportar un bug" subtitle="Contanos que paso y abrimos tu cliente de correo con el reporte." maxWidth="md" icon={<Bug className="h-5 w-5 text-red-500" />}>
      <form onSubmit={handleSubmit} className="p-5 space-y-3">
        <input
          ref={summaryRef}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Resumen corto del problema"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-violet-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          maxLength={120}
          required
        />
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="Que hiciste, que esperabas y que sucedio"
          className="min-h-36 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-violet-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          required
        />
        <div className="flex justify-end">
          <button type="submit" className="ui-btn-primary rounded-lg px-5 py-2 text-sm font-medium">
            Enviar reporte
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
