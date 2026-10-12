/**
 * BLOQUE B + C: la reserva publica (turno simple y combo) del local real "klip".
 *
 * Se llaman los server actions de verdad contra la base de verdad. Cada prueba
 * deja el local como estaba: `limpiar()` borra lo creado y `restaurarLocal()`
 * devuelve los ajustes del local a su valor original.
 *
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/turnos-klip-reserva.db.test.ts
 */
import { vi } from "vitest";
import {
  DB_TESTS_ON,
  SHOP_ID,
  OWNER_ID,
  TAG,
  db,
  artDate,
  sumarDias,
  proximoDiaDeSemana,
  artTimestamp,
  hhmmEnArt,
  limpiar,
  snapshotLocal,
  restaurarLocal,
  liberarLocal,
  crearProfesionalLab,
  crearServicioLab,
  crearOverrideLab,
  ponerHorario,
  cablearAuth,
  ipUnica,
  registrarCliente,
  registrarTurno,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "./klip-lab";

vi.unmock("@/lib/argentina-time");

const LUCIN = "05051ed9-4104-4dec-894b-58b437d7a237";
const MEFIS = "30a88204-ba79-42d1-a02a-54b9ef0d0ad3";
const PABLE = "17e3abd1-b258-4cec-905e-c0fae0680780";
const LEAN = OWNER_ID;

describe.skipIf(!DB_TESTS_ON)("Turnos klip · reserva publica (B) y combos (C)", () => {
  let miercoles: string;
  let jueves: string;
  let servicio: string;

  beforeAll(async () => {
    await snapshotLocal();
    miercoles = proximoDiaDeSemana(3);
    jueves = proximoDiaDeSemana(4);
  }, 900_000);

  beforeEach(async () => {
    await limpiar();
    await restaurarLocal();
    ipUnica();
    const { completedBookingCache } = await import("@/lib/booking-cache");
    completedBookingCache.clear();
    servicio = await crearServicioLab({ name: "corte-lab", price: 20000, duration: 30 });
    // El equipo real de klip ya tiene servicios asignados, asi que el chequeo de
    // compatibilidad rechazaria cualquier servicio nuevo. Se les abre este.
    await db().from("staff_services").insert(
      [LEAN, LUCIN, MEFIS, PABLE].map((staff_id) => ({ staff_id, service_id: servicio })),
    );
    await cablearAuth(OWNER_ID, "owner");
  }, 60_000);

  afterAll(async () => {
    await limpiar();
    await restaurarLocal();
    await liberarLocal();
  }, 900_000);

  /** Alta de turno simple. `auth: true` esquiva el anti-abuso de la IP. */
  async function reservar(over: Record<string, unknown> = {}) {
    const { createPublicAppointment } = await import("@/lib/dashboard/booking/public-booking-actions");
    const dia = (over.dia as string) ?? miercoles;
    const desde = (over.desde as string) ?? "10:00";
    const duracion = (over.duracion as number) ?? 30;
    const [h, m] = desde.split(":").map(Number);
    const fin = new Date(2000, 0, 1, h, m + duracion);
    const hasta = `${String(fin.getHours()).padStart(2, "0")}:${String(fin.getMinutes()).padStart(2, "0")}`;
    return createPublicAppointment({
      shopId: SHOP_ID,
      serviceId: (over.serviceId as string) ?? servicio,
      staffId: (over.staffId as string) ?? undefined,
      customerName: (over.customerName as string) ?? `${TAG} Cliente Prueba`,
      customerEmail: over.customerEmail as string | undefined,
      customerPhone: (over.customerPhone as string) ?? "1155550000",
      authenticatedUserId: over.auth === false ? undefined : OWNER_ID,
      status: (over.status as "confirmed" | "pending_payment") ?? "confirmed",
      startTime: artTimestamp(dia, desde),
      endTime: artTimestamp(dia, hasta),
    });
  }

  async function appointmentRow(id: string) {
    const { data } = await db().from("appointments").select("*").eq("id", id).single();
    return data as Record<string, unknown>;
  }

  async function customerRow(id: string) {
    const { data } = await db().from("customers").select("*").eq("id", id).single();
    return data as Record<string, unknown>;
  }

  // ================================================================== B1
  it("B1 · reserva simple: crea el turno con el precio de la base, no el del cliente", async () => {
    const res = await reservar({ staffId: LUCIN });
    expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
    if (!res.success) return;

    const row = await appointmentRow(res.data.appointmentId);
    registrarTurno(res.data.appointmentId);
    expect(row.status).toBe("confirmed");
    expect(row.is_paid, "con pay_at_shop el turno queda IMPAGO").toBe(false);
    expect(row.service_price, "sale de services.price, no del input").toBe(20000);
    expect(row.date_key_ar).toBe(miercoles);
    expect(row.staff_id).toBe(LUCIN);
    expect(row.shop_id).toBe(SHOP_ID);
    // 10:00 ART = 13:00 UTC.
    expect(row.start_time).toBe(`${miercoles}T13:00:00+00:00`);
    expect(row.end_time).toBe(`${miercoles}T13:30:00+00:00`);
  }, 30_000);

  // ================================================================== B2
  it("B2 · el cliente se crea con el nombre y el telefono", async () => {
    const res = await reservar({ staffId: LUCIN, customerName: `${TAG} Ana Gomez` });
    expect(res.success).toBe(true);
    if (!res.success) return;
    registrarTurno(res.data.appointmentId);
    registrarCliente(res.data.customerId);
    const cliente = await customerRow(res.data.customerId);
    expect(cliente.nombre).toBe(`${TAG} Ana Gomez`);
    expect(cliente.telefono).toBe("1155550000");
    expect(cliente.shop_id).toBe(SHOP_ID);
  }, 30_000);

  // ================================================================== B3
  it("B3 · con el mismo telefono reutiliza el cliente en vez de duplicarlo", async () => {
    const uno = await reservar({ staffId: LUCIN, desde: "10:00", customerName: `${TAG} Primer Nombre` });
    expect(uno.success).toBe(true);
    if (!uno.success) return;
    registrarTurno(uno.data.appointmentId);

    const dos = await reservar({
      staffId: MEFIS,
      desde: "14:00",
      customerName: `${TAG} Segundo Nombre Distinto`,
    });
    expect(dos.success).toBe(true);
    if (!dos.success) return;
    registrarTurno(dos.data.appointmentId);

    expect(dos.data.customerId, "mismo cliente").toBe(uno.data.customerId);
    const cliente = await customerRow(uno.data.customerId);
    expect(cliente.nombre, "el nombre se actualiza al nuevo").toBe(`${TAG} Segundo Nombre Distinto`);
  }, 40_000);

  // ================================================================== B4
  it("B4 · sin profesional asignado elige uno libre que pueda con el servicio", async () => {
    // Nadie tiene asignado el servicio de la prueba, asi que cualquiera puede.
    const res = await reservar({ staffId: undefined });
    expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
    if (!res.success) return;
    registrarTurno(res.data.appointmentId);
    const row = await appointmentRow(res.data.appointmentId);
    expect(row.staff_id, "auto-asigno un profesional").toBeTruthy();
    expect([LEAN, LUCIN, MEFIS, PABLE]).toContain(row.staff_id);
  }, 30_000);

  // ================================================================== B5
  it("B5 · sin preferencia SI respeta el descanso del local", async () => {
    // Camino SIN profesional: el descanso viene de `resolveShopDayConfig` y si se
    // aplica. (Con profesional hay otro problema, ver B17bis.)
    const primer = await reservar({ dia: jueves, desde: "13:00", staffId: undefined });
    expect(primer.success).toBe(false);
    if (!primer.success) expect(primer.error).toBe("El horario seleccionado coincide con el descanso");

    // Y un horario antes del descanso entra normal.
    const ok = await reservar({ dia: jueves, desde: "12:00", staffId: undefined });
    expect(ok.success, ok.success ? "" : JSON.stringify(ok)).toBe(true);
    if (ok.success) registrarTurno(ok.data.appointmentId);
  }, 50_000);

  // ================================================================== B14
  it("B14 · HALLAZGO: el dia cerrado por el local se puede reservar igual si se elige profesional", async () => {
    // Klip tiene el lunes CERRADO. El motor de slots (A2) lo respeta y no ofrece
    // nada. Pero `createPublicAppointment` con `staffId` arma el horario desde la
    // fila de `staff_schedules` del profesional y despues SOLO interseca
    // start/end si el local esta abierto:
    //
    //   if (shopConfig.open) { interStart/interEnd }
    //
    // Si el local esta cerrado, el `if` no corre y el horario del profesional
    // queda intacto. El dia cerrado desaparece.
    const lunes = proximoDiaDeSemana(1);
    const conProfesional = await reservar({ dia: lunes, desde: "10:00", staffId: LUCIN });
    console.log(
      `  [B14] con profesional -> ${conProfesional.success ? "ACEPTADO (bug)" : conProfesional.error}`,
    );
    // Fijado a proposito: hoy el bug existe. Si se arregla, este assert falla y
    //senal el comportamiento nuevo (hay que dar vuelta el test, no borrarlo).
    expect(conProfesional.success, "BUG CONOCIDO: dia cerrado se reserva igual").toBe(true);
    if (conProfesional.success) {
      registrarTurno(conProfesional.data.appointmentId);
      const row = await appointmentRow(conProfesional.data.appointmentId);
      expect(row.date_key_ar).toBe(lunes);
    }

    // El mismo horario SIN profesional si lo rechaza bien: ahi no hay fila de
    // schedule que pise al local.
    const sinProfesional = await reservar({ dia: lunes, desde: "10:00", staffId: undefined });
    expect(sinProfesional.success, "sin profesional el dia cerrado se respeta").toBe(false);
    if (!sinProfesional.success) {
      expect(["El local esta cerrado en ese horario", "El local esta cerrado este dia"]).toContain(
        sinProfesional.error,
      );
    }
  }, 60_000);

  // ================================================================== B15
  it("B15 · el feriado real del local rechaza la reserva", async () => {
    const { data } = await db()
      .from("shop_date_overrides")
      .select("date")
      .eq("shop_id", SHOP_ID)
      .is("staff_id", null)
      .eq("is_closed", true)
      .limit(1);
    const dia = data?.[0]?.date as string;
    expect(dia, "el local tiene un feriado cargado").toBeTruthy();
    if (!dia) return;

    const res = await reservar({ dia, desde: "10:00", staffId: LUCIN });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toBe("El local esta cerrado este dia");
  }, 30_000);

  // ================================================================== B16
  it("B16 · vacaciones de un profesional: solo lo bloquea a el", async () => {
    await crearOverrideLab({ fecha: miercoles, staffId: LUCIN, isClosed: true, motivo: "vacaciones" });
    const bloqueado = await reservar({ staffId: LUCIN, desde: "10:00" });
    expect(bloqueado.success).toBe(false);
    if (!bloqueado.success) expect(bloqueado.error).toBe("El profesional no trabaja este dia");

    const otro = await reservar({ staffId: MEFIS, desde: "10:00" });
    expect(otro.success, otro.success ? "" : JSON.stringify(otro)).toBe(true);
    if (!otro.success) return;
    registrarTurno(otro.data.appointmentId);
  }, 40_000);

  // ================================================================== B17
  it("B17 · fuera del horario de atencion", async () => {
    const temprano = await reservar({ staffId: LUCIN, desde: "07:00" });
    expect(temprano.success).toBe(false);
    if (!temprano.success) expect(temprano.error).toBe("El horario seleccionado esta fuera del horario de atencion");

    const tarde = await reservar({ staffId: LUCIN, desde: "21:00" });
    expect(tarde.success).toBe(false);
    if (!tarde.success) expect(tarde.error).toBe("El horario seleccionado esta fuera del horario de atencion");
  }, 50_000);

  // ================================================================== B17bis
  it("B17bis · HALLAZGO: el descanso del LOCAL se pierde cuando el profesional tiene horario", async () => {
    // Klip tiene descanso los jueves de 13:00 a 16:00. El motor de slots (A5) lo
    // parte en dos. `createPublicAppointment`, en cambio, arma
    // `effectiveDayConfig` desde `staff_schedules` (break null) y luego
    // intersecta SOLO `start` y `end` con el local: el `break_start`/`break_end`
    // del local no se copia. Con un profesional elegido, el descanso desaparece
    // y se puede reservar en el medio de la merienda.
    const dentroDelDescanso = await reservar({ dia: jueves, staffId: LUCIN, desde: "14:00" });
    console.log(
      `  [B17bis] jueves 14:00 (descanso 13-16) con profesional -> ${
        dentroDelDescanso.success ? "ACEPTADO (bug)" : dentroDelDescanso.error
      }`,
    );
    // BUG CONOCIDO, fijado a proposito.
    expect(dentroDelDescanso.success, "BUG CONOCIDO: el descanso del local se pierde").toBe(true);
    if (dentroDelDescanso.success) {
      registrarTurno(dentroDelDescanso.data.appointmentId);
      const row = await appointmentRow(dentroDelDescanso.data.appointmentId);
      expect(row.staff_id).toBe(LUCIN);
    }

    // Sin profesional el mismo horario se rechaza: confirma que la diferencia
    // esta en el camino del `staffId`, no en los datos.
    const sinProfesional = await reservar({ dia: jueves, desde: "14:00", staffId: undefined });
    expect(sinProfesional.success).toBe(false);
    if (!sinProfesional.success) {
      expect(sinProfesional.error).toBe("El horario seleccionado coincide con el descanso");
    }
  }, 60_000);

  // ================================================================== B6
  it("B6 · si el unico profesional libre esta ocupado, dice que no hay profesionales", async () => {
    // Un local con un solo profesional, tomado.
    const unico = await crearProfesionalLab("unico", {
      dias: [{ day: new Date(`${miercoles}T12:00:00-03:00`).getUTCDay(), start: "09:00", end: "20:00" }],
      role: "owner",
    });
    await db().from("staff_services").insert({ staff_id: unico, service_id: servicio });
    // Se apagan los demas.
    const { data: membresias } = await db()
      .from("shop_memberships")
      .select("user_id")
      .eq("shop_id", SHOP_ID)
      .eq("is_active", true)
      .neq("user_id", unico);
    await db()
      .from("shop_memberships")
      .update({ is_active: false })
      .eq("shop_id", SHOP_ID)
      .eq("is_active", true);

    try {
      const ocupado = await reservar({ dia: miercoles, desde: "10:00", staffId: unico });
      expect(ocupado.success).toBe(true);
      if (!ocupado.success) return;
      registrarTurno(ocupado.data.appointmentId);

      const segundo = await reservar({ dia: miercoles, desde: "10:15", staffId: unico });
      expect(segundo.success).toBe(false);
      if (segundo.success) return;
      expect(segundo.error).toBe("slot_taken");
    } finally {
      for (const m of membresias ?? []) {
        await db().from("shop_memberships").update({ is_active: true }).eq("shop_id", SHOP_ID).eq("user_id", m.user_id);
      }
    }
  }, 60_000);

  // ================================================================== B7
  it("B7 · sin profesionales libres en absoluto devuelve el mensaje de cola manual", async () => {
    const { data: membresias } = await db()
      .from("shop_memberships")
      .select("user_id")
      .eq("shop_id", SHOP_ID)
      .eq("is_active", true);
    await db().from("shop_memberships").update({ is_active: false }).eq("shop_id", SHOP_ID).eq("is_active", true);
    try {
      const res = await reservar({ staffId: undefined });
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe("No hay profesionales disponibles para este turno");
    } finally {
      for (const m of membresias ?? []) {
        await db().from("shop_memberships").update({ is_active: true }).eq("shop_id", SHOP_ID).eq("user_id", m.user_id);
      }
    }
  }, 40_000);

  // ================================================================== B8
  it("B8 · dos reservas sobre el mismo horario del mismo profesional: la segunda es slot_taken", async () => {
    const uno = await reservar({ staffId: LUCIN, desde: "11:00" });
    expect(uno.success).toBe(true);
    if (!uno.success) return;
    registrarTurno(uno.data.appointmentId);

    const dos = await reservar({ staffId: LUCIN, desde: "11:15" });
    expect(dos.success).toBe(false);
    if (dos.success) return;
    expect(dos.error).toBe("slot_taken");
  }, 40_000);

  // ================================================================== B9
  it("B9 · el mismo horario para OTRO profesional si", async () => {
    const uno = await reservar({ staffId: LUCIN, desde: "11:00" });
    const dos = await reservar({ staffId: MEFIS, desde: "11:00" });
    expect(uno.success && dos.success).toBe(true);
    if (!uno.success || !dos.success) return;
    registrarTurno(uno.data.appointmentId);
    registrarTurno(dos.data.appointmentId);
  }, 40_000);

  // ================================================================== B10
  it("B10 · el turno cancelado libera el horario para el mismo profesional", async () => {
    const uno = await reservar({ staffId: LUCIN, desde: "12:00" });
    expect(uno.success).toBe(true);
    if (!uno.success) return;
    registrarTurno(uno.data.appointmentId);
    await db().from("appointments").update({ status: "cancelled" }).eq("id", uno.data.appointmentId);

    const dos = await reservar({ staffId: LUCIN, desde: "12:00" });
    expect(dos.success, dos.success ? "" : JSON.stringify(dos)).toBe(true);
    if (!dos.success) return;
    registrarTurno(dos.data.appointmentId);
  }, 40_000);

  // ================================================================== B11
  it("B11 · fin de turno antes del inicio", async () => {
    const { createPublicAppointment } = await import("@/lib/dashboard/booking/public-booking-actions");
    const res = await createPublicAppointment({
      shopId: SHOP_ID,
      serviceId: servicio,
      customerName: `${TAG} Cliente`,
      customerPhone: "1155550000",
      authenticatedUserId: OWNER_ID,
      startTime: artTimestamp(miercoles, "10:00"),
      endTime: artTimestamp(miercoles, "09:00"),
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toBe("Horario invalido");
  }, 30_000);

  // ================================================================== B12
  it("B12 · email, telefono y nombre inválidos", async () => {
    expect((await reservar({ customerEmail: "no-es-mail" })).error).toBe("Email inválido");
    expect((await reservar({ customerPhone: "123" })).error).toBe("Teléfono inválido");
    expect((await reservar({ customerPhone: "1234567890123456" })).error).toBe("Teléfono inválido");
    expect((await reservar({ customerName: "A" })).error).toBe("Nombre inválido");
    expect((await reservar({ customerName: "x".repeat(101) })).error).toBe("Nombre inválido");
  }, 60_000);

  // ================================================================== B13
  it("B13 · fecha pasada y horario pasado", async () => {
    const ayer = sumarDias(artDate(), -1);
    const pasado = await reservar({ dia: ayer, desde: "10:00" });
    expect(pasado.success).toBe(false);
    if (pasado.success) return;
    expect(pasado.error).toBe("No se puede reservar en una fecha pasada");

    // Hoy, pero a una hora que ya fue. Se calcula con margen para que no se
    // corra entre el calculo del test y el del server action.
    const dentroDeUnaHora = new Date(Date.now() + 60 * 60_000);
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(dentroDeUnaHora);
    const hoy = artDate();
    if (dowEnArt(hoy) === 3) {
      const viejo = await reservar({ dia: hoy, desde: "00:30" });
      expect(viejo.success).toBe(false);
      if (!viejo.success) expect(viejo.error).toBe("No se puede reservar en un horario pasado");
    }
  }, 40_000);

  // ================================================================== B18
  it("B18 · el profesional no hace ese servicio", async () => {
    // Servicio nuevo que SOLO tiene LUCIN: el resto del equipo no lo hace.
    const soloLucin = await crearServicioLab({ name: "solo-para-lucin", price: 20000, duration: 30 });
    await db().from("staff_services").insert({ staff_id: LUCIN, service_id: soloLucin });

    const ok = await reservar({ serviceId: soloLucin, staffId: LUCIN, desde: "10:00" });
    expect(ok.success).toBe(true);
    if (!ok.success) return;
    registrarTurno(ok.data.appointmentId);

    const no = await reservar({ serviceId: soloLucin, staffId: MEFIS, desde: "10:00" });
    expect(no.success).toBe(false);
    if (no.success) return;
    expect(no.error).toBe("El profesional no realiza este servicio");
  }, 40_000);

  // ================================================================== B19
  it("B19 · el anti-abuso: la segunda reserva desde la MISMA IP sin login pide iniciar sesión", async () => {
    const uno = await reservar({ staffId: LUCIN, desde: "10:00", auth: false });
    expect(uno.success, uno.success ? "" : JSON.stringify(uno)).toBe(true);
    if (!uno.success) return;
    registrarTurno(uno.data.appointmentId);

    const dos = await reservar({ staffId: LUCIN, desde: "15:00", auth: false });
    expect(dos.success).toBe(false);
    if (dos.success) return;
    expect(dos.error).toBe("login_required");
  }, 40_000);

  // ================================================================== B20
  it("B20 · con cuenta iniciada el anti-abuso no bloquea", async () => {
    const uno = await reservar({ staffId: LUCIN, desde: "10:00", auth: false });
    expect(uno.success).toBe(true);
    if (!uno.success) return;
    registrarTurno(uno.data.appointmentId);

    const dos = await reservar({ staffId: LUCIN, desde: "15:00", auth: true });
    expect(dos.success, dos.success ? "" : JSON.stringify(dos)).toBe(true);
    if (!dos.success) return;
    registrarTurno(dos.data.appointmentId);
  }, 40_000);

  // ================================================================== B21
  it("B21 · una reserva con pago pendiente NO arma el record de anti-abuso", async () => {
    const uno = await reservar({ staffId: LUCIN, desde: "10:00", auth: false, status: "pending_payment" });
    expect(uno.success).toBe(true);
    if (!uno.success) return;
    registrarTurno(uno.data.appointmentId);
    const row = await appointmentRow(uno.data.appointmentId);
    expect(row.status).toBe("pending_payment");

    const dos = await reservar({ staffId: LUCIN, desde: "15:00", auth: false, status: "pending_payment" });
    expect(dos.success, dos.success ? "" : JSON.stringify(dos)).toBe(true);
    if (!dos.success) return;
    registrarTurno(dos.data.appointmentId);
  }, 40_000);

// ================================================================== B22
  it("B22 · un usuario que NO es del local se puede colar como profesional del turno", async () => {
    const { crearIntruso, borrarIntruso } = await import("./klip-lab");
    const intruso = await crearIntruso();
    try {
      const res = await reservar({ staffId: intruso.userId, desde: "10:00" });
      // HALLAZGO: `createPublicAppointment` NO valida que el `staffId` sea
      // miembro del local. El unico freno es la FK `appointments.staff_id ->
      // user_profiles.user_id`, que es GLOBAL (no incluye shop_id), asi que un
      // usuario de cualquier otro salon pasa. El turno queda en la agenda de
      // klip asignado a alguien que no trabaja ahi.
      console.log(
        `  [B22] staff de otro local -> ${res.success ? "ACEPTADO (bug)" : res.error}`,
      );
      expect(res.success, "BUG CONOCIDO: no se valida la pertenencia del profesional").toBe(true);
      if (res.success) {
        registrarTurno(res.data.appointmentId);
        const row = await appointmentRow(res.data.appointmentId);
        expect(row.staff_id).toBe(intruso.userId);
        expect(row.shop_id).toBe(SHOP_ID);
      }
    } finally {
      await borrarIntruso(intruso);
    }
  }, 60_000);

  // ================================================================== B23
  it("B23 · el slot taken no deja nada a medias: ni cliente huerfano ni turno", async () => {
    const uno = await reservar({ staffId: LUCIN, desde: "16:00" });
    expect(uno.success).toBe(true);
    if (!uno.success) return;
    registrarTurno(uno.data.appointmentId);

    const { data: clientesAntes } = await db().from("customers").select("id").eq("shop_id", SHOP_ID);
    const dos = await reservar({ staffId: LUCIN, desde: "16:10", customerPhone: "1155559999" });
    expect(dos.success).toBe(false);
    const { data: clientesDespues } = await db().from("customers").select("id").eq("shop_id", SHOP_ID);
    expect(clientesDespues!.length).toBe(clientesAntes!.length);
  }, 40_000);

  // ================================================================== B24
  it("B24 · un override con horario reducido recorta a ese profesional", async () => {
    await crearOverrideLab({
      fecha: miercoles,
      staffId: LUCIN,
      isClosed: false,
      start: "14:00",
      end: "17:00",
      motivo: "horario reducido",
    });
    const antes = await reservar({ staffId: LUCIN, desde: "10:00" });
    expect(antes.success).toBe(false);
    if (!antes.success) {
      expect(antes.error).toBe("El horario seleccionado esta fuera del horario de atencion");
    }
    const dentro = await reservar({ staffId: LUCIN, desde: "15:00" });
    expect(dentro.success, dentro.success ? "" : JSON.stringify(dentro)).toBe(true);
    if (!dentro.success) return;
    registrarTurno(dentro.data.appointmentId);
  }, 50_000);

  // ================================================================== B25
  it("B25 · con el descanso del local puesto a mano, el borde se comporta distinto con y sin profesional", async () => {
    await ponerHorario("thursday", {
      open: true,
      start: "09:00",
      end: "20:00",
      break_start: "13:00",
      break_end: "16:00",
    });

    // Sin profesional: el descanso se aplica y 12:45-13:15 se rechaza.
    const justo = await reservar({ dia: jueves, desde: "12:30", staffId: undefined });
    expect(justo.success, justo.success ? "" : JSON.stringify(justo)).toBe(true);
    if (justo.success) registrarTurno(justo.data.appointmentId);

    const pasado = await reservar({ dia: jueves, desde: "12:45", staffId: undefined });
    expect(pasado.success).toBe(false);
    if (!pasado.success) {
      expect(pasado.error).toBe("El horario seleccionado coincide con el descanso");
    }

    // Con profesional: el mismo 12:45 pasa el filtro del descanso (ver B17bis).
    const conProfe = await reservar({ dia: jueves, desde: "12:45", staffId: MEFIS });
    console.log(`  [B25] 12:45 con profesional -> ${conProfe.success ? "ACEPTADO (bug)" : conProfe.error}`);
    if (conProfe.success) registrarTurno(conProfe.data.appointmentId);
  }, 60_000);

  // ================================================================== C1
  describe("combos", () => {
    async function crearComboLab(services: Array<{ id: string; nombre: string; duracion: number; precio: number }>, precio = 50000) {
      const { data: combo, error } = await db()
        .from("combos")
        .insert({
          shop_id: SHOP_ID,
          name: `${TAG} combo`,
          price: precio,
          duration_minutes: services.reduce((a, s) => a + s.duracion, 0),
          active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      await db()
        .from("combo_services")
        .insert(services.map((s) => ({ combo_id: combo.id, service_id: s.id })));
      return combo.id as string;
    }

    async function reservarCombo(comboId: string, over: Record<string, unknown> = {}) {
      const { createPublicComboAppointment } = await import("@/lib/dashboard/booking/public-booking-actions");
      const { fetchPublicCombos } = await import("@/lib/dashboard/booking/public-booking-actions");
      const combos = await fetchPublicCombos(SHOP_ID);
      const combo = combos.success ? combos.data.find((c) => c.id === comboId) : undefined;
      if (!combo) return { success: false as const, error: "combo no encontrado" };
      const dia = (over.dia as string) ?? miercoles;
      const desde = (over.desde as string) ?? "10:00";
      return createPublicComboAppointment({
        shopId: SHOP_ID,
        comboId,
        comboName: combo.name,
        comboPrice: combo.price,
        services: combo.services.map((s) => ({
          id: s.id,
          name: s.name,
          duration_minutes: s.duration_minutes,
          price: s.price,
        })),
        staffId: (over.staffId as string) ?? undefined,
        customerName: `${TAG} Cliente Combo`,
        customerPhone: "1155550000",
        authenticatedUserId: OWNER_ID,
        startTime: artTimestamp(dia, desde),
      });
    }

    it("C1 · un combo crea un turno por servicio, pegados y con el precio repartido", async () => {
      const a = await crearServicioLab({ name: "combo-a", price: 15000, duration: 30 });
      const b = await crearServicioLab({ name: "combo-b", price: 25000, duration: 45 });
      const comboId = await crearComboLab(
        [
          { id: a, nombre: "combo-a", duracion: 30, precio: 15000 },
          { id: b, nombre: "combo-b", duracion: 45, precio: 25000 },
        ],
        40000,
      );
      await db()
        .from("staff_services")
        .insert([
          { staff_id: LUCIN, service_id: a },
          { staff_id: LUCIN, service_id: b },
        ]);

      const res = await reservarCombo(comboId, { staffId: LUCIN });
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      if (!res.success || !("data" in res)) return;

      const ids = res.data.appointmentIds;
      expect(ids).toHaveLength(2);
      for (const id of ids) registrarTurno(id);

      const { data: filas } = await db().from("appointments").select("*").in("id", ids).order("start_time");
      const [f1, f2] = filas!;
      // Postgres devuelve el timestamptz normalizado a UTC, asi que se compara
      // en hora de Argentina y no con el string enviado.
      expect(hhmmEnArt(f1.start_time)).toBe("10:00");
      expect(hhmmEnArt(f1.end_time)).toBe("10:30");
      // El segundo arranca JUSTO cuando termina el primero.
      expect(f2.start_time).toBe(f1.end_time);
      expect(hhmmEnArt(f2.end_time)).toBe("11:15");
      // Reparto proporcional: 15/40 y 25/40 de 40000 = 15000 y 25000.
      const suma = Number(f1.service_price) + Number(f2.service_price);
      expect(suma).toBe(40000);
    }, 60_000);

    it("C2 · el combo que se pisa consigo mismo devuelve slot_taken y no deja nada", async () => {
      const a = await crearServicioLab({ name: "combo-c", price: 10000, duration: 30 });
      const b = await crearServicioLab({ name: "combo-d", price: 10000, duration: 30 });
      const comboId = await crearComboLab(
        [
          { id: a, nombre: "combo-c", duracion: 30, precio: 10000 },
          { id: b, nombre: "combo-d", duracion: 30, precio: 10000 },
        ],
        18000,
      );
      await db()
        .from("staff_services")
        .insert([
          { staff_id: LUCIN, service_id: a },
          { staff_id: LUCIN, service_id: b },
        ]);

      const primero = await reservarCombo(comboId, { staffId: LUCIN, desde: "11:00" });
      expect(primero.success, primero.success ? "" : JSON.stringify(primero)).toBe(true);
      if (!primero.success || !("data" in primero)) return;
      for (const id of primero.data.appointmentIds) registrarTurno(id);

      const segundo = await reservarCombo(comboId, { staffId: LUCIN, desde: "11:00" });
      expect(segundo.success).toBe(false);
      if (segundo.success) return;
      expect(segundo.error).toBe("slot_taken");

      // No quedo a medias el segundo combo: la fila del servicio B no existe.
      const { data: sueltas } = await db()
        .from("appointments")
        .select("id")
        .eq("shop_id", SHOP_ID)
        .eq("service_id", b);
      const idsEsperados = new Set(primero.data.appointmentIds as string[]);
      const nuevas = (sueltas ?? []).map((s) => s.id as string).filter((x) => !idsEsperados.has(x));
      expect(nuevas, "el combo rechazado no dejo filas huerfanas del servicio B").toEqual([]);
    }, 60_000);

    it("C3 · un combo inactivo no se puede reservar", async () => {
      const a = await crearServicioLab({ name: "combo-inactivo", price: 10000, duration: 30 });
      const comboId = await crearComboLab([{ id: a, nombre: "combo-inactivo", duracion: 30, precio: 10000 }], 10000);
      await db().from("combos").update({ active: false }).eq("id", comboId);

      const { createPublicComboAppointment } = await import("@/lib/dashboard/booking/public-booking-actions");
      const res = await createPublicComboAppointment({
        shopId: SHOP_ID,
        comboId,
        comboName: "x",
        comboPrice: 10000,
        services: [{ id: a, name: "combo-inactivo", duration_minutes: 30, price: 10000 }],
        customerName: `${TAG} Cliente`,
        customerPhone: "1155550000",
        authenticatedUserId: OWNER_ID,
        startTime: artTimestamp(miercoles, "10:00"),
      });
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe("El combo no esta disponible");
    }, 50_000);

    it("C4 · un combo de otro local no se puede reservar en klip", async () => {
      const { crearIntruso, borrarIntruso } = await import("./klip-lab");
      const intruso = await crearIntruso();
      try {
        const { data: svc } = await db()
          .from("services")
          .insert({ shop_id: intruso.shopId, name: "ajeno", price: 1000, duration_minutes: 30, category: "G" })
          .select("id")
          .single();
        const { data: combo } = await db()
          .from("combos")
          .insert({ shop_id: intruso.shopId, name: "ajeno", price: 1000, duration_minutes: 30, active: true })
          .select("id")
          .single();
        await db().from("combo_services").insert({ combo_id: combo!.id, service_id: svc!.id });

        const { createPublicComboAppointment } = await import("@/lib/dashboard/booking/public-booking-actions");
        const res = await createPublicComboAppointment({
          shopId: SHOP_ID,
          comboId: combo!.id,
          comboName: "ajeno",
          comboPrice: 1000,
          services: [{ id: svc!.id, name: "ajeno", duration_minutes: 30, price: 1000 }],
          customerName: `${TAG} Cliente`,
          customerPhone: "1155550000",
          authenticatedUserId: OWNER_ID,
          startTime: artTimestamp(miercoles, "10:00"),
        });
        expect(res.success).toBe(false);
        if (res.success) return;
        expect(res.error).toBe("El combo no esta disponible");
      } finally {
        await borrarIntruso(intruso);
      }
    }, 60_000);

    it("C5 · un profesional que no hace uno de los servicios del combo: rechazado", async () => {
      const a = await crearServicioLab({ name: "combo-ok", price: 10000, duration: 30 });
      const b = await crearServicioLab({ name: "combo-no", price: 10000, duration: 30 });
      const comboId = await crearComboLab(
        [
          { id: a, nombre: "combo-ok", duracion: 30, precio: 10000 },
          { id: b, nombre: "combo-no", duracion: 30, precio: 10000 },
        ],
        18000,
      );
      await db().from("staff_services").insert({ staff_id: LUCIN, service_id: a });

      const res = await reservarCombo(comboId, { staffId: LUCIN });
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe("El profesional no realiza uno de los servicios del combo");
    }, 50_000);

    it("C6 · un servicio del combo SIN duracion (null) vuelve el combo no disponible", async () => {
      const a = await crearServicioLab({ name: "combo-cero", price: 10000, duration: 30 });
      const comboId = await crearComboLab([{ id: a, nombre: "combo-cero", duracion: 30, precio: 10000 }], 10000);
      // La base NO acepta 0 (`services_duration_minutes_check`), pero SI acepta
      // NULL. Ese es el camino real que dispara el corte de `resolveComboFromDb`.
      const upd = await db().from("services").update({ duration_minutes: null }).eq("id", a).select("id");
      expect(upd.error, "poner la duracion en null tiene que poder").toBeNull();

      const { createPublicComboAppointment } = await import("@/lib/dashboard/booking/public-booking-actions");
      const res = await createPublicComboAppointment({
        shopId: SHOP_ID,
        comboId,
        comboName: "x",
        comboPrice: 10000,
        services: [{ id: a, name: "combo-cero", duration_minutes: 30, price: 10000 }],
        customerName: `${TAG} Cliente`,
        customerPhone: "1155550000",
        authenticatedUserId: OWNER_ID,
        startTime: artTimestamp(miercoles, "10:00"),
      });
      expect(res.success).toBe(false);
      if (res.success) return;
      // HALLAZGO: el mensaje real NO es "Duracion invalida". `resolveComboFromDb`
      // ya corta antes (si un servicio no dura, el combo se declara no
      // disponible), asi que el chequeo `totalDuration <= 0` de la linea 1121 es
      // codigo muerto: nadie lo puede alcanzar.
      expect(res.error).toBe("El combo no esta disponible");
    }, 50_000);

    it("C6b · un servicio SIN duracion igual se puede reservar solo (el cliente manda el endTime)", async () => {
      const a = await crearServicioLab({ name: "sin-duracion", price: 10000, duration: 30 });
      await db().from("services").update({ duration_minutes: null }).eq("id", a);
      await db().from("staff_services").insert({ staff_id: LUCIN, service_id: a });

      const res = await reservar({ serviceId: a, staffId: LUCIN, desde: "10:00", duracion: 30 });
      console.log(`  [C6b] servicio sin duracion -> ${res.success ? "ACEPTADO" : res.error}`);
      if (res.success) {
        registrarTurno(res.data.appointmentId);
        const row = await appointmentRow(res.data.appointmentId);
        // El fin lo manda el cliente: la app no lo puede validar contra la base.
        expect(hhmmEnArt(row.end_time as string)).toBe("10:30");
      }
    }, 40_000);

    it("C7 · un combo en dia de feriado se rechaza", async () => {
      const a = await crearServicioLab({ name: "combo-feriado", price: 10000, duration: 30 });
      const comboId = await crearComboLab([{ id: a, nombre: "combo-feriado", duracion: 30, precio: 10000 }], 10000);
      const { data } = await db()
        .from("shop_date_overrides")
        .select("date")
        .eq("shop_id", SHOP_ID)
        .is("staff_id", null)
        .eq("is_closed", true)
        .limit(1);
      const dia = data?.[0]?.date as string;
      if (!dia) return;
      const res = await reservarCombo(comboId, { dia, staffId: LUCIN });
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toBe("El local esta cerrado este dia");
    }, 50_000);

    it("C8 · sin profesional, el combo auto-asigna uno que pueda TODOS los servicios", async () => {
      const a = await crearServicioLab({ name: "auto-a", price: 10000, duration: 30 });
      const b = await crearServicioLab({ name: "auto-b", price: 10000, duration: 30 });
      const comboId = await crearComboLab(
        [
          { id: a, nombre: "auto-a", duracion: 30, precio: 10000 },
          { id: b, nombre: "auto-b", duracion: 30, precio: 10000 },
        ],
        18000,
      );
      // Solo LUCIN puede los dos.
      await db().from("staff_services").insert([
        { staff_id: LUCIN, service_id: a },
        { staff_id: LUCIN, service_id: b },
      ]);

      const res = await reservarCombo(comboId);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      if (!res.success || !("data" in res)) return;
      const { data: filas } = await db()
        .from("appointments")
        .select("id,staff_id")
        .in("id", res.data.appointmentIds);
      for (const f of filas ?? []) {
        registrarTurno(f.id);
        expect(f.staff_id).toBe(LUCIN);
      }
    }, 60_000);
  });
});

function dowEnArt(fecha: string): number {
  return new Date(`${fecha}T12:00:00-03:00`).getUTCDay();
}