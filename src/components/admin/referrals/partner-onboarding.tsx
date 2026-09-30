"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import BaseModal from "@/components/ui/modal";
import { createPartnerAction, type CreatePartnerState } from "@/app/admin/referrals/actions";
import {
  buildPartnerReferralLink,
  buildPartnerWelcomeMessage,
  buildWhatsAppShareLink,
} from "@/lib/referrals/partner-message";

type ExistingCode = { partnerId: string; referralCode: string };

type Props = {
  existingCodes: ExistingCode[];
  /** Origen publico de Klip, resuelto en el server para no hidratar distinto. */
  baseUrl: string;
  defaultCommissionPercent: number;
  defaultCommissionMonths: number;
  /** Boton que abre el modal. */
  trigger: ReactNode;
};

/** "Ana Gonzalez" -> "ana-gonzalez", recortado a lo que permite el regex del server. */
function suggestCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function PartnerOnboarding({
  existingCodes,
  baseUrl,
  defaultCommissionPercent,
  defaultCommissionMonths,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CreatePartnerState | null, FormData>(createPartnerAction, null);

  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Mientras el admin no toque el codigo, se propone solo desde el nombre. Es
  // el paso que mas se olvida y el que mas errores de tipeo produce.
  const effectiveCode = codeTouched ? referralCode : suggestCode(name);
  const normalized = effectiveCode.trim().toLowerCase();
  const duplicate = useMemo(
    () => Boolean(normalized) && existingCodes.some((item) => item.referralCode.trim().toLowerCase() === normalized),
    [existingCodes, normalized],
  );

  const generated = state?.ok ? state : null;
  const welcomeMessage = generated
    ? (message ??
      buildPartnerWelcomeMessage({
        name: generated.name,
        referralCode: generated.referralCode,
        pin: generated.pin,
        baseUrl,
        commissionPercent: defaultCommissionPercent,
        commissionMonths: defaultCommissionMonths,
      }))
    : null;

  async function handleCopy() {
    if (!welcomeMessage) return;
    try {
      await navigator.clipboard.writeText(welcomeMessage);
    } catch {
      const area = document.getElementById("partner-welcome-message") as HTMLTextAreaElement | null;
      area?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function close() {
    setOpen(false);
    setName("");
    setReferralCode("");
    setCodeTouched(false);
    setMessage(null);
    setCopied(false);
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex">
        {trigger}
      </span>

      <BaseModal
        open={open}
        onClose={close}
        title={generated ? `${generated.name} ya está en Klip` : "Nuevo vendedor"}
        icon={generated ? <Check className="h-5 w-5" /> : <UserPlusIcon />}
        subtitle={generated ? undefined : "Un paso: creás el vendedor y te queda el mensaje para mandarle"}
        maxWidth="lg"
      >
        {generated && welcomeMessage ? (
          <div className="space-y-4 px-6 py-6">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Mandale esto por WhatsApp. El PIN se muestra una sola vez: si lo pierde, regeneralo desde la tarjeta
              del vendedor.
            </p>

            <textarea
              id="partner-welcome-message"
              value={welcomeMessage}
              rows={11}
              onChange={(event) => setMessage(event.target.value)}
              className="w-full resize-y rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3 font-mono text-xs text-zinc-700 dark:text-zinc-300"
            />
            <p className="text-xs text-zinc-400">Podés retocarlo antes de mandarlo.</p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 inline-flex items-center gap-1.5  px-4 py-2 text-sm font-medium"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado" : "Copiar mensaje"}
              </button>
              <a
                href={buildWhatsAppShareLink(welcomeMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium"
              >
                <MessageCircle className="h-4 w-4" />
                Mandar por WhatsApp
              </a>
              <a
                href={buildPartnerReferralLink(baseUrl, generated.referralCode)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-zinc-500 dark:text-zinc-400 underline underline-offset-2"
              >
                {buildPartnerReferralLink(baseUrl, generated.referralCode)}
              </a>
            </div>
          </div>
        ) : (
          <form action={formAction} className="space-y-4 px-6 py-6">
            <input
              name="name"
              placeholder="Nombre y apellido"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2.5 text-sm text-gray-900 dark:text-zinc-100"
              required
            />

            <div>
              <input
                name="referralCode"
                placeholder="Código de referido"
                value={effectiveCode}
                onChange={(event) => {
                  setCodeTouched(true);
                  setReferralCode(event.target.value);
                }}
                className={`w-full rounded-xl border bg-transparent px-3 py-2.5 font-mono text-sm text-zinc-900 dark:text-zinc-100 ${
                  duplicate ? "border-rose-400 bg-rose-50/60" : "border-zinc-300 dark:border-zinc-700"
                }`}
                required
              />
              {duplicate ? (
                <p className="mt-1 text-xs text-rose-600">Ese código ya existe. Usá uno diferente.</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">
                Comisión %
                <input
                  name="commissionPercentOverride"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  defaultValue={defaultCommissionPercent}
                  className="mt-1 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-zinc-100"
                />
              </label>
              <label className="text-xs text-zinc-500 dark:text-zinc-400">
                Meses
                <input
                  name="commissionMonthsOverride"
                  type="number"
                  min="1"
                  max="24"
                  defaultValue={defaultCommissionMonths}
                  className="mt-1 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-zinc-100"
                />
              </label>
            </div>
            <p className="text-xs text-zinc-400">
              Quedan fijados en el alta. Cambiarlos después no reinicia los pagos ya contados.
            </p>

            {state && !state.ok ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{state.error}</p>
            ) : null}

            <button
              type="submit"
              disabled={pending || duplicate}
              className="rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 w-full  px-4 py-2.5 text-sm font-medium disabled:opacity-40"
            >
              {pending ? "Creando…" : "Crear vendedor"}
            </button>
          </form>
        )}
      </BaseModal>
    </>
  );
}

function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}
