"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Plug,
  Unplug,
  Info,
  Wallet,
  FileText,
  Send,
} from "lucide-react";
import {
  getWhatsAppAutomationOverview,
  getEmbeddedSignupConfig,
  updateWhatsAppAutomationSettingsAction,
  prepareWhatsAppTemplatesAction,
  disconnectWhatsAppAction,
  sendWhatsAppTestReminderAction,
  type WhatsAppAutomationOverview,
} from "@/lib/dashboard/whatsapp/wa-actions";
import {
  WA_MESSAGE_LABELS,
  WA_REMINDER_HOURS_OPTIONS,
} from "@/lib/dashboard/whatsapp/wa-constants";
import type { WaMessageType } from "@/lib/dashboard/whatsapp/wa-constants";
import { whatsappEnabled } from "@/lib/dashboard/whatsapp/wa-feature";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadMetaSdk(): Promise<void> {
  if ((window as unknown as { MetaSDK?: unknown }).MetaSDK) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar el SDK de Meta"));
    document.body.appendChild(script);
  });
  for (let i = 0; i < 50; i++) {
    if ((window as unknown as { MetaSDK?: unknown }).MetaSDK) return;
    await delay(100);
  }
  throw new Error("El SDK de Meta tardo demasiado en cargar");
}

type EmbeddedSignupPayload = {
  state?: string;
  token_code?: string;
  waba_id?: string;
  phone_number_id?: string;
};

function ConnectedStamp({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
      <CheckCircle2 className="w-3 h-3" />
      {label}
    </span>
  );
}

function StatusChip({ status }: { status: "approved" | "pending" | "rejected" | "missing" | undefined }) {
  const map = {
    approved: { text: "Aprobada", cls: "bg-green-500/10 text-green-700 dark:text-green-400" },
    pending: { text: "En revision", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    rejected: { text: "Rechazada", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
    missing: { text: "Falta crear", cls: "bg-zinc-500/10 text-zinc-500" },
  } as const;
  const v = map[status || "missing"];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${v.cls}`}>{v.text}</span>;
}

const DEFAULT_OVERVIEW: WhatsAppAutomationOverview = {
  connected: false,
  wabaId: null,
  phoneNumberId: null,
  connectedAt: null,
  remindEnabled: false,
  feedbackEnabled: false,
  birthdayEnabled: false,
  remindHoursBefore: 3,
  envKnownMissing: [],
  messages: [
    { type: "reminder", count: 0, estimatedArs: 0 },
    { type: "feedback", count: 0, estimatedArs: 0 },
    { type: "birthday", count: 0, estimatedArs: 0 },
  ],
  templateStatus: {},
};

export default function WhatsAppAutomationPanel({
  initial,
  isOwnerOrAdmin,
  shopName,
}: {
  initial: WhatsAppAutomationOverview | null | undefined;
  isOwnerOrAdmin: boolean;
  shopName?: string | null;
}) {
  const [overview, setOverview] = useState<WhatsAppAutomationOverview>(initial ?? DEFAULT_OVERVIEW);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<"success" | "error" | null>(null);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await getWhatsAppAutomationOverview();
    if (res.success && res.data) setOverview(res.data);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wa = params.get("wa");
    if (!wa) return;
    if (wa === "connected") {
      setBanner("success");
      setError(null);
    } else if (wa.startsWith("error_")) {
      setBanner("error");
    }
    params.delete("wa");
    window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    void refresh();
  }, [refresh]);

  const [settings, setSettings] = useState({
    remindEnabled: initial?.remindEnabled ?? false,
    feedbackEnabled: initial?.feedbackEnabled ?? false,
    birthdayEnabled: initial?.birthdayEnabled ?? false,
    remindHoursBefore: initial?.remindHoursBefore ?? 3,
  });

  const handleConnect = async () => {
    if (!isOwnerOrAdmin || busy) return;
    setError(null);
    setBusy(true);
    try {
      const cfg = await getEmbeddedSignupConfig();
      if (!cfg.success) {
        setError(cfg.error || "No se pudo iniciar la conexion");
        return;
      }
      const config = cfg.data;
      if (!config) {
        setError("No se pudo iniciar la conexion");
        return;
      }

      await loadMetaSdk();
      const metaSdk = (window as unknown as {
        MetaSDK: { embeddedSignup: { embed: (args: Record<string, unknown>) => Promise<EmbeddedSignupPayload> } };
      }).MetaSDK;

      const data = await metaSdk.embeddedSignup.embed({
        app_id: config.appId,
        version: "v21.0",
        state: config.state,
        entity_type: "WABA",
        config: {
          setup_payment_method: false,
          messaging_product: "whatsapp",
          business: { name: shopName || "Negocio" },
          notifications: { hootsuite: false },
          onboarding: {
            welcome_video: false,
            privacy_policy_url: "https://klip.com.ar/privacidad",
          },
        },
        element: containerRef.current,
      });

      if (!data.token_code || !data.waba_id || !data.phone_number_id) {
        throw new Error("Meta no devolvio los datos del numero. Intenta nuevamente.");
      }

      const res = await fetch("/api/whatsapp/embed-callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: data.state || config.state,
          token_code: data.token_code,
          waba_id: data.waba_id,
          phone_number_id: data.phone_number_id,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; redirect?: string };
      if (!res.ok || !json.ok || !json.redirect) {
        throw new Error(json.error || "No se pudo completar la conexion");
      }
      window.location.href = json.redirect;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al conectar WhatsApp");
      setBusy(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!isOwnerOrAdmin || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await updateWhatsAppAutomationSettingsAction(settings);
      if (!res.success) setError(res.error || "No se pudieron guardar los cambios");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handlePrepareTemplates = async () => {
    if (!isOwnerOrAdmin || preparing) return;
    setError(null);
    setPreparing(true);
    try {
      const res = await prepareWhatsAppTemplatesAction();
      if (!res.success) {
        setError(res.error || "Error al preparar plantillas");
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al preparar plantillas");
    } finally {
      setPreparing(false);
    }
  };

  const handleTestSend = async () => {
    if (!isOwnerOrAdmin || testing) return;
    setError(null);
    setBanner(null);
    setTesting(true);
    try {
      const res = await sendWhatsAppTestReminderAction();
      if (!res.success) {
        setError(res.error || "No se pudo enviar el mensaje de prueba");
      } else {
        setBanner("success");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el mensaje de prueba");
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!isOwnerOrAdmin || busy) return;
    if (!window.confirm("Desconectar el numero de WhatsApp? Se desactivan los mensajes automaticos.")) return;
    setError(null);
    setBusy(true);
    try {
      const res = await disconnectWhatsAppAction();
      if (!res.success) setError(res.error || "No se pudo desconectar");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const totalArs = overview.messages.reduce((acc, m) => acc + m.estimatedArs, 0);
  const parked = !whatsappEnabled && !overview.connected;

  return (
    <div className="rounded-2xl border border-green-500/30 dark:border-green-600/30 bg-green-50/40 dark:bg-zinc-800/30 p-5 space-y-4">
      <div className="flex items-start gap-2">
        <div className="p-1.5 rounded-lg bg-green-500/10">
          <MessageCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Mensajes automaticos por WhatsApp</h3>
            {overview.connected ? <ConnectedStamp label="Conectado" /> : null}
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Cada local conecta su propio numero (WhatsApp Business Platform). Meta cobra por mensaje a la tarjeta del
            local; Klip no cobra comision por envio.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-400 bg-rose-500/10 rounded-xl px-3 py-2">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {banner === "success" && (
        <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400 bg-green-500/10 rounded-xl px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Numero conectado correctamente. Prepara las plantillas y activa los mensajes que quieras.
        </div>
      )}

      {banner === "error" && (
        <div className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-400 bg-rose-500/10 rounded-xl px-3 py-2">
          <XCircle className="w-4 h-4 shrink-0" />
          No se pudo completar la conexion. Reintenta desde este panel.
        </div>
      )}

      {overview.envKnownMissing.length > 0 && isOwnerOrAdmin && (
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            WhatsApp no esta habilitado aun. Faltan variables de configuracion de Klip:{" "}
            {overview.envKnownMissing.join(", ")}. Pedile al administrador de Klip que las configure.
          </div>
        </div>
      )}

      <div ref={containerRef} className="hidden" />

      {!overview.connected ? (
        parked ? (
          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              Los mensajes automaticos por WhatsApp arrancan proximamente para todos los locales. Cuando esten
              disponibles vas a poder conectar el numero de tu negocio desde este panel.
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              disabled={!isOwnerOrAdmin || busy || overview.envKnownMissing.length > 0}
              onClick={() => void handleConnect()}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                !isOwnerOrAdmin ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              {busy ? "Conectando..." : "Conectar mi numero de WhatsApp"}
            </button>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Al conectar se abre el asistente oficial de Meta. Tu numero queda asociado a este local y Meta te cobra
              directamente.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <span>
              Numero (ID de WhatsApp): <span className="font-medium">{overview.phoneNumberId}</span>
            </span>
            <span className="hidden sm:inline">·</span>
            <span>
              Conectado: <span className="font-medium">{overview.connectedAt ? new Date(overview.connectedAt).toLocaleDateString("es-AR") : "-"}</span>
            </span>
            {isOwnerOrAdmin && (
              <button
                type="button"
                disabled={testing || busy}
                onClick={() => void handleTestSend()}
                className="inline-flex items-center gap-1 rounded-lg border border-green-600/40 px-2.5 py-1 text-[11px] font-medium text-green-700 dark:text-green-400 hover:bg-green-500/10 disabled:opacity-50"
                title="Envia el recordatorio de prueba al telefono del local"
              >
                {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Probar envio
              </button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-900 dark:text-white">Mensajes automaticos</p>
            {([
              ["remindEnabled", "Recordatorio de turno", "Se envia X horas antes del turno."],
              ["feedbackEnabled", "Post-visita / calificacion", "Se envia despues de completar el turno."],
              ["birthdayEnabled", "Cumpleanos (marketing)", "Solo a clientes que dieron su consentimiento explicito."],
            ] as const).map(([key, label, hint]) => {
              const enabled = key === "remindEnabled" ? settings.remindEnabled : key === "feedbackEnabled" ? settings.feedbackEnabled : settings.birthdayEnabled;
              return (
                <label key={key} className={`flex items-start gap-3 cursor-pointer select-none ${!isOwnerOrAdmin ? "cursor-not-allowed opacity-60" : ""}`}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={!isOwnerOrAdmin || busy}
                    onClick={() => setSettings((s) => ({ ...s, [key]: !(s[key] as boolean) }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      enabled ? "bg-green-600" : "bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        enabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span>
                    <span className="block text-xs font-medium text-gray-800 dark:text-zinc-200">{label}</span>
                    <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
            <span className="text-gray-700 dark:text-zinc-300">Recordar</span>
            <select
              value={settings.remindHoursBefore}
              disabled={!isOwnerOrAdmin || busy}
              onChange={(e) => setSettings((s) => ({ ...s, remindHoursBefore: Number(e.target.value) }))}
              className="rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1 text-xs text-gray-800 dark:text-zinc-200 outline-none disabled:opacity-50"
            >
              {WA_REMINDER_HOURS_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h === 1 ? "1 hora antes" : `${h} horas antes`}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!isOwnerOrAdmin || busy}
              onClick={() => void handleSaveSettings()}
              className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Guardar ajustes
            </button>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-zinc-500" />
              <p className="text-xs font-medium text-gray-800 dark:text-zinc-200">
                Plantillas de Meta ({`${overview.templateStatus.reminder ? "1" : ""}`} de cada tipo)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["reminder", "feedback", "birthday"] as WaMessageType[]).map((type) => (
                <span key={type} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                  {WA_MESSAGE_LABELS[type]}
                  <StatusChip status={overview.templateStatus[type]} />
                </span>
              ))}
            </div>
            <button
              type="button"
              disabled={!isOwnerOrAdmin || preparing}
              onClick={() => void handlePrepareTemplates()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {preparing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Preparar plantillas
            </button>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Las plantillas nuevas entran en revision de Meta y se aprueban en horas. Podes editarlas desde el panel
              de WhatsApp de Meta.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5 text-zinc-500" />
              <p className="text-xs font-medium text-gray-800 dark:text-zinc-200">Envios (ultimos 30 dias)</p>
            </div>
            {overview.messages.map((m) => (
              <div key={m.type} className="flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-300">
                <span>{WA_MESSAGE_LABELS[m.type]}</span>
                <span className="font-medium">
                  {m.count} · $ {m.estimatedArs.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-700 pt-1.5 text-xs font-semibold text-gray-900 dark:text-white">
              <span>Estimado del periodo</span>
              <span>$ {totalArs.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
              Meta factura por mensaje a la tarjeta del local; estos valores son estimativos (tarifa 2026, sin IVA).
            </p>
          </div>

          {isOwnerOrAdmin && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDisconnect()}
              className="inline-flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
            >
              <Unplug className="w-3.5 h-3.5" />
              Desconectar numero
            </button>
          )}
        </div>
      )}
    </div>
  );
}