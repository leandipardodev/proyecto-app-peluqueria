/**
 * INTEGRACION: disponibilidad real contra la base.
 *
 * Usa el motor de verdad (`fetchPublicAvailableSlots`) con los datos de verdad: un
 * local recien creado, profesionales con horarios, overrides de feriado y de
 * vacaciones. Cada caso compara los slots que devuelve la app contra los que
 * deberia devolver.
 *
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/agenda.db.test.ts
 */
import {
  DB_TESTS_ON,
  db,
  crearLocalDePrueba,
  borrarLocalDePrueba,
  crearProfesional,
  borrarProfesional,
  crearServicio,
  sumarDias,
  dowEnArt,
  slotTime,
  type LocalDePrueba,
} from "./harness";
import { vi } from "vitest";

// Tiene que estar en el tope del modulo: `vi.unmock` se hoiste, y dentro de una
// funcion de helper Vitest avisa que va a dejar de ser un no-op. El reloj de
// `setup.ts` esta fijado en 2030-06-15, y sin esto la disponibilidad busca los
// turnos del dia equivocado.
vi.unmock("@/lib/argentina-time");

/**
 * Los server actions reales necesitan DOS cosas que `setup.ts` mockea global: el
 * cliente de Supabase y el reloj.
 *
 * - El cliente: `createAdminClient()` va por `createServiceRoleClient()`, y hay que
 *   devolverle un cliente de verdad o toda consulta viene vacia.
 * - El reloj: `setup.ts` fija `getArgentinaDateString()` en "2030-06-15" y
 *   `getArgentinaDayBounds()` en la ventana de ESE dia. Con eso mockeado, la
 *   consulta de disponibilidad pide los turnos del 2030-06-15 y no del dia que se
 *   esta probando: los turnos insertados no bloquean nada y el resultado engaña en
 *   silencio. Por eso el primer intento de este archivo dio 3 falsos negativos.
 */
async function cargarAccionesDeDisponibilidad() {
  const { createServiceRoleClient } = await import("@/lib/dashboard/auth/server");
  vi.mocked(createServiceRoleClient).mockResolvedValue(db() as never);
  const mod = await import("@/lib/dashboard/booking/public-booking-actions");
  return mod;
}

const LUNES_A_VIEVES = [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "20:00" }));

describe.skipIf(!DB_TESTS_ON)("Agenda · disponibilidad real contra la base", () => {
  let local: LocalDePrueba;
  let servicio: string;
  let Ana: string;
  let Beto: string;

  beforeAll(async () => {
    local = await crearLocalDePrueba("Agenda");
    servicio = await crearServicio(local, { name: "Corte 30", price: 30000, duration: 30 });
    // Ana trabaja L-V. Beto trabaja solo Martes y Jueves, para probar el filtro
    // por profesional.
    Ana = await crearProfesional(local, {
      nombre: "Ana",
      email: `ana-${local.slug}@klip.test`,
      dias: LUNES_A_VIEVES,
      servicios: [servicio],
    });
    Beto = await crearProfesional(local, {
      nombre: "Beto",
      email: `beto-${local.slug}@klip.test`,
      dias: [
        { day: 2, start: "09:00", end: "20:00" },
        { day: 4, start: "09:00", end: "20:00" },
      ],
      servicios: [servicio],
    });
  }, 60_000);

  afterAll(async () => {
    if (!local) return;
    const supabase = db();
    await supabase.from("shop_date_overrides").delete().eq("shop_id", local.shopId);
    await supabase.from("appointments").delete().eq("shop_id", local.shopId);
    await supabase.from("services").delete().eq("shop_id", local.shopId);
    if (Ana) await borrarProfesional(local, Ana);
    if (Beto) await borrarProfesional(local, Beto);
    await borrarLocalDePrueba(local);
  }, 60_000);

  /** Proximo dia de la semana pedido, a partir de hoy. */
  function proximoDiaDeSemana(day: number): string {
    const hoy = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    let f = hoy;
    for (let i = 0; i < 8; i++) {
      if (dowEnArt(f) === day) return f;
      f = sumarDias(f, 1);
    }
    throw new Error("no se encontro ese dia");
  }

  it("un dia normal abre 09:00-20:00 en grilla de 30 con un solo profesional", async () => {
    const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
    const dia = proximoDiaDeSemana(2); // martes
    const res = await fetchPublicAvailableSlots(local.shopId, 30, dia);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const horas = res.data.map((s) => slotTime(s.start));
    expect(horas[0]).toBe("09:00");
    expect(horas.at(-1)).toBe("19:30");
    // 11 horas de 09 a 20, con servicio de 30 min: 22 slots (el ultimo arranca 19:30).
    expect(res.data).toHaveLength(22);
    expect(res.data[0].staffIds).toContain(Ana);
  }, 30_000);

  it("el domingo esta cerrado y no ofrece nada", async () => {
    const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
    const res = await fetchPublicAvailableSlots(local.shopId, 30, proximoDiaDeSemana(0));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual([]);
  }, 30_000);

  it("filtrar por un profesional que no trabaja ese dia no ofrece nada", async () => {
    const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
    const res = await fetchPublicAvailableSlots(local.shopId, 30, proximoDiaDeSemana(3), [Beto]);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual([]);
  }, 30_000);

  it("los dos profesionales pueden el mismo slot y el slot los ofrece a los dos", async () => {
    const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
    const dia = proximoDiaDeSemana(4); // jueves, ambos trabajan
    const res = await fetchPublicAvailableSlots(local.shopId, 30, dia);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const jueves = res.data.find((s) => slotTime(s.start) === "09:00");
    expect(jueves).toBeDefined();
    // Ana y Beto estan en el slot de las 9.
    expect(jueves!.staffIds).toContain(Ana);
    expect(jueves!.staffIds).toContain(Beto);
  }, 30_000);

  it("un feriado del local (override global) cierra el dia", async () => {
    const supabase = db();
    const dia = proximoDiaDeSemana(5); // viernes
    const { error } = await supabase.from("shop_date_overrides").insert({
      shop_id: local.shopId,
      staff_id: null,
      date: dia,
      is_closed: true,
      reason: "feriado de prueba",
    });
    expect(error).toBeNull();

    try {
      const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
      const res = await fetchPublicAvailableSlots(local.shopId, 30, dia);
      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data).toEqual([]);
    } finally {
      await supabase.from("shop_date_overrides").delete().eq("shop_id", local.shopId).eq("date", dia);
    }
  }, 30_000);

  it("un horario reducido del local recorta el cierre", async () => {
    const supabase = db();
    const dia = proximoDiaDeSemana(1); // lunes
    const { error } = await supabase.from("shop_date_overrides").insert({
      shop_id: local.shopId,
      staff_id: null,
      date: dia,
      is_closed: false,
      start_time: "09:00",
      end_time: "12:00",
      reason: "horario reducido de prueba",
    });
    expect(error).toBeNull();

    try {
      const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
      const res = await fetchPublicAvailableSlots(local.shopId, 30, dia);
      expect(res.success).toBe(true);
      if (!res.success) return;
      const horas = res.data.map((s) => slotTime(s.start));
      expect(horas[0]).toBe("09:00");
      expect(horas.at(-1)).toBe("11:30");
      expect(res.data).toHaveLength(6);
    } finally {
      await supabase.from("shop_date_overrides").delete().eq("shop_id", local.shopId).eq("date", dia);
    }
  }, 30_000);

  it("un override de un profesional lo saca a el pero no al otro", async () => {
    const supabase = db();
    const dia = proximoDiaDeSemana(2); // martes, ambos trabajan
    const { error } = await supabase.from("shop_date_overrides").insert({
      shop_id: local.shopId,
      staff_id: Ana,
      date: dia,
      is_closed: true,
      reason: "vacaciones de prueba",
    });
    expect(error).toBeNull();

    try {
      const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
      const res = await fetchPublicAvailableSlots(local.shopId, 30, dia);
      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.length).toBeGreaterThan(0);
      // En ningun slot queda Ana, y Beto sigue disponible.
      for (const s of res.data) {
        expect(s.staffIds).not.toContain(Ana);
        expect(s.staffIds).toContain(Beto);
      }
    } finally {
      await supabase.from("shop_date_overrides").delete().eq("shop_id", local.shopId).eq("date", dia);
    }
  }, 30_000);

  it("un turno confirmado le saca a Ana del slot y deja el resto igual", async () => {
    const supabase = db();
    const dia = proximoDiaDeSemana(3); // miercoles
    const { error } = await supabase.from("appointments").insert({
      shop_id: local.shopId,
      service_id: servicio,
      service_price: 30000,
      staff_id: Ana,
      start_time: `${dia}T11:00:00-03:00`,
      end_time: `${dia}T11:30:00-03:00`,
      date_key_ar: dia,
      status: "confirmed",
      is_paid: true,
    });
    expect(error).toBeNull();

    try {
      const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
      const res = await fetchPublicAvailableSlots(local.shopId, 30, dia);
      expect(res.success).toBe(true);
      if (!res.success) return;
      const Once = res.data.find((s) => slotTime(s.start) === "11:00");
      const Trece = res.data.find((s) => slotTime(s.start) === "11:30");
      const diezYMedia = res.data.find((s) => slotTime(s.start) === "10:30");
      // El slot de las 11:00 pisa el turno: Ana sale de la lista.
      expect(Once).toBeDefined();
      expect(Once!.staffIds).not.toContain(Ana);
      // El de 11:30 NO pisa: el turno termina a las 11:30 y arranca al mismo
      // toque (con la tolerancia de 2 min tampoco se pisan). Ana sigue disponible.
      expect(Trece).toBeDefined();
      expect(Trece!.staffIds).toContain(Ana);
      // Y el horario de antes no se movió.
      expect(diezYMedia?.staffIds).toContain(Ana);
    } finally {
      await supabase.from("appointments").delete().eq("shop_id", local.shopId).eq("date_key_ar", dia);
    }
  }, 30_000);

  it("filtra por profesional: si pido a Beto un dia que no trabaja, no hay nada", async () => {
    const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
    // Beto solo trabaja martes y jueves; un miercoles no tiene nada suyo.
    const res = await fetchPublicAvailableSlots(local.shopId, 30, proximoDiaDeSemana(3), [Beto]);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual([]);
  }, 30_000);

  it("un part-time NO aparece los dias que no configuro (regresion)", async () => {
    // Este es el bug que se encontro probando contra la base real: Beto tiene
    // filas de horario solo martes y jueves. Como la consulta se filtraba por
    // `day_of_week`, el motor no podia distinguir "no cargo ningun horario" de
    // "no trabajo hoy" y caia al horario del local: Beto aparecia disponible (y
    // reservable) el miercoles, que nunca configuro.
    const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();

    const martes = await fetchPublicAvailableSlots(local.shopId, 30, proximoDiaDeSemana(2));
    const miercoles = await fetchPublicAvailableSlots(local.shopId, 30, proximoDiaDeSemana(3));
    const jueves = await fetchPublicAvailableSlots(local.shopId, 30, proximoDiaDeSemana(4));
    expect(martes.success && miercoles.success && jueves.success).toBe(true);
    if (!martes.success || !miercoles.success || !jueves.success) return;

    const tiene = (r: typeof martes, id: string) => r.data.some((s) => s.staffIds.includes(id));
    expect(tiene(martes, Beto)).toBe(true);
    expect(tiene(jueves, Beto)).toBe(true);
    expect(tiene(miercoles, Beto)).toBe(false);
  }, 30_000);

  it("un profesional SIN horarios cargados sigue heredando el horario del local", async () => {
    // El caso contrario, para que el fix no rompa un local recien armado: el owner
    // de este local de prueba no tiene ninguna fila en staff_schedules.
    const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
    const res = await fetchPublicAvailableSlots(local.shopId, 30, proximoDiaDeSemana(2));
    expect(res.success).toBe(true);
    if (!res.success) return;
    const conOwner = res.data.find((s) => s.staffIds.includes(local.ownerId));
    expect(conOwner).toBeDefined();
    expect(res.data[0].start.endsWith("12:00:00.000Z")).toBe(true); // 09:00 ART
  }, 30_000);

  it("el filtro por profesional NO se ignora aunque el dia tenga otro disponible", async () => {
    // El caso que distingue "filtro bien" de "filtro ausente": un miercoles Ana
    // trabaja y Beto no. Si el filtro se ignorara, vendrian los slots de Ana.
    const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
    const dia = proximoDiaDeSemana(3);
    const sinFiltro = await fetchPublicAvailableSlots(local.shopId, 30, dia);
    const conBeto = await fetchPublicAvailableSlots(local.shopId, 30, dia, [Beto]);
    expect(sinFiltro.success && conBeto.success).toBe(true);
    if (!sinFiltro.success || !conBeto.success) return;
    expect(sinFiltro.data.length).toBeGreaterThan(0);
    expect(conBeto.data).toEqual([]);
  }, 30_000);

  it("un turno cancelado NO ocupa el slot", async () => {
    const supabase = db();
    const dia = proximoDiaDeSemana(3);
    await supabase.from("appointments").insert({
      shop_id: local.shopId,
      service_id: servicio,
      service_price: 30000,
      staff_id: Ana,
      start_time: `${dia}T11:00:00-03:00`,
      end_time: `${dia}T11:30:00-03:00`,
      date_key_ar: dia,
      status: "cancelled",
      is_paid: false,
    });

    try {
      const { fetchPublicAvailableSlots } = await cargarAccionesDeDisponibilidad();
      const res = await fetchPublicAvailableSlots(local.shopId, 30, dia);
      expect(res.success).toBe(true);
      if (!res.success) return;
      const horas = res.data.map((s) => slotTime(s.start));
      expect(horas).toContain("11:00");
      expect(horas).toContain("11:30");
    } finally {
      await supabase.from("appointments").delete().eq("shop_id", local.shopId).eq("date_key_ar", dia);
    }
  }, 30_000);
});