"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CustomSelect from "@/components/ui/custom-select";
import { Label } from "@/components/ui/label";
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
} from "@/lib/dashboard/staff-actions";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { StatePanel } from "@/components/ui/state-panel";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import type { Industry } from "@/lib/industry/types";
import { Copy, Check, X } from "lucide-react";

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
};

export default function StaffList({
  shopId,
  shopSlug,
  industry,
  initialStaff,
  currentUserId,
  canManageStaff,
}: {
  shopId: string;
  shopSlug?: string;
  industry: Industry;
  initialStaff: StaffMember[];
  currentUserId: string;
  canManageStaff: boolean;
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
  const [payEditor, setPayEditor] = useState<{ id: string; name: string; payModel: "percentage" | "fixed" | "mixed"; percentageRate: number; fixedAmount: number } | null>(null);
  const [scheduleEditor, setScheduleEditor] = useState<{ id: string; name: string; schedule: { day_of_week: number; is_active: boolean; start_time: string; end_time: string; break_start: string | null; break_end: string | null }[] } | null>(null);
  const [profileEditor, setProfileEditor] = useState<{ id: string; name: string; description: string; instagram: string; whatsapp: string; photo_url: string; uploading: boolean } | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [tutorialActive, setTutorialActive] = useState(false);
  const { addToast } = useToast();
  const staffWord = INDUSTRY_CONFIG[industry].labels.staffSingular;
  const staffWordLower = staffWord.toLowerCase();
  const staffPlural = INDUSTRY_CONFIG[industry].labels.staffPlural;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const key = `klip-business-onboarding-v1:${shopSlug || "default"}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { active?: boolean; step?: number };
      setTutorialActive(Boolean(parsed?.active && parsed?.step === 3));
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
      setTimeout(() => { realtimeCooldown.current = false; }, 2000);
      const latest = await fetchStaffMembers(shopId);
      if (latest.success) setStaff(latest.data ?? []);
    };

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
          <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">Paso 4: {staffPlural}</p>
          <p className="mt-1 text-xs text-violet-700/90 dark:text-violet-200/90">Cuando termines, continuá al paso de Servicios.</p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                const key = `klip-business-onboarding-v1:${shopSlug || "default"}`;
                window.localStorage.setItem(key, JSON.stringify({ active: true, step: 4 }));
                router.push(shopSlug ? `/dashboard/${shopSlug}/services` : "/dashboard/services");
              }}
              className="ui-btn-primary rounded-full px-4 py-1.5 text-xs"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight">{staffPlural}</h2>
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
          <form onSubmit={handleSubmit} className="space-y-4">
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
          </form>

          {(generatedPassword || loginUrl) && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg">
              {generatedPassword && (
                <>
                  <p className="text-sm text-green-800 dark:text-green-300 font-medium mb-2">
                    Usuario creado correctamente. Contraseña generada:
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
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                     Compartí esta contraseña con el {staffWordLower}.
                  </p>
                </>
              )}
              {loginUrl && (
                <div className="mt-3">
                  <p className="text-sm text-green-800 dark:text-green-300 font-medium mb-1">Link de ingreso:</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white dark:bg-gray-950 px-3 py-1.5 rounded border border-green-300 dark:border-green-700 text-xs font-mono dark:text-gray-100 truncate">
                      {loginUrl}
                    </code>
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
            </div>
          )}
        </div>
      )}

      <div className="md:hidden space-y-3">
        {staff.length === 0 ? (
          <StatePanel title="Sin personal" description="Todavía no hay personal registrado en este local." />
        ) : (
          staff.map((member) => {
            const isCurrentOwnerSelf = member.id === currentUserId && member.role === "owner";
            const selfOwnerTooltip = "No podés editar tu propio rol de administrador";
            return (
              <div key={member.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{member.name || "-"}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email || "-"}</p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Rol</span>
                  <div className="min-w-[150px]">
                    <CustomSelect
                      value={member.role}
                      onChange={(v) => handleRoleChange(member.id, v as "staff" | "owner")}
                       options={[{ value: "staff", label: staffWord }, { value: "owner", label: "Admin" }]}
                      className={!canManageStaff || isCurrentOwnerSelf ? "pointer-events-none opacity-60" : ""}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Facturación</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">${member.revenue.toFixed(2)}</span>
                </div>
                {canManageStaff && !isCurrentOwnerSelf && (
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Invitación</span>
                    {member.joined ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                        <Check className="w-3.5 h-3.5" />
                        Conectado
                      </span>
                    ) : member.inviteLink ? (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(member.inviteLink!);
                          addToast("Link de invitación copiado al portapapeles", "success");
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-800 cursor-pointer select-none"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar link
                      </button>
                    ) : null}
                  </div>
                )}
                <div className="mt-3 flex justify-end">
                  {!canManageStaff ? (
                    <span className="text-xs text-gray-400 cursor-not-allowed select-none">-</span>
                  ) : (
                    <>
                      {!isCurrentOwnerSelf && (
                        <button
                          type="button"
                          onClick={() => setPayEditor({ id: member.id, name: member.name || member.email || "Staff", payModel: member.payModel, percentageRate: member.percentageRate, fixedAmount: member.fixedAmount })}
                          className="text-sm text-sky-600 hover:text-sky-800 cursor-pointer select-none mr-3"
                        >
                          Cobro
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openScheduleEditor(member.id, member.name || member.email || "Staff")}
                        className="text-sm text-emerald-600 hover:text-emerald-800 cursor-pointer select-none mr-3"
                      >
                        Horarios
                      </button>
                      <button
                        type="button"
                        onClick={() => openProfileEditor(member.id, member.name || member.email || "Staff")}
                        className="text-sm text-sky-600 hover:text-sky-800 cursor-pointer select-none mr-3"
                      >
                        Perfil
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenameTarget({ id: member.id, name: member.name || "" });
                          setRenameValue(member.name || "");
                        }}
                        className="text-sm text-violet-600 hover:text-violet-800 cursor-pointer select-none mr-3"
                      >
                        Renombrar
                      </button>
                      {!isCurrentOwnerSelf ? (
                        <button
                          type="button"
                          onClick={() => handleRemove(member.id)}
                          className="text-sm text-red-600 hover:text-red-800 cursor-pointer select-none"
                        >
                          Eliminar
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 cursor-not-allowed select-none" title={selfOwnerTooltip}>Tu usuario</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" aria-label="Tabla de personal">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Rol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Facturación
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-transparent dark:bg-transparent divide-y divide-zinc-200 dark:divide-zinc-800">
            {staff.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  <StatePanel title="Sin personal" description="Todavía no hay personal registrado en este local." />
                </td>
              </tr>
            ) : (
              staff.map((member) => (
                (() => {
                  const isCurrentOwnerSelf = member.id === currentUserId && member.role === "owner";
                  const selfOwnerTooltip = "No podés editar tu propio rol de administrador";
                  return (
                <tr key={member.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {member.name || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {member.email || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="min-w-[150px]">
                      <CustomSelect
                        value={member.role}
                        onChange={(v) => handleRoleChange(member.id, v as "staff" | "owner")}
                         options={[{ value: "staff", label: staffWord }, { value: "owner", label: "Admin" }]}
                        className={!canManageStaff || isCurrentOwnerSelf ? "pointer-events-none opacity-60" : ""}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    ${member.revenue.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {!canManageStaff ? (
                      <span className="text-gray-400 cursor-not-allowed select-none">-</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        {!isCurrentOwnerSelf && member.joined ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                            <Check className="w-3.5 h-3.5" />
                            Conectado
                          </span>
                        ) : !isCurrentOwnerSelf && member.inviteLink ? (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(member.inviteLink!);
                              addToast("Link de invitación copiado al portapapeles", "success");
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-800 cursor-pointer select-none mr-2"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copiar link
                          </button>
                        ) : null}
                        {!isCurrentOwnerSelf && (
                          <button
                            type="button"
                            onClick={() => setPayEditor({ id: member.id, name: member.name || member.email || "Staff", payModel: member.payModel, percentageRate: member.percentageRate, fixedAmount: member.fixedAmount })}
                            className="text-sky-600 hover:text-sky-800 cursor-pointer select-none"
                          >
                            Cobro
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openScheduleEditor(member.id, member.name || member.email || "Staff")}
                          className="text-emerald-600 hover:text-emerald-800 cursor-pointer select-none"
                        >
                          Horarios
                        </button>
                        <button
                          type="button"
                          onClick={() => openProfileEditor(member.id, member.name || member.email || "Staff")}
                          className="text-sky-600 hover:text-sky-800 cursor-pointer select-none"
                        >
                          Perfil
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenameTarget({ id: member.id, name: member.name || "" });
                            setRenameValue(member.name || "");
                          }}
                          className="text-violet-600 hover:text-violet-800 cursor-pointer select-none"
                        >
                          Renombrar
                        </button>
                        {!isCurrentOwnerSelf ? (
                          <button
                            type="button"
                            onClick={() => handleRemove(member.id)}
                            className="text-red-600 hover:text-red-800 cursor-pointer select-none"
                          >
                            Eliminar
                          </button>
                        ) : (
                          <span className="text-gray-400 cursor-not-allowed select-none" title={selfOwnerTooltip}>Tu usuario</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                  );
                })()
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {portalReady && renameTarget && createPortal((
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/50 dark:border-zinc-700/50">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Renombrar {staffWordLower}</h3>
              <button
                type="button"
                onClick={() => { setRenameTarget(null); setRenameValue(""); }}
                className="p-1 rounded-md text-gray-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
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
                  className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={submitRename}
                  className="px-3 py-1.5 rounded-lg text-sm bg-violet-600 text-white hover:bg-violet-700 transition-colors cursor-pointer select-none"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {portalReady && payEditor && createPortal((
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/50 dark:border-zinc-700/50">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Modo de cobro</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{payEditor.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPayEditor(null)}
                className="p-1 rounded-md text-gray-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <CustomSelect
                value={payEditor.payModel}
                onChange={(v) => setPayEditor((prev) => (prev ? { ...prev, payModel: v as "percentage" | "fixed" | "mixed" } : prev))}
                options={[{ value: "percentage", label: "%" }, { value: "fixed", label: "$ fijo" }, { value: "mixed", label: "% + $" }]}
              />
              {payEditor.payModel !== "fixed" && (
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={String(payEditor.percentageRate)}
                  onChange={(e) => setPayEditor((prev) => (prev ? { ...prev, percentageRate: Number(e.target.value || 0) } : prev))}
                />
              )}
              {payEditor.payModel !== "percentage" && (
                <Input
                  type="number"
                  min="0"
                  value={String(payEditor.fixedAmount)}
                  onChange={(e) => setPayEditor((prev) => (prev ? { ...prev, fixedAmount: Number(e.target.value || 0) } : prev))}
                />
              )}
            </div>
            <div className="px-5 pb-5 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setPayEditor(null)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none">Cancelar</button>
              <button
                type="button"
                onClick={async () => {
                  if (!payEditor) return;
                  const res = await updateStaffPayMode(payEditor.id, {
                    payModel: payEditor.payModel,
                    percentageRate: payEditor.percentageRate,
                    fixedAmount: payEditor.fixedAmount,
                  }, shopId);
                  if (!res.success) {
                    setError(res.error);
                    return;
                  }
                  setStaff((prev) => prev.map((m) => (m.id === payEditor.id ? { ...m, payModel: payEditor.payModel, percentageRate: payEditor.percentageRate, fixedAmount: payEditor.fixedAmount } : m)));
                  setPayEditor(null);
                  addToast("Modo de cobro actualizado", "success");
                }}
                className="px-3 py-1.5 rounded-lg text-sm bg-violet-600 text-white hover:bg-violet-700 transition-colors cursor-pointer select-none"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {portalReady && scheduleEditor && createPortal((
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/50 dark:border-zinc-700/50">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Horarios de {scheduleEditor.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Configurá los horarios disponibles para cada día.</p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleEditor(null)}
                className="p-1 rounded-md text-gray-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-5 space-y-2">
              {scheduleEditor.schedule.map((day, i) => {
                const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
                return (
                  <div key={day.day_of_week} className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2">
                    <span className="w-10 text-sm font-medium text-gray-700 dark:text-gray-300">{dayNames[day.day_of_week]}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={day.is_active}
                        onChange={() => {
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
                            const next = [...scheduleEditor.schedule];
                            next[i] = { ...next[i], end_time: e.target.value };
                            setScheduleEditor({ ...scheduleEditor, schedule: next });
                          }}
                          className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-5 pb-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setScheduleEditor(null)}
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
              >
                Cancelar
              </button>
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
                className="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer select-none"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {portalReady && profileEditor && createPortal((
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/50 dark:border-zinc-700/50">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Perfil de {profileEditor.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Foto, descripción y redes sociales.</p>
              </div>
              <button
                type="button"
                onClick={() => setProfileEditor(null)}
                className="p-1 rounded-md text-gray-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Photo */}
              <div>
                <Label>Foto</Label>
                <div className="mt-1 flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded-full overflow-hidden bg-violet-100 dark:bg-violet-900 flex items-center justify-center shrink-0">
                    {profileEditor.photo_url ? (
                      <img src={profileEditor.photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-violet-600 dark:text-violet-300">
                        {profileEditor.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    {profileEditor.uploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <label className="cursor-pointer select-none">
                    <span className="text-sm text-sky-600 hover:text-sky-800 font-medium">
                      {profileEditor.photo_url ? "Cambiar foto" : "Subir foto"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={profileEditor.uploading}
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
                  {profileEditor.photo_url && (
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
                  value={profileEditor.description}
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
                    value={profileEditor.instagram}
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
                  value={profileEditor.whatsapp}
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
              <button
                type="button"
                onClick={() => setProfileEditor(null)}
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
              >
                Cancelar
              </button>
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
                className="px-3 py-1.5 rounded-lg text-sm bg-sky-600 text-white hover:bg-sky-700 transition-colors cursor-pointer select-none"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

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
