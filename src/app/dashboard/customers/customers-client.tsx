"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Gift, MessageCircle, Search, Trash2 } from "lucide-react";
import Sheet from "@/components/ui/sheet";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchCustomersPage } from "@/lib/dashboard/clients/customers-actions";
import { useAuth } from "@/lib/auth-context";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";
import { CUSTOMER_TAGS, getTagColor, getTagLabel } from "@/lib/dashboard/clients/customer-tags";

type Customer = {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  cumpleaños: string | null;
  observaciones_tecnicas: string | null;
  es_vip: boolean | null;
  tags: string[];
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

export default function CustomersPage({
  shopId,
  shopSlug: _shopSlug,
  initialCustomers = [],
  initialPage = 1,
  initialTotalPages = 1,
  initialTotal = 0,
  initialError = null,
  initialLoyaltyEnabled = true,
  initialLoyaltyCutsRequired = 10,
}: {
  shopId: string;
  shopSlug: string;
  initialCustomers?: Customer[];
  initialPage?: number;
  initialTotalPages?: number;
  initialTotal?: number;
  initialError?: string | null;
  initialLoyaltyEnabled?: boolean;
  initialLoyaltyCutsRequired?: number;
}) {
  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerWord = INDUSTRY_CONFIG[industry].labels.customerSingular;
  const customerPlural = INDUSTRY_CONFIG[industry].labels.customerPlural;
  const { playSuccess, playClick } = useKlipSounds();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [error, setError] = useState<string | null>(initialError);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(initialLoyaltyEnabled);
  const [loyaltyCutsRequired, setLoyaltyCutsRequired] = useState(initialLoyaltyCutsRequired);

  const [draftNombre, setDraftNombre] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftTelefono, setDraftTelefono] = useState("");
  const [draftCumple, setDraftCumple] = useState("");
  const [draftObs, setDraftObs] = useState("");
  const [draftVip, setDraftVip] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftRecurringWeekday, setDraftRecurringWeekday] = useState("");
  const [draftRecurringFrequency, setDraftRecurringFrequency] = useState("");
  const [draftRecurringNotes, setDraftRecurringNotes] = useState("");

  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadCustomers = useCallback(async (p: number, search: string) => {
    setLoading(true);
    setError(null);

    const { data: shopData } = await supabase
      .from("shops")
      .select("loyalty_enabled, loyalty_cuts_required")
      .eq("id", shopId)
      .maybeSingle();

    if (shopData) {
      setLoyaltyEnabled(shopData.loyalty_enabled !== false);
      setLoyaltyCutsRequired(Math.max(1, Number(shopData.loyalty_cuts_required || 10)));
    }

    const result = await fetchCustomersPage(shopId, { search, page: p, pageSize: 50 });

    if (!result.success || !result.data) {
      setError(`Error al cargar ${customerPlural.toLowerCase()}`);
      setLoading(false);
      return;
    }

    setCustomers(result.data.customers);
    setPage(result.data.page);
    setTotalPages(result.data.totalPages);
    setTotal(result.data.total);
    setLoading(false);
  }, [shopId, customerPlural]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadCustomers(1, searchQuery);
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [loadCustomers, searchQuery]);

  useEffect(() => {
    const customerId = searchParams.get("customerId");
    if (!customerId || customers.length === 0) return;
    const target = customers.find((c) => c.id === customerId);
    if (target) openEditor(target);
  }, [searchParams, customers]);

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
    setDraftTags(customer.tags);
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
    setDraftTags([]);
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

    const payload = {
      nombre: draftNombre || "",
      email: draftEmail || null,
      telefono: draftTelefono || null,
      cumpleaños: draftCumple || null,
      observaciones_tecnicas: draftObs || null,
      es_vip: draftVip,
      tags: draftTags,
      recurring_weekday: draftRecurringWeekday ? Number(draftRecurringWeekday) : null,
      recurring_frequency: draftRecurringFrequency || null,
      recurring_notes: draftRecurringNotes || null,
      user_id: user.id,
      shop_id: shopId,
    };

    if (isCreating) {
      const { data: created, error } = await supabase.from("customers").insert(payload).select().maybeSingle();
      if (error) {
        setSaveMessage("Error al guardar, intentá de nuevo");
        setSaving(false);
        return;
      }
      if (!created) {
        setSaveMessage("Error al guardar, intentá de nuevo");
        setSaving(false);
        return;
      }
      const normalized: Customer = {
        id: created.id,
        nombre: created.nombre ?? null,
        email: created.email ?? null,
        telefono: created.telefono ?? null,
        cumpleaños: created.cumpleaños ?? null,
        observaciones_tecnicas: created.observaciones_tecnicas ?? null,
        es_vip: created.es_vip ?? false,
        tags: draftTags,
        recurring_weekday: created.recurring_weekday ?? null,
        recurring_frequency: created.recurring_frequency ?? null,
        recurring_notes: created.recurring_notes ?? null,
        loyalty_cuts_count: 0,
        loyalty_rewards_available: 0,
      };
      setCustomers((prev) => [normalized, ...prev]);
    } else {
      if (!selectedId) {
        setSaveMessage("Error al guardar, intentá de nuevo");
        setSaving(false);
        return;
      }
      const { error } = await supabase.from("customers").update(payload).eq("id", selectedId);
      if (error) {
        setSaveMessage("Error al guardar, intentá de nuevo");
        setSaving(false);
        return;
      }
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
      nombre: draftNombre || "",
                email: draftEmail || null,
                telefono: draftTelefono || null,
                cumpleaños: draftCumple || null,
                observaciones_tecnicas: draftObs || null,
                es_vip: draftVip,
                tags: draftTags,
                recurring_weekday: draftRecurringWeekday ? Number(draftRecurringWeekday) : null,
                recurring_frequency: draftRecurringFrequency || null,
                recurring_notes: draftRecurringNotes || null,
              }
            : c,
        ),
      );
    }

    playSuccess();
    setSaving(false);
    closeEditor();
  }

  async function handleDelete() {
    if (!selectedId) return;
    setDeleting(true);
    setSaveMessage(null);

    const { error: deleteError } = await supabase.from("customers").delete().eq("id", selectedId);
    if (deleteError) {
      setSaveMessage("Error al eliminar, intentá de nuevo");
      setDeleting(false);
      return;
    }

    setCustomers((prev) => prev.filter((c) => c.id !== selectedId));
    setDeleting(false);
    setConfirmDelete(false);
    closeEditor();
  }

  if (error) {
    return <div className="bg-red-50 text-red-700 text-sm px-5 py-3 rounded-full border border-red-200">{error}</div>;
  }

  return (
    <div className="space-y-6 relative">
      <div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-none text-slate-900 dark:text-zinc-100">{customerPlural}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Gestión de fichas técnicas y datos de contacto.</p>
      </div>

      <div className="flex gap-2">
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

      <div className="flex items-center justify-between gap-4 text-sm text-slate-500 dark:text-zinc-400">
        <span>{total > 0 ? `${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} de ${total}` : ""}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => loadCustomers(page - 1, searchQuery)}
            className="rounded-lg border border-slate-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            Anterior
          </button>
          <span className="text-xs font-medium">{page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => loadCustomers(page + 1, searchQuery)}
            className="rounded-lg border border-slate-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            Siguiente
          </button>
        </div>
      </div>

      <div className="md:hidden space-y-3">
        {customers.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl px-4 py-8 text-center text-sm text-slate-500 dark:text-zinc-400 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
            No se encontraron {customerPlural.toLowerCase()}
          </div>
        ) : (
          customers.map((customer) => (
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
                  {customer.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${getTagColor(tag)}`}>{getTagLabel(tag)}</span>
                  ))}
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
                <th className="px-6 py-3 font-medium">Etiquetas</th>
                <th className="px-6 py-3 font-medium">Fidelización</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-zinc-400">
                    No se encontraron {customerPlural.toLowerCase()}
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => openEditor(customer)}
                    className="border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
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
                    <td className="px-6 py-4 text-slate-700 dark:text-zinc-200">
                      <div className="flex flex-wrap gap-1">
                        {customer.tags.length > 0 ? customer.tags.map((tag) => (
                          <span key={tag} className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${getTagColor(tag)}`}>{getTagLabel(tag)}</span>
                        )) : <span className="text-xs text-zinc-400">—</span>}
                      </div>
                    </td>
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

      <Sheet
        open={!!(selectedCustomer || isCreating)}
        onClose={closeEditor}
        title={isCreating ? `Nuevo ${customerWord.toLowerCase()}` : `Ficha de ${customerWord.toLowerCase()}`}
      >
        <div className="h-full flex flex-col">
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
              <p className="text-sm font-medium text-slate-900 dark:text-zinc-100 mb-2">Etiquetas</p>
              <div className="flex flex-wrap gap-1.5">
                {CUSTOMER_TAGS.map((tag) => {
                  const active = draftTags.includes(tag.value);
                  return (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => setDraftTags((prev) => active ? prev.filter((t) => t !== tag.value) : [...prev, tag.value])}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer select-none ${
                        active
                          ? tag.color + " ring-1 ring-current"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isCreating && (
                <>
                  {confirmDelete ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-red-600 dark:text-red-400">¿Eliminar?</span>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="ui-btn-primary rounded-lg px-3 py-1.5 text-xs font-medium"
                      >
                        {deleting ? "Eliminando..." : "Sí"}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="ui-btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {saveMessage && (
                <span className={`text-sm ${saveMessage.includes("Error") ? "text-red-600" : "text-emerald-600"}`}>{saveMessage}</span>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="ui-btn-primary rounded-lg px-5 py-2 text-sm font-medium"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
