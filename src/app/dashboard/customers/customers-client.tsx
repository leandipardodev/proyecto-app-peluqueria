"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gift, Loader2, MessageCircle, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import { supabase } from "@/lib/supabase";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { resolveDashboardShopIdBySlug } from "@/lib/dashboard/auth-actions";
import { useAuth } from "@/lib/auth-context";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";

type Customer = {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  cumpleaños: string | null;
  observaciones_tecnicas: string | null;
  es_vip: boolean | null;
  recurring_weekday: number | null;
  recurring_frequency: string | null;
  recurring_notes: string | null;
  loyalty_cuts_count: number;
  loyalty_rewards_available: number;
};

function formatDate(date: string | null): string {
  if (!date) return "-";
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toInputDate(date: string | null): string {
  if (!date) return "";
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isBirthdayThisWeek(date: string | null): boolean {
  if (!date) return false;
  const bday = new Date(date);
  if (Number.isNaN(bday.getTime())) return false;

  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const candidate = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  candidate.setHours(0, 0, 0, 0);

  return candidate >= weekStart && candidate <= weekEnd;
}

export default function CustomersPage() {
  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerWord = INDUSTRY_CONFIG[industry].labels.customerSingular;
  const customerPlural = INDUSTRY_CONFIG[industry].labels.customerPlural;
  const { playSuccess, playClick } = useKlipSounds();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true);
  const [loyaltyCutsRequired, setLoyaltyCutsRequired] = useState(10);

  const [draftNombre, setDraftNombre] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftTelefono, setDraftTelefono] = useState("");
  const [draftCumple, setDraftCumple] = useState("");
  const [draftObs, setDraftObs] = useState("");
  const [draftVip, setDraftVip] = useState(false);
  const [draftRecurringWeekday, setDraftRecurringWeekday] = useState("");
  const [draftRecurringFrequency, setDraftRecurringFrequency] = useState("");
  const [draftRecurringNotes, setDraftRecurringNotes] = useState("");

  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const overlayPointerDownRef = useRef(false);
  const initialSessionLoadedRef = useRef(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  function extractShopSlugFromPath(path: string): string | null {
    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "dashboard" || !parts[1]) return null;
    return parts[1].toLowerCase();
  }

  const resolveActiveShopIdForUser = useCallback(async (): Promise<string | null> => {
    const slug = extractShopSlugFromPath(pathname);
    if (!slug) return null;
    const resolved = await resolveDashboardShopIdBySlug(slug);
    if (!resolved.success || !resolved.data?.shopId) return null;
    return resolved.data.shopId;
  }, [pathname]);

  const loadCustomers = useCallback(async () => {
    setError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("No hay datos");
      return;
    }

    const activeShopId = await resolveActiveShopIdForUser();
    if (!activeShopId) {
      setError("No se pudo resolver el local");
      return;
    }

    const [{ data, error: fetchError }, { data: shopData, error: shopError }] = await Promise.all([
      supabase.from("customers").select("*").eq("shop_id", activeShopId),
      supabase
        .from("shops")
        .select("loyalty_enabled, loyalty_cuts_required")
        .eq("id", activeShopId)
        .single(),
    ]);

    if (fetchError) {
      setError(`Error al cargar ${customerPlural.toLowerCase()}`);
      return;
    }

    if (!shopError && shopData) {
      setLoyaltyEnabled(shopData.loyalty_enabled !== false);
      setLoyaltyCutsRequired(Math.max(1, Number(shopData.loyalty_cuts_required || 10)));
    }

    const normalized: Customer[] = ((data as Array<Record<string, unknown>>) || []).map((row) => ({
      id: String(row.id || ""),
      nombre: typeof row.nombre === "string" ? row.nombre : null,
      email: typeof row.email === "string" ? row.email : null,
      telefono: typeof row.telefono === "string" ? row.telefono : null,
      cumpleaños: typeof row["cumpleaños"] === "string" ? (row["cumpleaños"] as string) : null,
      observaciones_tecnicas:
        typeof row.observaciones_tecnicas === "string" ? row.observaciones_tecnicas : null,
      es_vip: typeof row.es_vip === "boolean" ? row.es_vip : false,
      recurring_weekday: typeof row.recurring_weekday === "number" ? row.recurring_weekday : null,
      recurring_frequency: typeof row.recurring_frequency === "string" ? row.recurring_frequency : null,
      recurring_notes: typeof row.recurring_notes === "string" ? row.recurring_notes : null,
      loyalty_cuts_count: Math.max(0, Number(row.loyalty_cuts_count || 0)),
      loyalty_rewards_available: Math.max(0, Number(row.loyalty_rewards_available || 0)),
    }));

    setCustomers(normalized);
  }, [resolveActiveShopIdForUser, customerPlural]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      const userId = session?.user?.id ?? null;
      setAuthUserId(userId);
      initialSessionLoadedRef.current = true;

      if (userId) {
        await loadCustomers();
      }

      setLoading(false);

      if (!userId) {
        setTimeout(() => {
          if (mounted) router.push("/login");
        }, 120);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null;
      setAuthUserId(userId);

      if (userId) {
        void loadCustomers();
      } else if (initialSessionLoadedRef.current) {
        router.push("/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, loadCustomers]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearchQuery(q);
  }, [searchParams]);

  useEffect(() => {
    const customerId = searchParams.get("customerId");
    if (!customerId || customers.length === 0) return;
    const target = customers.find((c) => c.id === customerId);
    if (target) openEditor(target);
  }, [searchParams, customers]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;

    return customers.filter((c) => {
      const byName = (c.nombre || "").toLowerCase().includes(q);
      const byObs = (c.observaciones_tecnicas || "").toLowerCase().includes(q);
      return byName || byObs;
    });
  }, [customers, searchQuery]);

  const selectedCustomer = selectedId ? customers.find((c) => c.id === selectedId) || null : null;

  function openEditor(customer: Customer) {
    setIsCreating(false);
    setSelectedId(customer.id);
    setDraftNombre(customer.nombre || "");
    setDraftEmail(customer.email || "");
    setDraftTelefono(customer.telefono || "");
    setDraftCumple(toInputDate(customer.cumpleaños));
    setDraftObs(customer.observaciones_tecnicas || "");
    setDraftVip(Boolean(customer.es_vip));
    setDraftRecurringWeekday(customer.recurring_weekday !== null && customer.recurring_weekday !== undefined ? String(customer.recurring_weekday) : "");
    setDraftRecurringFrequency(customer.recurring_frequency || "");
    setDraftRecurringNotes(customer.recurring_notes || "");
    setSaveMessage(null);
  }

  function openCreate() {
    setIsCreating(true);
    setSelectedId(null);
    setDraftNombre("");
    setDraftEmail("");
    setDraftTelefono("");
    setDraftCumple("");
    setDraftObs("");
    setDraftVip(false);
    setDraftRecurringWeekday("");
    setDraftRecurringFrequency("");
    setDraftRecurringNotes("");
    setSaveMessage(null);
  }

  function closeEditor() {
    setSelectedId(null);
    setIsCreating(false);
    setSaveMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaveMessage("Sesión expirada. Por favor, volvé a ingresar");
      setSaving(false);
      router.replace("/login");
      return;
    }

    const activeShopId = await resolveActiveShopIdForUser();
    if (!activeShopId) {
      setSaveMessage("No se pudo resolver el local");
      setSaving(false);
      return;
    }

    const payload = {
      nombre: draftNombre || null,
      email: draftEmail || null,
      telefono: draftTelefono || null,
      cumpleaños: draftCumple || null,
      observaciones_tecnicas: draftObs || null,
      es_vip: draftVip,
      recurring_weekday: draftRecurringWeekday ? Number(draftRecurringWeekday) : null,
      recurring_frequency: draftRecurringFrequency || null,
      recurring_notes: draftRecurringNotes || null,
      user_id: user.id,
      shop_id: activeShopId,
    };

    let saveError: { message?: string } | null = null;

    if (isCreating) {
      const { error } = await supabase.from("customers").insert(payload);
      saveError = error;
    } else {
      if (!selectedId) {
        setSaveMessage("Error al guardar, intentá de nuevo");
        setSaving(false);
        return;
      }
      const { error } = await supabase.from("customers").update(payload).eq("id", selectedId);
      saveError = error;
    }

    if (saveError) {
      console.error(saveError);
      setSaveMessage("Error al guardar, intentá de nuevo");
      setSaving(false);
      return;
    }

    playSuccess();
    await loadCustomers();
    setSaving(false);
    closeEditor();
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_48%),linear-gradient(180deg,_#f8fafc_0%,_#f1f5f9_100%)] px-6 dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_46%),linear-gradient(180deg,_#09090b_0%,_#111827_100%)]">
        <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-slate-700 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/15 dark:bg-zinc-900/65 dark:text-zinc-200">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-sky-300" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Verificando sesión...</p>
            <p className="truncate text-xs text-slate-500 dark:text-zinc-400">Cargando {customerPlural.toLowerCase()} y configuración del local</p>
          </div>
        </div>
      </div>
    );
  }

  if (!authUserId) {
    return null;
  }

  if (error) {
    return <div className="bg-red-50 text-red-700 text-sm px-5 py-3 rounded-full border border-red-200">{error}</div>;
  }

  return (
    <div className="space-y-6 relative">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">{customerPlural}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Gestión de fichas técnicas y datos de contacto.</p>
      </div>

      <div>
        <button
          onMouseDown={playClick}
          onClick={openCreate}
          className="bg-blue-600 text-white rounded-full px-6 py-2 text-sm font-medium hover:bg-blue-700 transition"
        >
          + Nuevo {customerWord}
        </button>
      </div>

      <div className="max-w-md relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por nombre u observaciones..."
          className="w-full rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 pl-9 pr-4 py-2 text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
        />
      </div>

      <div className="md:hidden space-y-3">
        {filteredCustomers.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl px-4 py-8 text-center text-sm text-slate-500 dark:text-zinc-400 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            No se encontraron {customerPlural.toLowerCase()}
          </div>
        ) : (
          filteredCustomers.map((customer) => (
            <button
              key={customer.id}
              onClick={() => openEditor(customer)}
              className="w-full text-left bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.03)] active:scale-[0.99] transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-zinc-100 truncate">{customer.nombre || "Sin nombre"}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">{customer.telefono || "Sin telefono"}</p>
                    {customer.telefono && (
                      <a
                        href={`https://wa.me/${customer.telefono.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex h-5 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-medium leading-none text-emerald-700 align-middle"
                      >
                        <MessageCircle className="h-3 w-3" /> WhatsApp
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isBirthdayThisWeek(customer.cumpleaños) && <Gift className="w-4 h-4 text-rose-500" />}
                  {customer.es_vip && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">VIP</span>
                  )}
                </div>
              </div>
              {loyaltyEnabled && (
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                    Cortes: {customer.loyalty_cuts_count}/{loyaltyCutsRequired}
                  </span>
                  <span className="inline-flex px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                    Canjes: {customer.loyalty_rewards_available}
                  </span>
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">Cumple: {formatDate(customer.cumpleaños)}</p>
              <p className="mt-2 text-sm text-slate-700 dark:text-zinc-300 line-clamp-2">{customer.observaciones_tecnicas || "Sin observaciones"}</p>
            </button>
          ))
        )}
      </div>

      <div className="hidden md:block bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 text-left text-slate-500 dark:text-zinc-400">
                 <th className="px-6 py-3 font-medium">{customerWord}</th>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Teléfono</th>
                <th className="px-6 py-3 font-medium">Cumpleaños</th>
                <th className="px-6 py-3 font-medium">Observaciones</th>
                <th className="px-6 py-3 font-medium">VIP</th>
                <th className="px-6 py-3 font-medium">Fidelización</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-zinc-400">
                    No se encontraron {customerPlural.toLowerCase()}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => openEditor(customer)}
                    className="border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-slate-50/70 dark:hover:bg-zinc-800/60 cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-zinc-100">{customer.nombre || "Sin nombre"}</span>
                        {isBirthdayThisWeek(customer.cumpleaños) && <Gift className="w-4 h-4 text-rose-500" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-zinc-300">{customer.email || "Sin email"}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-zinc-300">
                      <div className="flex items-center gap-2">
                        <span>{customer.telefono || "Sin teléfono"}</span>
                        {customer.telefono && (
                          <a
                            href={`https://wa.me/${customer.telefono.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-5 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-medium leading-none text-emerald-700 align-middle"
                          >
                            <MessageCircle className="h-3 w-3" /> WhatsApp
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-700 dark:text-zinc-200">{formatDate(customer.cumpleaños)}</td>
                    <td className="px-6 py-4 text-slate-700 dark:text-zinc-200 max-w-[280px]">
                      <p className="line-clamp-2">{customer.observaciones_tecnicas || "Sin observaciones"}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-700 dark:text-zinc-200">{customer.es_vip ? "Sí" : "No"}</td>
                    <td className="px-6 py-4 text-slate-700 dark:text-zinc-200">
                      {loyaltyEnabled ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">
                            {customer.loyalty_cuts_count}/{loyaltyCutsRequired}
                          </span>
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 text-violet-700">
                            {customer.loyalty_rewards_available} canje(s)
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-zinc-400">Desactivado</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {portalReady && (selectedCustomer || isCreating) && createPortal((
        <>
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onPointerDown={(e) => {
              overlayPointerDownRef.current = e.target === e.currentTarget;
            }}
            onPointerUp={(e) => {
              if (overlayPointerDownRef.current && e.target === e.currentTarget) closeEditor();
              overlayPointerDownRef.current = false;
            }}
          />
          <div className="fixed right-0 top-0 h-[100dvh] w-full max-w-xl z-50 bg-white/90 dark:bg-zinc-900/95 backdrop-blur-xl border-l border-slate-200 dark:border-zinc-700 shadow-2xl">
            <div className="h-full flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">{isCreating ? `Nuevo ${customerWord.toLowerCase()}` : `Ficha de ${customerWord.toLowerCase()}`}</h2>
                  {!isCreating && <p className="text-sm text-slate-500 dark:text-zinc-400">{selectedCustomer?.nombre || "Sin nombre"}</p>}
                </div>
                <button onClick={closeEditor} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-y-contain px-6 py-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-zinc-100 mb-1.5">Nombre</label>
                    <input
                      value={draftNombre}
                      onChange={(e) => setDraftNombre(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-zinc-100 mb-1.5">Email</label>
                    <input
                      value={draftEmail}
                      onChange={(e) => setDraftEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-zinc-100 mb-1.5">{customerWord} recurrente (dia)</label>
                    <select
                      value={draftRecurringWeekday}
                      onChange={(e) => setDraftRecurringWeekday(e.target.value)}
                      className="ui-select w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    >
                      <option value="">No recurrente</option>
                      <option value="1">Lunes</option>
                      <option value="2">Martes</option>
                      <option value="3">Miércoles</option>
                      <option value="4">Jueves</option>
                      <option value="5">Viernes</option>
                      <option value="6">Sábado</option>
                      <option value="0">Domingo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-zinc-100 mb-1.5">Frecuencia</label>
                    <input
                      value={draftRecurringFrequency}
                      onChange={(e) => setDraftRecurringFrequency(e.target.value)}
                      placeholder="Ej: semanal"
                      className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-900 dark:text-zinc-100 mb-1.5">Notas de recurrencia</label>
                  <textarea
                    value={draftRecurringNotes}
                    onChange={(e) => setDraftRecurringNotes(e.target.value)}
                    placeholder="Ej: siempre viernes por la tarde"
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-zinc-100 mb-1.5">Teléfono</label>
                    <input
                      value={draftTelefono}
                      onChange={(e) => setDraftTelefono(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-zinc-100 mb-1.5">Cumpleaños</label>
                    <input
                      type="date"
                      value={draftCumple}
                      onChange={(e) => setDraftCumple(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-900 dark:text-zinc-100 mb-1.5">Observaciones Técnicas</label>
                  <textarea
                    value={draftObs}
                    onChange={(e) => setDraftObs(e.target.value)}
                    rows={8}
                    className="w-full rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    placeholder="Notas de colorimetría, sensibilidades, tipo de cabello..."
                  />
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-zinc-100 mb-2">Preferencias</p>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-zinc-300">
                    <input type="checkbox" checked={draftVip} onChange={(e) => setDraftVip(e.target.checked)} />
                    VIP
                  </label>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-700 flex items-center justify-between">
                {saveMessage ? (
                  <span className={`text-sm ${saveMessage.includes("Error") ? "text-red-600" : "text-emerald-600"}`}>{saveMessage}</span>
                ) : (
                  <span />
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-full bg-blue-600 text-white px-5 py-2 text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </>
      ), document.body)}
    </div>
  );
}
