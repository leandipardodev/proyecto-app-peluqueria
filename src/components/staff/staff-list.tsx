"use client";

import { useEffect, useState, useRef } from "react";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CustomSelect from "@/components/ui/custom-select";
import { Label } from "@/components/ui/label";
import BaseModal from "@/components/ui/modal";
import {
  fetchStaffMembers,
  addStaffMember,
  updateStaffName,
  updateStaffRole,
  updateStaffPayMode,
  removeStaff,
  getStaffSchedule,
  updateStaffSchedule,
  getStaffProfile,
  updateStaffProfile,
  type ServiceOverride,
} from "@/lib/dashboard/staff/staff-actions";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { StatePanel } from "@/components/ui/state-panel";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import type { Industry } from "@/lib/industry/types";
import { Copy, Check, Clock, UserCircle, Pencil, Trash2, DollarSign, Link2, MoreHorizontal, UserRound, ShieldCheck, ArrowLeft } from "lucide-react";
import { FormWithKeyboardNav } from "@/lib/use-form-keyboard-nav";

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  revenue: number;
  payModel: "percentage" | "fixed" | "mixed";
  percentageRate: number;
  fixedAmount: number;
  joined: boolean;
  inviteLink: string | null;
  photo_url: string | null;
  overridesEnabled: boolean;
  serviceOverrides: ServiceOverride[];
};

function ActionButton({ icon: Icon, label, onClick, disabled, danger }: { icon: typeof Clock; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer select-none ${
        disabled
          ? "opacity-30 cursor-not-allowed"
          : danger
            ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300"
            : "text-gray-600 dark:text-gray-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-gray-200"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function StaffList({
  shopId,
  shopSlug,
  industry,
  initialStaff,
  currentUserId,
  canManageStaff,
  services,
}: {
  shopId: string;
  shopSlug?: string;
  industry: Industry;
  initialStaff: StaffMember[];
  currentUserId: string;
  canManageStaff: boolean;
  services: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "owner">("staff");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [payModel, setPayModel] = useState<"percentage" | "fixed" | "mixed">("percentage");
  const [payPercentage, setPayPercentage] = useState("40");
  const [payFixed, setPayFixed] = useState("0");
  const [overridesEnabled, setOverridesEnabled] = useState(false);
  const [serviceOverrides, setServiceOverrides] = useState<ServiceOverride[]>([]);
  const [payEditor, setPayEditor] = useState<{ id: string; name: string; payModel: "percentage" | "fixed" | "mixed"; percentageRate: number; fixedAmount: number; overridesEnabled: boolean; serviceOverrides: ServiceOverride[] } | null>(null);
  const [scheduleEditor, setScheduleEditor] = useState<{ id: string; name: string; schedule: { day_of_week: number; is_active: boolean; start_time: string; end_time: string; break_start: string | null; break_end: string | null }[] } | null>(null);
  const [profileEditor, setProfileEditor] = useState<{ id: string; name: string; description: string; instagram: string; whatsapp: string; photo_url: string; uploading: boolean } | null>(null);
  const [tutorialActive, setTutorialActive] = useState(false);
  const { addToast } = useToast();
  const staffWord = INDUSTRY_CONFIG[industry].labels.staffSingular;
  const staffWordLower = staffWord.toLowerCase();
  const staffPlural = INDUSTRY_CONFIG[industry].labels.staffPlural;

  useEffect(() => {
    const key = `klip-business-onboarding-v1:${shopSlug || "default"}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { active?: boolean; step?: number };
      setTutorialActive(Boolean(parsed?.active && parsed?.step === 2));
    } catch {
      setTutorialActive(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    setStaff(initialStaff);
  }, [initialStaff]);

  const realtimeCooldown = useRef(false);

  useEffect(() => {
    const refreshStaff = async () => {
      if (realtimeCooldown.current) return;
      realtimeCooldown.current = true;
      setTimeout(() => { realtimeCooldown.current = false; }, 5000);
      const [membershipsRes, profilesRes] = await Promise.all([
        supabase
          .from("shop_memberships")
          .select("user_id, role, invite_accepted_at")
          .eq("shop_id", shopId)
          .eq("is_active", true)
          .in("role", ["owner", "staff", "admin"]),
        supabase
          .from("user_profiles")
          .select("user_id, name, email"),
      ]);
      if (membershipsRes.error || profilesRes.error) return;
      const profilesMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
      setStaff((prev) => {
        const updated = prev.map((member) => {
          const membership = (membershipsRes.data || []).find((m: { user_id: string; role: string; invite_accepted_at: string | null }) => m.user_id === member.id);
          const profile = profilesMap.get(member.id);
          if (!membership) return member;
          return {
            ...member,
            role: membership.role,
            joined: !!membership.invite_accepted_at,
            name: profile?.name ?? member.name,
            email: profile?.email ?? member.email,
          };
        });
        const existingIds = new Set(prev.map((m) => m.id));
        const newIds = (membershipsRes.data || [])
          .filter((m: { user_id: string; role: string; invite_accepted_at: string | null }) => !existingIds.has(m.user_id))
          .map((m: { user_id: string; role: string; invite_accepted_at: string | null }) => {
            const profile = profilesMap.get(m.user_id);
            return {
              id: m.user_id,
              name: profile?.name ?? null,
              email: profile?.email ?? null,
              role: m.role,
              revenue: 0,
              payModel: "percentage" as const,
              percentageRate: 0,
              fixedAmount: 0,
              overridesEnabled: false,
              serviceOverrides: [],
              joined: !!m.invite_accepted_at,
              inviteLink: null,
              photo_url: null,
            } as StaffMember;
          });
        return newIds.length > 0 ? [...updated, ...newIds] : updated;
      });
    };

    const topic = `realtime:staff-${shopId}`;
    const existing = supabase.getChannels().find((c) => c.topic === topic);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(`staff-${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_memberships", filter: `shop_id=eq.${shopId}` }, refreshStaff)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_profiles", filter: `shop_id=eq.${shopId}` }, refreshStaff)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("email", email);
    formData.append("role", role);
    formData.append("pay_model", payModel);
    formData.append("percentage_rate", payPercentage || "0");
    formData.append("fixed_amount", payFixed || "0");
    formData.append("overrides_enabled", String(overridesEnabled));
    if (overridesEnabled) {
      for (const ov of serviceOverrides) {
        formData.append(`override_${ov.serviceId}`, String(ov.percentageRate));
      }
    }

    const result = await addStaffMember(formData, shopId);

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    if (result.data?.password) {
      setGeneratedPassword(result.data.password);
    }
    setLoginUrl(result.data?.login_url || null);

    setName("");
    setEmail("");
    setRole("staff");
    setPayModel("percentage");
    setPayPercentage("40");
    setPayFixed("0");
    setOverridesEnabled(false);
    setServiceOverrides([]);
    const latest = await fetchStaffMembers(shopId);
    if (latest.success) setStaff(latest.data ?? []);
  }

  async function handleRoleChange(id: string, newRole: "staff" | "owner") {
    const result = await updateStaffRole(id, newRole, shopId);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setStaff((prev) => prev.map((member) => (member.id === id ? { ...member, role: newRole } : member)));
  }

  async function handleRemove(id: string) {
    setDeleteTargetId(id);
  }

  async function confirmRemove() {
    const id = deleteTargetId;
    if (!id) return;
    const result = await removeStaff(id, shopId);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setStaff((prev) => prev.filter((member) => member.id !== id));
    setDeleteTargetId(null);
  }

  async function submitRename() {
    if (!canManageStaff || !renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;

    const result = await updateStaffName(renameTarget.id, trimmed, shopId);
    if (!result.success) {
      setError(result.error);
      return;
    }

    setStaff((prev) => prev.map((member) => (member.id === renameTarget.id ? { ...member, name: trimmed } : member)));
    setRenameTarget(null);
    setRenameValue("");
  }

  async function openScheduleEditor(id: string, name: string) {
    setError(null);
    const result = await getStaffSchedule(id, shopId);
    if (!result.success) {
      setError(result.error);
      return;
    }
    const existing = result.data ?? [];
    const defaultSchedule = [0,1,2,3,4,5,6].map((dow) => {
      const found = existing.find((s) => s.day_of_week === dow);
      if (found) return { ...found };
      const isWeekday = dow >= 1 && dow <= 5;
      return {
        day_of_week: dow,
        is_active: isWeekday,
        start_time: "09:00",
        end_time: "20:00",
        break_start: null as string | null,
        break_end: null as string | null,
      };
    });
    setScheduleEditor({ id, name, schedule: defaultSchedule });
  }

  async function openProfileEditor(id: string, name: string) {
    setError(null);
    const result = await getStaffProfile(id, shopId);
    if (!result.success) {
      setError(result.error);
      return;
    }
    const data = result.data || { description: null, photo_url: null, instagram: null, whatsapp: null };
    setProfileEditor({
      id,
      name,
      description: data.description ?? "",
      instagram: data.instagram ?? "",
      whatsapp: data.whatsapp ?? "",
      photo_url: data.photo_url ?? "",
      uploading: false,
    });
    setProfileError(null);
  }

  async function uploadStaffPhoto(file: File): Promise<string | null> {
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${profileEditor!.id}_${Date.now()}.${ext}`;
    const filePath = `${shopId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("staff-photos")
      .upload(filePath, file, { upsert: true });
    if (uploadError) {
      setProfileError("Error al subir la foto: " + uploadError.message);
      return null;
    }
    const { data: publicUrlData } = supabase.storage
      .from("staff-photos")
      .getPublicUrl(filePath);
    return publicUrlData?.publicUrl || null;
  }

  return (
    <div>
      {tutorialActive && (
        <div className="mb-4 rounded-2xl border border-violet-300/50 bg-violet-50/80 dark:bg-violet-900/20 px-4 py-3">
          <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">Paso 3: {staffPlural}</p>
          <p className="mt-1 text-xs text-violet-700/90 dark:text-violet-200/90">Agrega y administra tus {staffPlural.toLowerCase()} para asignar turnos correctamente.</p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                const key = `klip-business-onboarding-v1:${shopSlug || "default"}`;
                window.localStorage.setItem(key, JSON.stringify({ active: true, step: 3 }));
                router.push(shopSlug ? `/dashboard/${shopSlug}/business` : "/dashboard/business");
              }}
              className="ui-btn-primary rounded-full px-4 py-1.5 text-xs"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight">{staffPlural}</h2>
        </div>
        {canManageStaff ? (
          <Button type="button" onClick={() => setShowForm(true)}>Agregar {staffWord}</Button>
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">Solo el owner puede invitar y editar personal</span>
        )}
      </div>

      {error && (
        <div className="mb-4">
          <StatePanel title="Error al gestionar personal" description={error} variant="error" />
        </div>
      )}

      {showForm && canManageStaff && (
        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-4 sm:p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 tracking-tight">Nuevo {staffWord}</h3>
          <div className="mb-4 rounded-xl border border-sky-200/60 bg-sky-50/80 dark:bg-sky-900/20 px-3 py-2 text-xs text-sky-800 dark:text-sky-200">
            1) Cargá nombre, correo y rol. 2) Guardá. 3) Copiá el enlace de ingreso y compartilo con el {staffWordLower}.
            <br />
            El {staffWordLower} debe abrir ese enlace e iniciar sesión con ese mismo correo para quedar asociado al local.
          </div>
          <FormWithKeyboardNav onSubmit={handleSubmit} onCancel={() => setShowForm(false)} className="space-y-4">
            <div>
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1"
              />
            </div>
             <div>
               <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="role">Rol</Label>
              <CustomSelect
                value={role}
                onChange={(v) => setRole(v as "staff" | "owner")}
                options={[{ value: "staff", label: staffWord }, { value: "owner", label: "Administrador" }]}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Modo cobro (opcional)</Label>
              <CustomSelect
                value={payModel}
                onChange={(v) => setPayModel(v as "percentage" | "fixed" | "mixed")}
                options={[{ value: "percentage", label: "%" }, { value: "fixed", label: "$ fijo" }, { value: "mixed", label: "% + $" }]}
                className="mt-1"
              />
            </div>
            {payModel !== "fixed" && (
              <div>
                <Label>Porcentaje</Label>
                <Input type="number" min="0" max="100" value={payPercentage} onChange={(e) => setPayPercentage(e.target.value)} className="mt-1" />
              </div>
            )}
            {payModel !== "percentage" && (
              <div>
                <Label>Monto fijo</Label>
                <Input type="number" min="0" value={payFixed} onChange={(e) => setPayFixed(e.target.value)} className="mt-1" />
              </div>
            )}
            {payModel !== "fixed" && (
              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overridesEnabled}
                    onChange={(e) => {
                      setOverridesEnabled(e.target.checked);
                      if (e.target.checked) {
                        setServiceOverrides(
                          services.map((s) => ({
                            serviceId: s.id,
                            serviceName: s.name,
                            percentageRate: Number(payPercentage) || 40,
                          }))
                        );
                      } else {
                        setServiceOverrides([]);
                      }
                    }}
                    className="rounded border-zinc-300 dark:border-zinc-600"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Configuracion detallada por servicio</span>
                </label>
                {overridesEnabled && (
                  <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                    {serviceOverrides.map((ov) => {
                      const svc = services.find((s) => s.id === ov.serviceId);
                      return (
                        <div key={ov.serviceId} className="flex items-center gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 px-3 py-1.5">
                          <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{svc?.name || ov.serviceName}</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={ov.percentageRate}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setServiceOverrides((prev) =>
                                  prev.map((o) => (o.serviceId === ov.serviceId ? { ...o, percentageRate: isNaN(val) ? 0 : val } : o))
                                );
                              }}
                              className="w-16 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 text-center"
                            />
                            <span className="text-xs text-zinc-400">%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                    setShowForm(false);
                    setGeneratedPassword(null);
                    setLoginUrl(null);
                  }}
              >
                Cancelar
              </Button>
            </div>
          </FormWithKeyboardNav>

          {(generatedPassword || loginUrl) && (
            <div className="mt-4 p-5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl">
              <p className="text-sm font-semibold text-green-800 dark:text-green-300 mb-3">
                {staffWord} agregado correctamente
              </p>

              {loginUrl && (
                <div className="mb-3">
                  <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1.5">
                    Copi&aacute; este link y env&iacute;aselo al {staffWordLower} para que active su cuenta:
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={loginUrl}
                      className="flex-1 bg-white dark:bg-gray-950 px-3 py-2 rounded-lg border border-green-300 dark:border-green-700 text-xs font-mono dark:text-gray-100 truncate outline-none select-all"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(loginUrl);
                        addToast("Link copiado al portapapeles", "success");
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
              )}

              {generatedPassword && (
                <div>
                  <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1.5">
                    Contrase&ntilde;a temporal del {staffWordLower}:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white dark:bg-gray-950 px-3 py-1.5 rounded border border-green-300 dark:border-green-700 text-sm font-mono dark:text-gray-100">
                      {generatedPassword}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedPassword);
                        addToast("Contraseña copiada al portapapeles", "success");
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1.5">
                    Inclu&iacute; la contrase&ntilde;a en el mensaje para que pueda ingresar.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {staff.length === 0 ? (
          <StatePanel title="Sin personal" description="Todavía no hay personal registrado en este local." />
        ) : (
          staff.map((member) => {
            const isCurrentOwnerSelf = member.id === currentUserId && member.role === "owner";
            const initials = (member.name || member.email || "?")
              .split(" ")
              .map((w) => w[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase();
            const avatarColors = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500"];
            const avatarColor = avatarColors[member.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % avatarColors.length];
            return (
              <div key={member.id} className="group bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    <div className={`relative flex items-center justify-center w-12 h-12 rounded-2xl overflow-hidden shrink-0 shadow-sm ${member.photo_url ? "" : avatarColor}`}>
                      {member.photo_url ? (
                        <img src={member.photo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white text-base font-bold">{initials || <UserRound className="w-5 h-5" />}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">{member.name || "Sin nombre"}</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email || ""}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={`min-w-[130px] ${!canManageStaff || isCurrentOwnerSelf ? "pointer-events-none opacity-60" : ""}`}>
                            <CustomSelect
                              value={member.role}
                              onChange={(v) => handleRoleChange(member.id, v as "staff" | "owner")}
                              options={[{ value: "staff", label: staffWord }, { value: "owner", label: "Admin" }]}
                              className="text-xs"
                            />
                          </div>
                          {member.joined ? (
                            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200/50 dark:border-green-800/50">
                              <Check className="w-3 h-3" />
                              Conectado
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="text-gray-400">Facturación <strong className="text-gray-700 dark:text-gray-200">${member.revenue.toFixed(2)}</strong></span>
                        {member.joined && (
                          <span className="sm:hidden inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                            <Check className="w-3 h-3" />
                            Conectado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {canManageStaff && (
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-1.5">
                      <ActionButton icon={DollarSign} label="Acuerdo de cobro" onClick={() => setPayEditor({ id: member.id, name: member.name || member.email || "Staff", payModel: member.payModel, percentageRate: member.percentageRate, fixedAmount: member.fixedAmount, overridesEnabled: member.overridesEnabled, serviceOverrides: member.serviceOverrides.length > 0 ? member.serviceOverrides : services.map((s) => ({ serviceId: s.id, serviceName: s.name, percentageRate: member.percentageRate })) })} disabled={isCurrentOwnerSelf} />
                      <ActionButton icon={Clock} label="Horarios" onClick={() => openScheduleEditor(member.id, member.name || member.email || "Staff")} />
                      <ActionButton icon={UserCircle} label="Perfil" onClick={() => openProfileEditor(member.id, member.name || member.email || "Staff")} />
                      <ActionButton icon={Pencil} label="Renombrar" onClick={() => { setRenameTarget({ id: member.id, name: member.name || "" }); setRenameValue(member.name || ""); }} disabled={!canManageStaff} />
                      {member.inviteLink && !member.joined && !isCurrentOwnerSelf && (
                        <ActionButton icon={Link2} label="Link" onClick={() => { navigator.clipboard.writeText(member.inviteLink!); addToast("Link de invitación copiado al portapapeles", "success"); }} />
                      )}
                      {!isCurrentOwnerSelf ? (
                        <ActionButton icon={Trash2} label="Eliminar" onClick={() => handleRemove(member.id)} danger />
                      ) : (
                        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 italic select-none">Tu usuario</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <BaseModal
        open={!!renameTarget}
        onClose={() => { setRenameTarget(null); setRenameValue(""); }}
        title={`Renombrar ${staffWordLower}`}
        maxWidth="sm"
      >
        <div className="p-5">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Actualizá el nombre visible en staff, turnos y calendario.</p>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Nombre"
            autoFocus
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setRenameTarget(null); setRenameValue(""); }}
              className="ui-btn-ghost rounded-lg px-3 py-1.5 text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submitRename}
              className="ui-btn-primary rounded-lg px-3 py-1.5 text-sm"
            >
              Guardar
            </button>
          </div>
        </div>
      </BaseModal>

      <BaseModal
        open={!!payEditor}
        onClose={() => setPayEditor(null)}
        title="Modo de cobro"
        subtitle={payEditor?.name}
        maxWidth="sm"
      >
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-sm">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Configuración actual</span>
            <p className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">
              {payEditor?.payModel === "percentage"
                ? `${payEditor?.percentageRate}% de comisión`
                : payEditor?.payModel === "fixed"
                  ? `$${payEditor?.fixedAmount} fijo por turno`
                  : `${payEditor?.percentageRate}% + $${payEditor?.fixedAmount} fijo`}
            </p>
          </div>
          <CustomSelect
            value={payEditor?.payModel ?? "percentage"}
            onChange={(v) => setPayEditor((prev) => (prev ? { ...prev, payModel: v as "percentage" | "fixed" | "mixed" } : prev))}
            options={[{ value: "percentage", label: "%" }, { value: "fixed", label: "$ fijo" }, { value: "mixed", label: "% + $" }]}
          />
          {payEditor?.payModel !== "fixed" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Porcentaje (%)</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={String(payEditor?.percentageRate ?? 0)}
                onChange={(e) => setPayEditor((prev) => (prev ? { ...prev, percentageRate: Number(e.target.value || 0) } : prev))}
                placeholder="Ej: 40"
              />
            </div>
          )}
          {payEditor?.payModel !== "percentage" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Monto fijo ($)</label>
              <Input
                type="number"
                min="0"
                value={String(payEditor?.fixedAmount ?? 0)}
                onChange={(e) => setPayEditor((prev) => (prev ? { ...prev, fixedAmount: Number(e.target.value || 0) } : prev))}
                placeholder="Ej: 5000"
              />
            </div>
          )}
          {payEditor?.payModel !== "fixed" && (
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={payEditor?.overridesEnabled ?? false}
                  onChange={(e) => setPayEditor((prev) => prev ? { ...prev, overridesEnabled: e.target.checked } : prev)}
                  className="rounded border-zinc-300 dark:border-zinc-600"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Configuracion detallada por servicio</span>
              </label>
              {payEditor?.overridesEnabled && (
                <div className="mt-3 space-y-1.5">
                  {services.map((svc) => {
                    const ov = payEditor?.serviceOverrides.find((o) => o.serviceId === svc.id);
                    const rate = ov?.percentageRate ?? payEditor?.percentageRate;
                    return (
                      <div key={svc.id} className="flex items-center gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 px-3 py-1.5">
                        <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{svc.name}</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={rate}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setPayEditor((prev) => {
                                if (!prev) return prev;
                                const existing = prev.serviceOverrides.filter((o) => o.serviceId !== svc.id);
                                return { ...prev, serviceOverrides: [...existing, { serviceId: svc.id, serviceName: svc.name, percentageRate: isNaN(val) ? 0 : val }] };
                              });
                            }}
                            className="w-16 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 text-center"
                          />
                          <span className="text-xs text-zinc-400">%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setPayEditor(null)} className="ui-btn-ghost rounded-lg px-3 py-1.5 text-sm">Cancelar</button>
          <button
            type="button"
            onClick={async () => {
              if (!payEditor) return;
              const res = await updateStaffPayMode(payEditor.id, {
                payModel: payEditor.payModel,
                percentageRate: payEditor.percentageRate,
                fixedAmount: payEditor.fixedAmount,
                overridesEnabled: payEditor.overridesEnabled,
                serviceOverrides: payEditor.serviceOverrides,
              }, shopId);
              if (!res.success) {
                setError(res.error);
                return;
              }
              setStaff((prev) => prev.map((m) => (m.id === payEditor.id ? { ...m, payModel: payEditor.payModel, percentageRate: payEditor.percentageRate, fixedAmount: payEditor.fixedAmount, overridesEnabled: payEditor.overridesEnabled, serviceOverrides: payEditor.serviceOverrides } : m)));
              setPayEditor(null);
              addToast("Modo de cobro actualizado", "success");
            }}
            className="ui-btn-primary rounded-lg px-3 py-1.5 text-sm"
          >
            Guardar
          </button>
        </div>
      </BaseModal>

      <BaseModal
        open={!!scheduleEditor}
        onClose={() => setScheduleEditor(null)}
        title={scheduleEditor ? `Horarios de ${scheduleEditor.name}` : ""}
        subtitle="Configurá los horarios disponibles para cada día."
        maxWidth="md"
      >
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-2">
          {scheduleEditor?.schedule.map((day, i) => {
            const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
            return (
              <div key={day.day_of_week} className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2">
                <span className="w-10 text-sm font-medium text-gray-700 dark:text-gray-300">{dayNames[day.day_of_week]}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={day.is_active}
                    onChange={() => {
                      if (!scheduleEditor) return;
                      const next = [...scheduleEditor.schedule];
                      next[i] = { ...next[i], is_active: !next[i].is_active };
                      setScheduleEditor({ ...scheduleEditor, schedule: next });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                </label>
                {day.is_active && (
                  <>
                    <input
                      type="time"
                      value={day.start_time}
                      onChange={(e) => {
                        if (!scheduleEditor) return;
                        const next = [...scheduleEditor.schedule];
                        next[i] = { ...next[i], start_time: e.target.value };
                        setScheduleEditor({ ...scheduleEditor, schedule: next });
                      }}
                      className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                    />
                    <span className="text-xs text-gray-400">a</span>
                    <input
                      type="time"
                      value={day.end_time}
                      onChange={(e) => {
                        if (!scheduleEditor) return;
                        const next = [...scheduleEditor.schedule];
                        next[i] = { ...next[i], end_time: e.target.value };
                        setScheduleEditor({ ...scheduleEditor, schedule: next });
                      }}
                      className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                    />
                    {(day.break_start || day.break_end) && (
                      <>
                        <span className="text-xs text-zinc-300 dark:text-zinc-600 mx-1">|</span>
                        <input
                          type="time"
                          value={day.break_start ?? ""}
                          onChange={(e) => {
                            if (!scheduleEditor) return;
                            const next = [...scheduleEditor.schedule];
                            next[i] = { ...next[i], break_start: e.target.value || null };
                            setScheduleEditor({ ...scheduleEditor, schedule: next });
                          }}
                          className="w-24 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                        />
                        <span className="text-xs text-amber-500">break</span>
                        <input
                          type="time"
                          value={day.break_end ?? ""}
                          onChange={(e) => {
                            if (!scheduleEditor) return;
                            const next = [...scheduleEditor.schedule];
                            next[i] = { ...next[i], break_end: e.target.value || null };
                            setScheduleEditor({ ...scheduleEditor, schedule: next });
                          }}
                          className="w-24 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!scheduleEditor) return;
                        const next = [...scheduleEditor.schedule];
                        next[i] = { ...next[i], break_start: "12:00", break_end: "13:00" };
                        setScheduleEditor({ ...scheduleEditor, schedule: next });
                      }}
                      className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline ml-1 cursor-pointer select-none"
                    >
                      + agregar corte
                    </button>
                    {day.break_start && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!scheduleEditor) return;
                          const next = [...scheduleEditor.schedule];
                          next[i] = { ...next[i], break_start: null, break_end: null };
                          setScheduleEditor({ ...scheduleEditor, schedule: next });
                        }}
                        className="text-xs text-red-500 hover:text-red-600 hover:underline ml-1 cursor-pointer select-none"
                      >
                        quitar
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setScheduleEditor(null)} className="ui-btn-ghost rounded-lg px-3 py-1.5 text-sm">Cancelar</button>
          <button
            type="button"
            onClick={async () => {
              if (!scheduleEditor) return;
              const res = await updateStaffSchedule(scheduleEditor.id, scheduleEditor.schedule, shopId);
              if (!res.success) {
                setError(res.error);
                return;
              }
              setScheduleEditor(null);
              addToast("Horarios actualizados", "success");
            }}
            className="ui-btn-primary rounded-lg px-3 py-1.5 text-sm"
          >
            Guardar
          </button>
        </div>
      </BaseModal>

      <BaseModal
        open={!!profileEditor}
        onClose={() => setProfileEditor(null)}
        title={profileEditor ? `Perfil de ${profileEditor.name}` : ""}
        subtitle="Foto, descripción y redes sociales."
        maxWidth="sm"
      >
        <div className="p-5 space-y-4">
          {/* Photo */}
          <div>
            <Label>Foto</Label>
            <div className="mt-1 flex items-center gap-4">
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-violet-100 dark:bg-violet-900 flex items-center justify-center shrink-0">
                {profileEditor?.photo_url ? (
                  <img src={profileEditor.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-violet-600 dark:text-violet-300">
                    {profileEditor?.name.charAt(0).toUpperCase()}
                  </span>
                )}
                {profileEditor?.uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <label className="cursor-pointer select-none">
                <span className="text-sm text-sky-600 hover:text-sky-800 font-medium">
                  {profileEditor?.photo_url ? "Cambiar foto" : "Subir foto"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={profileEditor?.uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !profileEditor) return;
                    setProfileEditor((prev) => prev ? { ...prev, uploading: true } : prev);
                    const url = await uploadStaffPhoto(file);
                    if (url) {
                      setProfileEditor((prev) => prev ? { ...prev, photo_url: url, uploading: false } : prev);
                    } else {
                      setProfileEditor((prev) => prev ? { ...prev, uploading: false } : prev);
                    }
                  }}
                />
              </label>
              {profileEditor?.photo_url && (
                <button
                  type="button"
                  onClick={() => setProfileEditor((prev) => prev ? { ...prev, photo_url: "" } : prev)}
                  className="text-xs text-red-500 hover:text-red-700 cursor-pointer select-none"
                >
                  Quitar
                </button>
              )}
            </div>
          </div>
          {/* Description */}
          <div>
            <Label htmlFor="desc">Descripción</Label>
            <textarea
              id="desc"
              value={profileEditor?.description ?? ""}
              onChange={(e) => setProfileEditor((prev) => prev ? { ...prev, description: e.target.value } : prev)}
              placeholder="Breve descripción del profesional..."
              rows={3}
              className="mt-1 w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 resize-none"
            />
          </div>
          {/* Instagram */}
          <div>
            <Label htmlFor="instagram">Instagram <span className="text-xs text-gray-400">(opcional)</span></Label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-gray-400">@</span>
              <Input
                id="instagram"
                value={profileEditor?.instagram ?? ""}
                onChange={(e) => setProfileEditor((prev) => prev ? { ...prev, instagram: e.target.value } : prev)}
                placeholder="usuario"
                className="flex-1"
              />
            </div>
          </div>
          {/* WhatsApp */}
          <div>
            <Label htmlFor="whatsapp">WhatsApp <span className="text-xs text-gray-400">(opcional)</span></Label>
            <Input
              id="whatsapp"
              value={profileEditor?.whatsapp ?? ""}
              onChange={(e) => setProfileEditor((prev) => prev ? { ...prev, whatsapp: e.target.value } : prev)}
              placeholder="11 1234-5678"
              className="mt-1"
            />
          </div>
        </div>
        {profileError && (
          <div className="px-5 pb-2">
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{profileError}</p>
          </div>
        )}
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setProfileEditor(null)} className="ui-btn-ghost rounded-lg px-3 py-1.5 text-sm">Cancelar</button>
          <button
            type="button"
            onClick={async () => {
              if (!profileEditor) return;
              const res = await updateStaffProfile(profileEditor.id, {
                description: profileEditor.description || null,
                photo_url: profileEditor.photo_url || null,
                instagram: profileEditor.instagram || null,
                whatsapp: profileEditor.whatsapp || null,
              }, shopId);
              if (!res.success) {
                setProfileError(res.error);
                return;
              }
              setProfileEditor(null);
              addToast("Perfil actualizado", "success");
            }}
            className="ui-btn-primary rounded-lg px-3 py-1.5 text-sm"
          >
            Guardar
          </button>
        </div>
      </BaseModal>

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="Eliminar personal"
        message="Se desvinculara este miembro del local y sus turnos futuros quedaran sin staff asignado."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
