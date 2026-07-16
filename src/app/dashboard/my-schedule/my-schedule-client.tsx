"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, Clock, Plus, Trash2 } from "lucide-react";
import BaseModal from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  getMySchedule,
  updateMySchedule,
  fetchMyDateOverrides,
  upsertMyDateOverride,
  deleteMyDateOverride,
  type MyDateOverride,
} from "@/lib/dashboard/staff/staff-actions";

type ScheduleDay = {
  day_of_week: number;
  is_active: boolean;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
};

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

function emptySchedule(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    is_active: i >= 1 && i <= 5,
    start_time: i === 6 ? "09:00" : "09:00",
    end_time: i === 6 ? "14:00" : "20:00",
    break_start: null,
    break_end: null,
  }));
}

interface MyScheduleClientProps {
  shopId: string;
  shopSlug: string;
}

export default function MyScheduleClient(_props: MyScheduleClientProps) {
  const { addToast } = useToast();

  // Schedule state
  const [schedule, setSchedule] = useState<ScheduleDay[]>(emptySchedule());
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // Overrides state
  const [overrides, setOverrides] = useState<MyDateOverride[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(true);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [editOverride, setEditOverride] = useState<MyDateOverride | null>(null);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideIsClosed, setOverrideIsClosed] = useState(true);
  const [overrideStartTime, setOverrideStartTime] = useState("09:00");
  const [overrideEndTime, setOverrideEndTime] = useState("18:00");
  const [overrideBreakStart, setOverrideBreakStart] = useState("");
  const [overrideBreakEnd, setOverrideBreakEnd] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    const res = await getMySchedule();
    if (res.success && res.data && res.data.length > 0) {
      const byDay = new Map(res.data.map((d) => [d.day_of_week, d]));
      setSchedule(
        Array.from({ length: 7 }, (_, i) => {
          const existing = byDay.get(i);
          return existing
            ? { ...existing }
            : { day_of_week: i, is_active: false, start_time: "09:00", end_time: "20:00", break_start: null, break_end: null };
        })
      );
    }
    setScheduleLoading(false);
  }, []);

  const loadOverrides = useCallback(async () => {
    setOverridesLoading(true);
    const res = await fetchMyDateOverrides();
    if (res.success) setOverrides(res.data ?? []);
    setOverridesLoading(false);
  }, []);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);
  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  async function handleSaveSchedule() {
    setScheduleSaving(true);
    const res = await updateMySchedule(schedule);
    setScheduleSaving(false);
    if (!res.success) {
      addToast(res.error || "Error al guardar", "error");
      return;
    }
    addToast("Horarios actualizados", "success");
  }

  function openNewOverride() {
    setEditOverride(null);
    setOverrideDate(new Date().toISOString().split("T")[0]);
    setOverrideIsClosed(true);
    setOverrideStartTime("09:00");
    setOverrideEndTime("18:00");
    setOverrideBreakStart("");
    setOverrideBreakEnd("");
    setOverrideReason("");
    setShowOverrideModal(true);
  }

  function openEditOverride(o: MyDateOverride) {
    setEditOverride(o);
    setOverrideDate(o.date);
    setOverrideIsClosed(o.is_closed);
    setOverrideStartTime(o.start_time ?? "09:00");
    setOverrideEndTime(o.end_time ?? "18:00");
    setOverrideBreakStart(o.break_start ?? "");
    setOverrideBreakEnd(o.break_end ?? "");
    setOverrideReason(o.reason ?? "");
    setShowOverrideModal(true);
  }

  async function handleSaveOverride() {
    if (!overrideDate) return;
    const hasBreak = !overrideIsClosed && Boolean(overrideBreakStart) && Boolean(overrideBreakEnd);
    const res = await upsertMyDateOverride(
      overrideDate,
      overrideIsClosed,
      overrideIsClosed ? null : overrideStartTime,
      overrideIsClosed ? null : overrideEndTime,
      overrideReason || null,
      hasBreak ? overrideBreakStart : null,
      hasBreak ? overrideBreakEnd : null,
    );
    if (!res.success) {
      addToast(res.error || "Error al guardar", "error");
      return;
    }
    setShowOverrideModal(false);
    await loadOverrides();
    addToast(editOverride ? "Excepcion actualizada" : "Excepcion creada", "success");
  }

  async function handleDeleteOverride(o: MyDateOverride) {
    if (!confirm(`Eliminar excepcion del ${new Date(o.date + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}?`)) return;
    const res = await deleteMyDateOverride(o.id);
    if (!res.success) {
      addToast(res.error || "Error al eliminar", "error");
      return;
    }
    await loadOverrides();
    addToast("Excepcion eliminada", "success");
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mi Horario</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Gestioná tu disponibilidad semanal y excepciones puntuales.</p>
      </div>

      {/* Weekly Schedule Card */}
      <div className="rounded-[2rem] border border-zinc-100 dark:border-zinc-800/50 bg-white dark:bg-zinc-900">
        <div className="flex items-center px-6 py-5 gap-3">
          <div className="p-2 rounded-full bg-blue-500/15 shrink-0">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Horarios Semanales</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Define tus dias y horas de trabajo</p>
          </div>
        </div>
        <div className="px-6 pb-6 space-y-2">
          {scheduleLoading ? (
            <div className="py-8 text-center text-sm text-zinc-400">Cargando horarios...</div>
          ) : (
            schedule.map((day, i) => (
              <div key={day.day_of_week} className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2">
                <span className="w-10 text-sm font-medium text-gray-700 dark:text-gray-300">{DAY_NAMES[day.day_of_week]}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={day.is_active}
                    onChange={() => {
                      const next = [...schedule];
                      next[i] = { ...next[i], is_active: !next[i].is_active };
                      setSchedule(next);
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
                        const next = [...schedule];
                        next[i] = { ...next[i], start_time: e.target.value };
                        setSchedule(next);
                      }}
                      className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                    />
                    <span className="text-xs text-gray-400">a</span>
                    <input
                      type="time"
                      value={day.end_time}
                      onChange={(e) => {
                        const next = [...schedule];
                        next[i] = { ...next[i], end_time: e.target.value };
                        setSchedule(next);
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
                            const next = [...schedule];
                            next[i] = { ...next[i], break_start: e.target.value || null };
                            setSchedule(next);
                          }}
                          className="w-24 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                        />
                        <span className="text-xs text-amber-500">break</span>
                        <input
                          type="time"
                          value={day.break_end ?? ""}
                          onChange={(e) => {
                            const next = [...schedule];
                            next[i] = { ...next[i], break_end: e.target.value || null };
                            setSchedule(next);
                          }}
                          className="w-24 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...schedule];
                        if (day.break_start) {
                          next[i] = { ...next[i], break_start: null, break_end: null };
                        } else {
                          next[i] = { ...next[i], break_start: "12:00", break_end: "13:00" };
                        }
                        setSchedule(next);
                      }}
                      className={`text-xs font-medium ml-1 cursor-pointer select-none ${
                        day.break_start
                          ? "text-red-500 hover:text-red-600 hover:underline"
                          : "text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:underline"
                      }`}
                    >
                      {day.break_start ? "quitar" : "+ agregar corte"}
                    </button>
                  </>
                )}
              </div>
            ))
          )}
          {!scheduleLoading && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={scheduleSaving}
                className="ui-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {scheduleSaving ? "Guardando..." : "Guardar horarios"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Date Overrides Card */}
      <div className="rounded-[2rem] border border-zinc-100 dark:border-zinc-800/50 bg-white dark:bg-zinc-900">
        <div className="flex items-center px-6 py-5 gap-3">
          <div className="p-2 rounded-full bg-amber-500/15 shrink-0">
            <Calendar className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Mis Excepciones</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Cierres o horarios reducidos para dias puntuales</p>
          </div>
          <button
            type="button"
            onClick={openNewOverride}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium px-4 py-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
        <div className="px-4 pb-6">
          {overridesLoading ? (
            <div className="py-8 text-center text-sm text-zinc-400">Cargando excepciones...</div>
          ) : overrides.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-400">No tenes excepciones cargadas</div>
          ) : (
            <div className="space-y-2">
              {overrides.map((o) => (
                <div key={o.id} className="flex items-center gap-3 py-2.5 px-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  <div className={`p-1.5 rounded-full shrink-0 ${o.is_closed ? "bg-red-100 dark:bg-red-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
                    <Calendar className={`w-4 h-4 ${o.is_closed ? "text-red-600" : "text-amber-600"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(o.date + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {o.is_closed ? "Cerrado todo el dia" : `${o.start_time} a ${o.end_time}${o.break_start && o.break_end ? ` (corte ${o.break_start}-${o.break_end})` : ""}`}
                      {o.reason ? ` (${o.reason})` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditOverride(o)}
                      className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                      title="Editar"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteOverride(o)}
                      className="p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-500 hover:text-red-600 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Override Modal */}
      <BaseModal
        open={showOverrideModal}
        onClose={() => setShowOverrideModal(false)}
        title={editOverride ? "Editar excepcion" : "Nueva excepcion"}
        maxWidth="sm"
      >
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Fecha</label>
            <input
              type="date"
              value={overrideDate}
              onChange={(e) => setOverrideDate(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOverrideIsClosed(true)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${overrideIsClosed ? "bg-red-500 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"}`}
            >
              Cerrado
            </button>
            <button
              type="button"
              onClick={() => setOverrideIsClosed(false)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${!overrideIsClosed ? "bg-amber-500 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"}`}
            >
              Horario reducido
            </button>
          </div>
          {!overrideIsClosed && (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Desde</label>
                  <input
                    type="time"
                    value={overrideStartTime}
                    onChange={(e) => setOverrideStartTime(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Hasta</label>
                  <input
                    type="time"
                    value={overrideEndTime}
                    onChange={(e) => setOverrideEndTime(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (overrideBreakStart && overrideBreakEnd) {
                      setOverrideBreakStart("");
                      setOverrideBreakEnd("");
                    } else {
                      setOverrideBreakStart("12:00");
                      setOverrideBreakEnd("13:00");
                    }
                  }}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                    overrideBreakStart && overrideBreakEnd
                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {overrideBreakStart && overrideBreakEnd ? "Quitar corte" : "+ Agregar corte"}
                </button>
              </div>
              {overrideBreakStart && overrideBreakEnd && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Corte desde</label>
                    <input
                      type="time"
                      value={overrideBreakStart}
                      onChange={(e) => setOverrideBreakStart(e.target.value)}
                      className="w-full rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Corte hasta</label>
                    <input
                      type="time"
                      value={overrideBreakEnd}
                      onChange={(e) => setOverrideBreakEnd(e.target.value)}
                      className="w-full rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              )}
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Motivo (opcional)</label>
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Ej: Feriado nacional, Vacaciones..."
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button type="button" onClick={() => setShowOverrideModal(false)} className="ui-btn-ghost rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
          <button type="button" onClick={handleSaveOverride} className="ui-btn-primary rounded-lg px-4 py-2 text-sm font-medium">Guardar</button>
        </div>
      </BaseModal>
    </div>
  );
}
