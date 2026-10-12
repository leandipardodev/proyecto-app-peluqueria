/**
 * BLOQUES D + E + G: la agenda del panel, los ajustes del local y los caminos de
 * pago que NO necesitan Mercado Pago.
 *
 * D: crear / reprogramar / cambiar estado / reasignar / recurrente / serie /
 *    autocompletar.
 * E: horarios, feriados, politica de seña, "asignar profesional después".
 * G: transferencia bancaria (el camino de pago que SI se puede probar entero sin
 *    pagar nada), el rechazo de MP no configurado, y la validacion de firma del
 *    webhook.
 *
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/turnos-klip-panel.db.test.ts
 */
import { vi } from "vitest";
import {
  DB_TESTS_ON,
  SHOP_ID,
  SHOP_SLUG,
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
  local,
  crearServicioLab,
  crearTurnoLab,
  crearClienteLab,
  ponerHorario,
  leerHorarios,
  cablearAuth,
  ipUnica,
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

describe.skipIf(!DB_TESTS_ON)("Turnos klip · panel, ajustes y pagos (D/E/G)", () => {
  let miercoles: string;
  let servicio: string;
  let servicioCorto: string;
  let cliente: string;

  beforeAll(async () => {
    await snapshotLocal();
    miercoles = proximoDiaDeSemana(3);
  }, 900_000);

  beforeEach(async () => {
    await limpiar();
    await restaurarLocal();
    ipUnica();
    const { completedBookingCache } = await import("@/lib/booking-cache");
    completedBookingCache.clear();
    servicio = await crearServicioLab({ name: "panel-30", price: 20000, duration: 30 });
    servicioCorto = await crearServicioLab({ name: "panel-15", price: 10000, duration: 15 });
    await db()
      .from("staff_services")
      .insert(
        [LUCIN, MEFIS, PABLE].flatMap((staff_id) => [
          { staff_id, service_id: servicio },
          { staff_id, service_id: servicioCorto },
        ]),
      );
    const c = await crearClienteLab("Panel");
    cliente = c.id;
    await cablearAuth(OWNER_ID, "owner");
  }, 60_000);

  afterAll(async () => {
    await limpiar();
    await restaurarLocal();
    await liberarLocal();
  }, 900_000);

  function formTurno(over: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set("customer_id", over.customer_id ?? cliente);
    fd.set("staff_id", over.staff_id ?? LUCIN);
    fd.set("service_ids", over.service_ids ?? servicio);
    fd.set("start_date", over.start_date ?? miercoles);
    fd.set("start_time", over.start_time ?? "10:00");
    fd.set("recurring_frequency", over.recurring_frequency ?? "none");
    if (over.recurring_until) fd.set("recurring_until", over.recurring_until);
    if (over.notes) fd.set("notes", over.notes);
    if (over.deposit_amount) fd.set("deposit_amount", over.deposit_amount);
    return fd;
  }

  async function turnosDe(id: string) {
    const { data } = await db().from("appointments").select("*").eq("id", id).single();
    return data as Record<string, unknown>;
  }

  async function turnosCreados(shopId = SHOP_ID) {
    const { data } = await db()
      .from("appointments")
      .select("id,start_time,end_time,status,staff_id,service_id,service_price,is_paid,amount_paid,recurring_group_id,deposit_amount")
      .eq("shop_id", shopId)
      .like("notes", `${TAG}%`)
      .order("start_time");
    return (data ?? []) as Array<Record<string, unknown>>;
  }

  // ================================================================= D1
  // Una reserva esperando pago, lista en la cola. Vive en el scope raiz para
  // que la usen tanto el bloque de aislamiento (F3) como el de pagos (G).
  async function crearBookingPendiente(opts: {
    staffId: string | null;
    dia?: string;
    desde?: string;
    method?: "mp" | "bank_transfer";
    expiraEnMin?: number;
    telefono?: string;
  }) {
    const dia = opts.dia ?? miercoles;
    const desde = opts.desde ?? "11:00";
    const [h, m] = desde.split(":").map(Number);
    const fin = new Date(2000, 0, 1, h, m + 30);
    const hasta = `${String(fin.getHours()).padStart(2, "0")}:${String(fin.getMinutes()).padStart(2, "0")}`;
    const { data, error } = await db()
      .from("pending_bookings")
      .insert({
        shop_id: SHOP_ID,
        customer_name: `${TAG} Transferencia`,
        customer_phone: opts.telefono ?? "1155550000",
        customer_email: `${TAG.replace(/\W/g, "")}@klip.test`,
        service_id: servicio,
        staff_id: opts.staffId,
        start_time: artTimestamp(dia, desde),
        end_time: artTimestamp(dia, hasta),
        expires_at: new Date(Date.now() + (opts.expiraEnMin ?? 60) * 60_000).toISOString(),
        status: "pending",
        payment_method: opts.method ?? "bank_transfer",
        deposit_amount: 5000,
        payment_amount: 20000,
        ip_address: "203.0.113.9",
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id as string };
  }

  describe("D · agenda del panel", () => {
    it("D1 · crear un turno simple", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      const res = await createAppointment(formTurno({ notes: `${TAG} d1` }), SHOP_ID);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      const { data: filas } = await db().from("appointments").select("*").like("notes", `${TAG} d1`);
      expect(filas).toHaveLength(1);
      registrarTurno(filas![0].id);
      expect(hhmmEnArt(filas![0].start_time)).toBe("10:00");
      expect(hhmmEnArt(filas![0].end_time)).toBe("10:30");
      // HALLAZGO menor: `createAppointment` SIEMPRE inserta `confirmed`, nunca
      // `pending_payment`. El estado "pago pendiente" solo aparece por la reserva
      // publica o por el webhook. O sea que desde el panel no se puede agendar
      // "esperando que se pague".
      expect(filas![0].status).toBe("confirmed");
      expect(filas![0].date_key_ar).toBe(miercoles);
      expect(filas![0].staff_id).toBe(LUCIN);
    }, 40_000);

    it("D2 · faltan cliente, fecha u hora: el error los lista", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      const fd = new FormData();
      fd.set("service_ids", servicio);
      fd.set("staff_id", LUCIN);
      const res = await createAppointment(fd, SHOP_ID);
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe("Faltan campos obligatorios: cliente, fecha, hora");

      // Y sin servicio.
      const fd2 = formTurno();
      fd2.delete("service_ids");
      const res2 = await createAppointment(fd2, SHOP_ID);
      expect(res2.success).toBe(false);
      if (res2.success) return;
      expect(res2.error).toBe("Faltan campos obligatorios: servicio");
    }, 40_000);

    it("D3 · dos servicios en el mismo turno crean dos filas consecutivas", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      const res = await createAppointment(
        formTurno({ service_ids: `${servicio},${servicioCorto}`, notes: `${TAG} d3` }),
        SHOP_ID,
      );
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      const { data: filas } = await db().from("appointments").select("*").like("notes", `${TAG} d3`).order("start_time");
      expect(filas).toHaveLength(2);
      for (const f of filas!) registrarTurno(f.id);
      expect(hhmmEnArt(filas![0].start_time)).toBe("10:00");
      expect(hhmmEnArt(filas![0].end_time)).toBe("10:30");
      // La segunda arranca donde termino la primera.
      expect(filas![1].start_time).toBe(filas![0].end_time);
    }, 40_000);

    it("D4 · un servicio custom con nombre, precio y duracion", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      const fd = formTurno({ notes: `${TAG} d4` });
      fd.set("is_custom_service", "true");
      fd.set("custom_service_name", `${TAG} Consulta a medida`);
      fd.set("custom_service_price", "12345");
      fd.set("custom_service_duration", "45");
      const res = await createAppointment(fd, SHOP_ID);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      const { data: filas } = await db().from("appointments").select("*").like("notes", `${TAG} d4`);
      expect(filas).toHaveLength(1);
      registrarTurno(filas![0].id);
      expect(filas![0].service_id).toBeNull();
      expect(Number(filas![0].service_price)).toBe(12345);
      expect(hhmmEnArt(filas![0].end_time)).toBe("10:45");
    }, 40_000);

    it("D5 · un servicio custom con duracion > 300 min se rechaza", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      const fd = formTurno({ notes: `${TAG} d5` });
      fd.set("is_custom_service", "true");
      fd.set("custom_service_name", " marathon");
      fd.set("custom_service_price", "1000");
      fd.set("custom_service_duration", "400");
      const res = await createAppointment(fd, SHOP_ID);
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe("Duración inválida. Máximo 300 min (5 hs).");
    }, 40_000);

    it("D6 · precio negativo rechazado", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      const fd = formTurno({ notes: `${TAG} d6` });
      fd.set("is_custom_service", "true");
      fd.set("custom_service_name", "negativo");
      fd.set("custom_service_price", "-5");
      fd.set("custom_service_duration", "30");
      const res = await createAppointment(fd, SHOP_ID);
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe("El precio debe ser un monto válido");
    }, 40_000);

    it("D7 · dos turnos del mismo profesional en el mismo horario: slot_taken", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      const uno = await createAppointment(formTurno({ notes: `${TAG} d7a` }), SHOP_ID);
      expect(uno.success).toBe(true);
      const { data: filas } = await db().from("appointments").select("id").like("notes", `${TAG} d7a`);
      registrarTurno(filas![0].id);

      const dos = await createAppointment(formTurno({ notes: `${TAG} d7b`, start_time: "10:15" }), SHOP_ID);
      expect(dos.success).toBe(false);
      if (dos.success) return;
      expect(dos.error).toBe("slot_taken");
    }, 50_000);

    it("D8 · el mismo horario para otro profesional si", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ staff_id: LUCIN, notes: `${TAG} d8a` }), SHOP_ID);
      const { data: a } = await db().from("appointments").select("id").like("notes", `${TAG} d8a`);
      registrarTurno(a![0].id);
      const dos = await createAppointment(formTurno({ staff_id: MEFIS, notes: `${TAG} d8b` }), SHOP_ID);
      expect(dos.success, dos.success ? "" : JSON.stringify(dos)).toBe(true);
      const { data: b } = await db().from("appointments").select("id").like("notes", `${TAG} d8b`);
      registrarTurno(b![0].id);
    }, 50_000);

    it("D9 · recurrente semanal: crea la serie entera con el mismo grupo", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      const hasta = sumarDias(miercoles, 21);
      const res = await createAppointment(
        formTurno({ notes: `${TAG} d9`, recurring_frequency: "weekly", recurring_until: hasta }),
        SHOP_ID,
      );
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      const filas = await turnosCreados();
      // 4 semanas: 0, 7, 14 y 21 dias.
      expect(filas).toHaveLength(4);
      for (const f of filas) registrarTurno(f.id as string);
      const grupos = new Set(filas.map((f) => f.recurring_group_id));
      expect(grupos.size, "todas comparten un solo grupo").toBe(1);
    }, 50_000);

    it("D10 · recurrente multiple con mas de un servicio: rechazado", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      const res = await createAppointment(
        formTurno({
          notes: `${TAG} d10`,
          service_ids: `${servicio},${servicioCorto}`,
          recurring_frequency: "weekly",
          recurring_until: sumarDias(miercoles, 14),
        }),
        SHOP_ID,
      );
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe("No se puede repetir un turno con múltiples servicios");
    }, 40_000);

    it("D11 · recurrente sin 'hasta' se corta a las 12 semanas", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      const res = await createAppointment(
        formTurno({ notes: `${TAG} d11`, recurring_frequency: "weekly" }),
        SHOP_ID,
      );
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      const filas = await turnosCreados();
      for (const f of filas) registrarTurno(f.id as string);
      const primera = hhmmEnArt((filas[0].start_time as string));
      const ultima = filas.at(-1)!;
      const dias = Math.round(
        (new Date(ultima.start_time).getTime() - new Date(filas[0].start_time).getTime()) / 86400000,
      );
      expect(primera).toBe("10:00");
      // El default son 84 dias: 13 ocurrencias (0..84 en pasos de 7).
      expect(dias).toBe(84);
      expect(filas).toHaveLength(13);
    }, 50_000);

    it("D12 · transiciones de estado: la matriz completa", async () => {
      const { createAppointment, updateAppointmentStatus } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ notes: `${TAG} d12` }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id,status").like("notes", `${TAG} d12`);
      const id = filas![0].id;
      registrarTurno(id);
      expect(filas![0].status).toBe("confirmed");

      // confirmed -> completed (sin isPaid explicito => queda pagado)
      const b = await updateAppointmentStatus(id, "completed", undefined, SHOP_ID);
      expect(b.success).toBe(true);
      let row = await turnosDe(id);
      expect(row.status).toBe("completed");
      expect(row.is_paid).toBe(true);
      expect(Number(row.amount_paid)).toBe(20000);
      // completed -> cancelled
      expect((await updateAppointmentStatus(id, "cancelled", undefined, SHOP_ID)).success).toBe(true);
      // cancelled -> confirmed
      expect((await updateAppointmentStatus(id, "confirmed", undefined, SHOP_ID)).success).toBe(true);
      row = await turnosDe(id);
      expect(row.status).toBe("confirmed");
    }, 60_000);

    it("D13 · transiciones invalidas se rechazan con el motivo", async () => {
      const { updateAppointmentStatus } = await import("@/lib/dashboard/appointments/mutations");

      // Un turno de verdad en pending_payment: la tabla de transiciones es
      //   confirmed        -> completed | cancelled
      //   pending_payment  -> confirmed | cancelled
      //   completed        -> cancelled | confirmed
      //   cancelled        -> confirmed
      const pendiente = await crearTurnoLab({
        staffId: LUCIN,
        serviceId: servicio,
        servicePrice: 20000,
        fecha: miercoles,
        desde: "10:00",
        hasta: "10:30",
        status: "pending_payment",
        isPaid: false,
      });
      registrarTurno(pendiente);

      // pending_payment -> completed no existe
      const r = await updateAppointmentStatus(pendiente, "completed", undefined, SHOP_ID);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error).toBe('No se puede pasar de "pending_payment" a "completed"');
      }
      // OJO: pedir el MISMO estado pasa, porque el guard es
      // `if (currentStatus !== status && !canTransitionStatus(...))`. Es
      // idempotente a proposito: el panel puede re-confirmar sin romper.
      const r1b = await updateAppointmentStatus(pendiente, "pending_payment", undefined, SHOP_ID);
      expect(r1b.success).toBe(true);
      expect((await turnosDe(pendiente)).status).toBe("pending_payment");

      // cancelled -> completed tampoco existe.
      const cancelado = await crearTurnoLab({
        staffId: LUCIN,
        serviceId: servicio,
        servicePrice: 20000,
        fecha: miercoles,
        desde: "11:00",
        hasta: "11:30",
        status: "cancelled",
      });
      registrarTurno(cancelado);
      const r1c = await updateAppointmentStatus(cancelado, "completed", undefined, SHOP_ID);
      expect(r1c.success).toBe(false);
      if (!r1c.success) {
        expect(r1c.error).toBe('No se puede pasar de "cancelled" a "completed"');
      }

      // Un estado que no existe
      const r2 = await updateAppointmentStatus(pendiente, "volado", undefined, SHOP_ID);
      expect(r2.success).toBe(false);
      if (!r2.success) expect(r2.error).toBe("Estado de turno inválido");
      // Un id que no existe
      const r3 = await updateAppointmentStatus("00000000-0000-0000-0000-000000000000", "confirmed", undefined, SHOP_ID);
      expect(r3.success).toBe(false);
      if (!r3.success) expect(r3.error).toBe("Turno no encontrado");
    }, 60_000);

    it("D14 · marcar pagado desempaga el descuento de fidelizacion", async () => {
      const { createAppointment, updateAppointmentStatus } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ notes: `${TAG} d14` }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id").like("notes", `${TAG} d14`);
      const id = filas![0].id;
      registrarTurno(id);
      await db()
        .from("appointments")
        .update({ loyalty_discount_percent_applied: 20, loyalty_reward_applied: true })
        .eq("id", id);
      await updateAppointmentStatus(id, "completed", true, SHOP_ID);
      const row = await turnosDe(id);
      // 20000 con 20% de descuento = 16000, no 20000.
      expect(Number(row.amount_paid)).toBe(16000);
    }, 50_000);

    it("D15 · una seña cuenta solo la seña, no el precio de lista", async () => {
      const { createAppointment, updateAppointmentStatus } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ notes: `${TAG} d15`, deposit_amount: "5000" }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id,deposit_amount").like("notes", `${TAG} d15`);
      const id = filas![0].id;
      registrarTurno(id);
      const res = await updateAppointmentStatus(id, "confirmed", undefined, SHOP_ID, 5000);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      const row = await turnosDe(id);
      // Una seña de 5000 sobre un servicio de 20000 tiene que contar 5000. Antes
      // contaba 20000 porque se pasaba `settled: depositAmount > 0`, y el export
      // de produccion por profesional (que filtra solo por `is_paid`, sin
      // `status=completed`) reportaba el precio entero como cobrado.
      expect(row.is_paid).toBe(true);
      expect(Number(row.amount_paid)).toBe(5000);
      expect(Number(row.deposit_amount)).toBe(5000);

      // Al marcar el turno como terminado entra el total: la seña MAS el saldo
      // del mostrador.
      const fin = await updateAppointmentStatus(id, "completed", undefined, SHOP_ID);
      expect(fin.success).toBe(true);
      const saldado = await turnosDe(id);
      expect(saldado.status).toBe("completed");
      expect(Number(saldado.amount_paid)).toBe(20000);

      // Si el turno ya estaba terminado, cargar la seña sigue dejando el total.
      const b = await crearTurnoLab({
        staffId: LUCIN,
        serviceId: servicio,
        servicePrice: 20000,
        fecha: miercoles,
        desde: "12:00",
        hasta: "12:30",
        status: "completed",
        isPaid: true,
      });
      registrarTurno(b);
      const r2 = await updateAppointmentStatus(b, "completed", undefined, SHOP_ID, 5000);
      expect(r2.success).toBe(true);
      expect(Number((await turnosDe(b)).amount_paid)).toBe(20000);

      // Desmarcar el pagado deja solo lo que se cobro por adelantado.
      const r3 = await updateAppointmentStatus(id, "completed", false, SHOP_ID);
      expect(r3.success).toBe(true);
      expect((await turnosDe(id)).is_paid).toBe(false);
      expect(Number((await turnosDe(id)).amount_paid)).toBe(5000);
    }, 50_000);

    it("D16 · una seña no numerica se rechaza", async () => {
      const { createAppointment, updateAppointmentStatus } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ notes: `${TAG} d16` }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id").like("notes", `${TAG} d16`);
      const id = filas![0].id;
      registrarTurno(id);
      const res = await updateAppointmentStatus(id, "confirmed", undefined, SHOP_ID, NaN);
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toBe("La seña debe ser un monto válido");
    }, 50_000);

    it("D17 · reprogramar recalcula el fin segun la duracion del servicio", async () => {
      const { createAppointment, patchAppointmentQuick } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ notes: `${TAG} d17` }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id").like("notes", `${TAG} d17`);
      const id = filas![0].id;
      registrarTurno(id);

      // Cambiar a las 15:00.
      const res = await patchAppointmentQuick(id, { startTime: artTimestamp(miercoles, "15:00") }, SHOP_ID);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      let row = await turnosDe(id);
      expect(hhmmEnArt(row.start_time as string)).toBe("15:00");
      expect(hhmmEnArt(row.end_time as string)).toBe("15:30");

      // Cambiar de servicio: 30 -> 15 minutos, y se reprecia.
      const res2 = await patchAppointmentQuick(id, { serviceId: servicioCorto }, SHOP_ID);
      expect(res2.success, res2.success ? "" : JSON.stringify(res2)).toBe(true);
      row = await turnosDe(id);
      expect(hhmmEnArt(row.end_time as string)).toBe("15:15");
      expect(Number(row.service_price)).toBe(10000);
      expect(row.service_id).toBe(servicioCorto);
    }, 50_000);

    it("D18 · reprogramar encima de otro turno: slot_taken", async () => {
      const { createAppointment, patchAppointmentQuick } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ notes: `${TAG} d18a`, start_time: "10:00" }), SHOP_ID);
      await createAppointment(formTurno({ notes: `${TAG} d18b`, start_time: "14:00" }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id,start_time").like("notes", `${TAG} d18%`);
      for (const f of filas!) registrarTurno(f.id);
      const primero = filas!.find((f) => hhmmEnArt(f.start_time) === "10:00")!;
      const res = await patchAppointmentQuick(primero.id, { startTime: artTimestamp(miercoles, "14:00") }, SHOP_ID);
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toBe("slot_taken");
    }, 50_000);

    it("D19 · fecha/hora invalida en el parche", async () => {
      const { createAppointment, patchAppointmentQuick } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ notes: `${TAG} d19` }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id").like("notes", `${TAG} d19`);
      registrarTurno(filas![0].id);
      const res = await patchAppointmentQuick(filas![0].id, { startTime: "no-es-fecha" }, SHOP_ID);
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toBe("Fecha/hora invalida");
    }, 50_000);

    it("D20 · reasignar de profesional a uno ocupado: slot_taken", async () => {
      const { createAppointment, updateAppointmentStaff } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ staff_id: LUCIN, notes: `${TAG} d20a` }), SHOP_ID);
      await createAppointment(formTurno({ staff_id: MEFIS, notes: `${TAG} d20b` }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id,staff_id").like("notes", `${TAG} d20%`);
      for (const f of filas!) registrarTurno(f.id);
      const deLucin = filas!.find((f) => f.staff_id === LUCIN)!;

      const res = await updateAppointmentStaff(deLucin.id, MEFIS, SHOP_ID);
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toBe("slot_taken");

      // A uno libre si funciona.
      const ok = await updateAppointmentStaff(deLucin.id, PABLE, SHOP_ID);
      expect(ok.success, ok.success ? "" : JSON.stringify(ok)).toBe(true);
      expect((await turnosDe(deLucin.id)).staff_id).toBe(PABLE);
    }, 60_000);

    it("D21 · reasignar a vacio deja el turno en la cola manual", async () => {
      const { createAppointment, updateAppointmentStaff } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ notes: `${TAG} d21` }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id").like("notes", `${TAG} d21`);
      registrarTurno(filas![0].id);
      const res = await updateAppointmentStaff(filas![0].id, "   ", SHOP_ID);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      expect((await turnosDe(filas![0].id)).staff_id).toBeNull();
    }, 50_000);

    it("D22 · cambiar los servicios del turno borra y re-crea las filas", async () => {
      const { createAppointment, updateAppointmentServices } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ notes: `${TAG} d22` }), SHOP_ID);
      const { data: antes } = await db().from("appointments").select("id,service_id").like("notes", `${TAG} d22`);
      registrarTurno(antes![0].id);

      const res = await updateAppointmentServices(
        antes![0].id,
        {
          serviceSelections: [
            { serviceId: servicio, durationMinutes: 30 },
            { serviceId: servicioCorto, durationMinutes: 15 },
          ],
          startTime: artTimestamp(miercoles, "10:00"),
          staffId: LUCIN,
        },
        SHOP_ID,
      );
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      const { data: despues } = await db()
        .from("appointments")
        .select("*")
        .eq("shop_id", SHOP_ID)
        .like("notes", `${TAG} d22`)
        .order("start_time");
      expect(despues).toHaveLength(2);
      for (const f of despues!) registrarTurno(f.id);
      expect(hhmmEnArt(despues![0].start_time)).toBe("10:00");
      expect(hhmmEnArt(despues![1].end_time)).toBe("10:45");
    }, 50_000);

    it("D23 · cambiar servicios a uno que el profesional no hace: rechazado", async () => {
      const { createAppointment, updateAppointmentServices } = await import("@/lib/dashboard/appointments/mutations");
      const otro = await crearServicioLab({ name: "no-para-panel", price: 1000, duration: 30 });

      // OJO: `otro` NO se agrega a `staff_services`, asi que LUCIN no lo hace.
      await createAppointment(formTurno({ staff_id: LUCIN, notes: `${TAG} d23` }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id").like("notes", `${TAG} d23`);
      registrarTurno(filas![0].id);
      const res = await updateAppointmentServices(
        filas![0].id,
        { serviceSelections: [{ serviceId: otro, durationMinutes: 30 }], startTime: artTimestamp(miercoles, "10:00"), staffId: LUCIN },
        SHOP_ID,
      );
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("El profesional no realiza uno o más servicios seleccionados");
      }
    }, 50_000);

    it("D24 · borrar un turno lo elimina de verdad", async () => {
      const { createAppointment, deleteAppointment } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ notes: `${TAG} d24` }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id").like("notes", `${TAG} d24`);
      const id = filas![0].id;
      expect((await deleteAppointment(id, SHOP_ID)).success).toBe(true);
      const { data: queda } = await db().from("appointments").select("id").eq("id", id);
      expect(queda).toEqual([]);
    }, 50_000);

    it("D25 · cancelar una serie deja el resto intacto", async () => {
      const { createAppointment, cancelRecurringSeries } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(
        formTurno({ notes: `${TAG} d25`, recurring_frequency: "weekly", recurring_until: sumarDias(miercoles, 14) }),
        SHOP_ID,
      );
      const filas = await turnosCreados();
      expect(filas).toHaveLength(3);
      for (const f of filas) registrarTurno(f.id as string);
      const grupo = filas[0].recurring_group_id as string;

      const res = await cancelRecurringSeries(grupo, SHOP_ID);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      const { data: despues } = await db()
        .from("appointments")
        .select("id,status")
        .in("id", filas.map((f) => f.id as string));
      for (const f of despues!) expect(f.status).toBe("cancelled");

      // Un grupo que no existe: el id va crudo a la columna uuid y Postgres lo
      // rechaza con su mensaje en crudo, que se escapa al cliente.
      const r2 = await cancelRecurringSeries("no-existe", SHOP_ID);
      expect(r2.success).toBe(false);
      if (!r2.success) {
        expect(r2.error).toContain("invalid input syntax for type uuid");
      }
    }, 50_000);

    it("D26 · mover arrastra la cadena del mismo dia del mismo cliente", async () => {
      const { createAppointment, moveAppointmentGroup } = await import("@/lib/dashboard/appointments/mutations");
      // Dos servicios del mismo cliente, el mismo dia, pegados: eso es una
      // "cadena" para el arrastre. (La serie semanal NO lo es: el arrastre solo
      // mira el mismo `date_key_ar` con un hueco de hasta 2 minutos.)
      await createAppointment(
        formTurno({ notes: `${TAG} d26`, service_ids: `${servicio},${servicioCorto}` }),
        SHOP_ID,
      );
      const filas = await turnosCreados();
      expect(filas).toHaveLength(2);
      for (const f of filas) registrarTurno(f.id as string);

      const nuevo = artTimestamp(miercoles, "16:00");
      const res = await moveAppointmentGroup(filas[0].id as string, nuevo, SHOP_ID);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      if (!res.success) return;
      expect((res.data as { updatedIds: string[] }).updatedIds).toHaveLength(2);

      const { data: movidos } = await db()
        .from("appointments")
        .select("start_time,end_time")
        .in("id", (res.data as { updatedIds: string[] }).updatedIds)
        .order("start_time");
      expect(hhmmEnArt(movidos![0].start_time)).toBe("16:00");
      expect(hhmmEnArt(movidos![0].end_time)).toBe("16:30");
      // La segunda sigue pegada a la primera.
      expect(movidos![1].start_time).toBe(movidos![0].end_time);
    }, 60_000);

    it("D27 · mover encima de otro turno del mismo profesional: slot_taken", async () => {
      const { createAppointment, moveAppointmentGroup } = await import("@/lib/dashboard/appointments/mutations");
      await createAppointment(formTurno({ notes: `${TAG} d27a`, start_time: "10:00" }), SHOP_ID);
      await createAppointment(
        formTurno({ notes: `${TAG} d27b`, service_ids: `${servicio},${servicioCorto}`, start_time: "14:00" }),
        SHOP_ID,
      );
      const todas = await turnosCreados();
      for (const f of todas) registrarTurno(f.id as string);
      expect(todas).toHaveLength(3);

      // El turno de las 14:00 (con su hermano pegado a las 14:30) encima del de
      // las 10:00. Se toma el que ARRANCA a las 14:00: el hermano arranca 14:30.
      const aLasDiez = todas.filter((f) => hhmmEnArt(f.start_time as string) === "10:00");
      const aLasDos = todas.filter((f) => hhmmEnArt(f.start_time as string) === "14:00");
      expect(aLasDiez).toHaveLength(1);
      expect(aLasDos).toHaveLength(1);

      const res = await moveAppointmentGroup(aLasDos[0].id as string, artTimestamp(miercoles, "10:00"), SHOP_ID);
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toBe("slot_taken");
    }, 60_000);

    it("D28 · HALLAZGO: el panel deja reservar fuera del horario de atencion y en dias cerrados", async () => {
      const { createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      // Klip abre 09-20 y el lunes esta cerrado.
      const antesDelApertura = await createAppointment(formTurno({ notes: `${TAG} d28a`, start_time: "03:00" }), SHOP_ID);
      expect(antesDelApertura.success, "no valida contra el horario del local").toBe(true);
      const { data: a } = await db().from("appointments").select("id").like("notes", `${TAG} d28a`);
      registrarTurno(a![0].id);

      const lunes = proximoDiaDeSemana(1);
      const cerrado = await createAppointment(
        formTurno({ notes: `${TAG} d28b`, start_date: lunes }),
        SHOP_ID,
      );
      expect(cerrado.success, "no valida contra el dia cerrado").toBe(true);
      const { data: b } = await db().from("appointments").select("id").like("notes", `${TAG} d28b`);
      registrarTurno(b![0].id);
      console.log("  [D28] el panel agenda fuera de horario y en dias cerrados (a proposito)");
    }, 50_000);

    it("D29 · autocompletar: los turnos pasados confirmados quedan pagados", async () => {
      const { autoCompletePastAppointments } = await import("@/lib/dashboard/appointments/mutations");
      const ayer = sumarDias(artDate(), -3);
      const id = await crearTurnoLab({
        staffId: LUCIN,
        serviceId: servicio,
        servicePrice: 20000,
        fecha: ayer,
        desde: "10:00",
        hasta: "10:30",
        status: "confirmed",
        isPaid: false,
      });
      const { data: countAntes } = await db()
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", SHOP_ID);
      const filasAntes = countAntes!;

      const res = await autoCompletePastAppointments(SHOP_ID);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      if (!res.success) return;
      const row = await turnosDe(id);
      expect(row.status).toBe("completed");
      expect(row.is_paid).toBe(true);
      expect(row.auto_completed).toBe(true);
      expect(Number(row.amount_paid)).toBe(20000);

      // No toco nada mas: la cuenta de filas del local quedo igual (no borro).
      const { data: countDespues } = await db()
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", SHOP_ID);
      expect(countDespues).toBe(filasAntes);
    }, 90_000);

    it("D30 · autocompletar un pendiente de pago cobra solo la seña, no el precio de lista", async () => {
      const { autoCompletePastAppointments } = await import("@/lib/dashboard/appointments/mutations");
      const ayer = sumarDias(artDate(), -3);
      const id = await crearTurnoLab({
        staffId: LUCIN,
        serviceId: servicio,
        servicePrice: 20000,
        fecha: ayer,
        desde: "14:00",
        hasta: "14:30",
        status: "pending_payment",
        isPaid: false,
      });
      await db().from("appointments").update({ deposit_amount: 7000 }).eq("id", id);

      const res = await autoCompletePastAppointments(SHOP_ID);
      expect(res.success).toBe(true);
      const row = await turnosDe(id);
      expect(row.status).toBe("completed");
      expect(row.was_pending_payment).toBe(true);
      expect(Number(row.amount_paid), "cobra la seña, no los 20000 de lista").toBe(7000);
    }, 90_000);

    it("D31 · autocompletar apagado no toca nada", async () => {
      await db().from("shops").update({ auto_complete_enabled: false }).eq("id", SHOP_ID);
      const { autoCompletePastAppointments } = await import("@/lib/dashboard/appointments/mutations");
      const ayer = sumarDias(artDate(), -3);
      const id = await crearTurnoLab({
        staffId: LUCIN,
        fecha: ayer,
        desde: "16:00",
        hasta: "16:30",
        status: "confirmed",
      });
      const res = await autoCompletePastAppointments(SHOP_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect((res.data as { completed: number }).completed).toBe(0);
      }
      expect((await turnosDe(id)).status).toBe("confirmed");
    }, 60_000);
  });

  // ================================================================= E
  describe("E · ajustes del local", () => {
    it("E1 · guardar horarios valida que el cierre sea posterior a la apertura", async () => {
      const { updateBusinessHours } = await import("@/lib/dashboard/shop/business-actions");
      const base = await leerHorarios();
      const res = await updateBusinessHours({
        ...base,
        wednesday: { open: true, start: "20:00", end: "09:00" },
      } as never);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("La hora de cierre debe ser posterior a la apertura (wednesday)");
      }
    }, 40_000);

    it("E2 · el descanso tiene que estar entre apertura y cierre", async () => {
      const { updateBusinessHours } = await import("@/lib/dashboard/shop/business-actions");
      const base = await leerHorarios();
      const res = await updateBusinessHours({
        ...base,
        wednesday: { open: true, start: "09:00", end: "18:00", break_start: "19:00", break_end: "20:00" },
      } as never);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("El corte horario debe quedar entre apertura y cierre (wednesday)");
      }
    }, 40_000);

    it("E3 · un descanso a medio camino se guarda y lo lee el motor de slots", async () => {
      const { updateBusinessHours } = await import("@/lib/dashboard/shop/business-actions");
      const base = await leerHorarios();
      const res = await updateBusinessHours({
        ...base,
        wednesday: { open: true, start: "10:00", end: "16:00", break_start: "12:00", break_end: "13:00" },
      } as never);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);

      const { fetchPublicAvailableSlots } = await import("@/lib/dashboard/booking/public-booking-actions");
      const { cablearAuth: cablear, OWNER_ID: owner } = await import("./klip-lab");
      await cablear(owner, "owner");
      const slots = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
      expect(slots.success).toBe(true);
      if (!slots.success) return;
      const horas = slots.data.map((s) => hhmmEnArt(s.start));
      expect(horas[0]).toBe("10:00");
      expect(horas).not.toContain("12:00");
      expect(horas).not.toContain("12:30");
      expect(horas).toContain("13:00");
      expect(horas.at(-1)).toBe("15:30");
    }, 60_000);

    it("E4 · un solo corte a medias se rechaza", async () => {
      const { updateBusinessHours } = await import("@/lib/dashboard/shop/business-actions");
      const base = await leerHorarios();
      const res = await updateBusinessHours({
        ...base,
        wednesday: { open: true, start: "09:00", end: "20:00", break_start: "13:00", break_end: "" },
      } as never);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toContain("corte horario");
      }
    }, 40_000);

    it("E5 · holiday: se crea, aparece en la lista y se borra", async () => {
      const { upsertShopDateOverride, fetchShopDateOverrides, deleteShopDateOverride } = await import(
        "@/lib/dashboard/shop/business-actions"
      );
      const dia = sumarDias(miercoles, 30);
      const res = await upsertShopDateOverride(dia, null, true, undefined, undefined, `${TAG} feriado de prueba`);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);

      const lista = await fetchShopDateOverrides(SHOP_ID, dia, dia);
      expect(lista.success).toBe(true);
      if (!lista.success) return;
      expect(lista.data).toHaveLength(1);
      const row = lista.data[0] as Record<string, unknown>;
      expect(row.is_closed).toBe(true);
      expect(row.reason).toBe(`${TAG} feriado de prueba`);

      // Y el motor de slots lo ve.
      const { fetchPublicAvailableSlots } = await import("@/lib/dashboard/booking/public-booking-actions");
      const slots = await fetchPublicAvailableSlots(SHOP_ID, 30, dia);
      expect(slots.success).toBe(true);
      if (!slots.success) return;
      expect(slots.data).toEqual([]);

      expect((await deleteShopDateOverride(row.id as string)).success).toBe(true);
      const lista2 = await fetchShopDateOverrides(SHOP_ID, dia, dia);
      expect(lista2.success && lista2.data).toHaveLength(0);
    }, 60_000);

    it("E6 · el holiday de un profesional: se puede upsert dos veces sin duplicar", async () => {
      const { upsertShopDateOverride, fetchShopDateOverrides } = await import("@/lib/dashboard/shop/business-actions");
      const dia = sumarDias(miercoles, 31);
      const a = await upsertShopDateOverride(dia, LUCIN, false, "09:00", "13:00", `${TAG} primera`);
      expect(a.success).toBe(true);
      const b = await upsertShopDateOverride(dia, LUCIN, false, "14:00", "18:00", `${TAG} segunda`);
      expect(b.success, b.success ? "" : JSON.stringify(b)).toBe(true);

      const lista = await fetchShopDateOverrides(SHOP_ID, dia, dia);
      expect(lista.success).toBe(true);
      if (!lista.success) return;
      // El indice unico parcial obliga a una sola fila por (local, profesional, dia).
      expect(lista.data).toHaveLength(1);
      expect((lista.data[0] as Record<string, unknown>).reason).toBe(`${TAG} segunda`);
    }, 50_000);

    it("E7 · HALLAZGO: un horario de holiday al reves se guarda igual", async () => {
      const { upsertShopDateOverride, fetchShopDateOverrides } = await import("@/lib/dashboard/shop/business-actions");
      const dia = sumarDias(miercoles, 32);
      // 18:00 -> 10:00 es una ventana invertida. La accion valida el CORTE
      // (break_start/break_end), pero no valida que la ventana del dia tenga
      // apertura antes que cierre. Se guarda.
      const res = await upsertShopDateOverride(
        dia,
        null,
        false,
        "18:00",
        "10:00",
        `${TAG} invertido`,
      );
      console.log(`  [E7] holiday con ventana invertida -> ${res.success ? "ACEPTADO (bug)" : res.error}`);
      expect(res.success, "BUG CONOCIDO: no valida apertura < cierre").toBe(true);

      // No rompe nada: el motor de slots lo trata como dia sin horarios.
      const { fetchPublicAvailableSlots } = await import("@/lib/dashboard/booking/public-booking-actions");
      const { cablearAuth: cablear, OWNER_ID: owner } = await import("./klip-lab");
      await cablear(owner, "owner");
      const slots = await fetchPublicAvailableSlots(SHOP_ID, 30, dia);
      expect(slots.success).toBe(true);
      if (!slots.success) return;
      expect(slots.data, "un dia con ventana invertida simply no ofrece nada").toEqual([]);

      const lista = await fetchShopDateOverrides(SHOP_ID, dia, dia);
      expect(lista.success && lista.data).toHaveLength(1);
    }, 60_000);

    it("E8 · la politica de seña: guarda, y el toggle de assign_staff_later", async () => {
      const { updateBookingDepositPolicyAction, updateAssignStaffLater } = await import(
        "@/lib/dashboard/shop/business-actions"
      );
      const original = local();

      const a = await updateBookingDepositPolicyAction(true, 5000, false);
      expect(a.success, a.success ? "" : JSON.stringify(a)).toBe(true);
      let fila = await leerShop();
      expect(fila.booking_deposit_enabled).toBe(true);
      expect(Number(fila.booking_deposit_amount)).toBe(5000);
      expect(fila.pay_at_shop, "el 3er argumento fuerza pay_at_shop").toBe(false);

      // Sin el 3er argumento no toca pay_at_shop.
      await updateBookingDepositPolicyAction(false, 0);
      fila = await leerShop();
      expect(fila.pay_at_shop, "sin forcePayAtShop el pay_at_shop no se mueve").toBe(false);
      expect(fila.booking_deposit_enabled).toBe(false);

      const b = await updateAssignStaffLater(true);
      expect(b.success).toBe(true);
      expect((await leerShop()).assign_staff_later).toBe(true);

      // Se restaura.
      await restaurarLocal();
      expect((await leerShop()).pay_at_shop).toBe(original.pay_at_shop);
      expect((await leerShop()).assign_staff_later).toBe(original.assign_staff_later);
    }, 50_000);

    it("E9 · la transferencia bancaria se activa con CBU y alias", async () => {
      const { updateBankTransferSettings } = await import("@/lib/dashboard/shop/business-actions");
      const res = await updateBankTransferSettings(
        true,
        "0000000000000000000000",
        "klip.probar",
        "Banco de prueba",
      );
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);
      const fila = await leerShop();
      expect(fila.bank_transfer_enabled).toBe(true);
      expect(fila.bank_alias).toBe("klip.probar");
      expect(fila.bank_cvu_cbu).toBe("0000000000000000000000");
    }, 40_000);

    it("E10 · un staff (no owner) no puede cambiar los horarios del local", async () => {
      const { cablearAuth: cablear } = await import("./klip-lab");
      const { updateBusinessHours } = await import("@/lib/dashboard/shop/business-actions");
      const base = await leerHorarios();
      await cablear(LUCIN, "staff");
      const res = await updateBusinessHours({
        ...base,
        wednesday: { open: false, start: "09:00", end: "20:00" },
      } as never);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("Solo el owner del local puede realizar esta accion");
      }
      // El horario no se toco.
      expect((await leerHorarios()).wednesday.open).toBe(true);
    }, 40_000);

    it("E11 · cambiar el horario del local mueve la disponibilidad en vivo", async () => {
      const { fetchPublicAvailableSlots } = await import("@/lib/dashboard/booking/public-booking-actions");
      const { cablearAuth: cablear, OWNER_ID: owner } = await import("./klip-lab");
      await cablear(owner, "owner");
      const antes = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
      expect(antes.success).toBe(true);
      if (!antes.success) return;
      expect(antes.data[0] ? hhmmEnArt(antes.data[0].start) : "").toBe("09:00");

      await ponerHorario("wednesday", {
        open: true,
        start: "15:00",
        end: "19:00",
        break_start: null,
        break_end: null,
      });
      const despues = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
      expect(despues.success).toBe(true);
      if (!despues.success) return;
      const horas = despues.data.map((s) => hhmmEnArt(s.start));
      expect(horas[0]).toBe("15:00");
      expect(horas.at(-1)).toBe("18:30");
    }, 50_000);
  });

  // ================================================================= F
  describe("F · aislamiento entre locales", () => {
    it("F1 · un owner de otro local no puede tocar los turnos de klip", async () => {
      const { crearIntruso, borrarIntruso } = await import("./klip-lab");
      const { patchAppointmentQuick, createAppointment } = await import("@/lib/dashboard/appointments/mutations");
      const intruso = await crearIntruso();
      try {
        await cablearAuth(OWNER_ID, "owner");
        await createAppointment(formTurno({ notes: `${TAG} f1` }), SHOP_ID);
        const { data: filas } = await db().from("appointments").select("id").like("notes", `${TAG} f1`);
        registrarTurno(filas![0].id);

        await cablearAuth(intruso.userId, "owner");
        const res = await patchAppointmentQuick(filas![0].id, { status: "cancelled" }, SHOP_ID);
        expect(res.success).toBe(false);
        if (!res.success) expect(res.error).toBe("SIN_ACCESO_LOCAL");

        // El turno sigue como estaba.
        expect((await turnosDe(filas![0].id)).status).toBe("confirmed");
      } finally {
        await borrarIntruso(intruso);
      }
    }, 60_000);

    it("F2 · sin sesion, todas las acciones del panel se rechazan", async () => {
      const { createAppointment, patchAppointmentQuick, autoCompletePastAppointments } = await import(
        "@/lib/dashboard/appointments/mutations"
      );
      const { desconectarAuth } = await import("./klip-lab");
      await cablearAuth(OWNER_ID, "owner");
      await createAppointment(formTurno({ notes: `${TAG} f2` }), SHOP_ID);
      const { data: filas } = await db().from("appointments").select("id").like("notes", `${TAG} f2`);
      registrarTurno(filas![0].id);

      await desconectarAuth();
      expect((await createAppointment(formTurno(), SHOP_ID)).error).toBe("SESION_EXPIRADA");
      expect((await patchAppointmentQuick(filas![0].id, { status: "cancelled" }, SHOP_ID)).error).toBe(
        "SESION_EXPIRADA",
      );

      // `autoCompletePastAppointments` escribe con el cliente admin (service role),
      // asi que valida sesion y pertenencia al local antes de tocar nada. Sin
      // sesion tampoco puede.
      const sinSesion = await autoCompletePastAppointments(SHOP_ID);
      expect(sinSesion.success).toBe(false);
      if (!sinSesion.success) expect(sinSesion.error).toBe("SESION_EXPIRADA");

      // Con un owner de otro local tampoco: ni leer lo puede.
      const { crearIntruso, borrarIntruso } = await import("./klip-lab");
      const intruso = await crearIntruso();
      try {
        await cablearAuth(intruso.userId, "owner");
        const conIntruso = await autoCompletePastAppointments(SHOP_ID);
        expect(conIntruso.success).toBe(false);
        if (!conIntruso.success) expect(conIntruso.error).toBe("SIN_ACCESO_LOCAL");
      } finally {
        await borrarIntruso(intruso);
      }

      // Con el owner legitimo si corre.
      await cablearAuth(OWNER_ID, "owner");
      const auto = await autoCompletePastAppointments(SHOP_ID);
      expect(auto.success, auto.success ? "" : JSON.stringify(auto)).toBe(true);
    }, 60_000);

    it("F3 · la cola de transferencias de klip no la ve un owner ajeno", async () => {
      const { crearIntruso, borrarIntruso } = await import("./klip-lab");
      const { getPendingBankTransfers, confirmBankTransferBooking } = await import(
        "@/lib/dashboard/appointments/pending-booking-actions"
      );
      const intruso = await crearIntruso();
      try {
        const booking = await crearBookingPendiente({ staffId: LUCIN });
        await cablearAuth(intruso.userId, "owner");
        const lista = await getPendingBankTransfers(SHOP_ID);
        expect(lista.success).toBe(false);
        if (!lista.success) expect(lista.error).toBe("SIN_ACCESO_LOCAL");

        const confirma = await confirmBankTransferBooking(booking.id, SHOP_ID);
        expect(confirma.success).toBe(false);
        if (!confirma.success) expect(confirma.error).toBe("SIN_ACCESO_LOCAL");
      } finally {
        await borrarIntruso(intruso);
      }
    }, 60_000);
  });

  // ================================================================= G
  describe("G · pagos sin Mercado Pago", () => {
    it("G1 · aprobar una transferencia crea el turno confirmado Y pagado", async () => {
      const { getPendingBankTransfers, confirmBankTransferBooking } = await import(
        "@/lib/dashboard/appointments/pending-booking-actions"
      );
      await cablearAuth(OWNER_ID, "owner");
      const booking = await crearBookingPendiente({ staffId: LUCIN });

      const cola = await getPendingBankTransfers(SHOP_ID);
      expect(cola.success, cola.success ? "" : JSON.stringify(cola)).toBe(true);
      if (!cola.success) return;
      expect(cola.data).toHaveLength(1);
      expect(cola.data[0].paymentAmount).toBe(20000);
      expect(cola.data[0].serviceName).toContain("panel-30");

      const res = await confirmBankTransferBooking(booking.id, SHOP_ID);
      expect(res.success, res.success ? "" : JSON.stringify(res)).toBe(true);

      const { data: turnos } = await db()
        .from("appointments")
        .select("*")
        .eq("shop_id", SHOP_ID)
        .eq("payment_method", "bank_transfer")
        .like("id", booking.id);
      void turnos;
      const { data: nuevos } = await db()
        .from("appointments")
        .select("*")
        .eq("shop_id", SHOP_ID)
        .eq("staff_id", LUCIN)
        .eq("start_time", artTimestamp(miercoles, "11:00"));
      expect(nuevos).toHaveLength(1);
      registrarTurno(nuevos![0].id);
      expect(nuevos![0].status).toBe("confirmed");
      expect(nuevos![0].is_paid, "una transferencia confirmada es un turno PAGADO").toBe(true);
      expect(Number(nuevos![0].deposit_amount)).toBe(5000);
      expect(nuevos![0].date_key_ar).toBe(miercoles);
    }, 60_000);

    it("G2 · aprobar dos veces la misma transferencia: la segunda dice que ya fue procesada", async () => {
      const { confirmBankTransferBooking } = await import("@/lib/dashboard/appointments/pending-booking-actions");
      await cablearAuth(OWNER_ID, "owner");
      const booking = await crearBookingPendiente({ staffId: LUCIN, desde: "12:00" });
      expect((await confirmBankTransferBooking(booking.id, SHOP_ID)).success).toBe(true);
      const { data: turnos } = await db()
        .from("appointments")
        .select("id")
        .eq("shop_id", SHOP_ID)
        .eq("start_time", artTimestamp(miercoles, "12:00"));
      for (const t of turnos ?? []) registrarTurno(t.id);

      const segundo = await confirmBankTransferBooking(booking.id, SHOP_ID);
      expect(segundo.success).toBe(false);
      if (!segundo.success) expect(segundo.error).toBe("La reserva ya no esta pendiente");
    }, 50_000);

    it("G3 · una transferencia vencida se marca expirada y no crea turno", async () => {
      const { confirmBankTransferBooking } = await import("@/lib/dashboard/appointments/pending-booking-actions");
      await cablearAuth(OWNER_ID, "owner");
      const booking = await crearBookingPendiente({ staffId: LUCIN, desde: "13:00", expiraEnMin: -5 });
      const res = await confirmBankTransferBooking(booking.id, SHOP_ID);
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toBe("La reserva expiro");
      const { data: fila } = await db().from("pending_bookings").select("status").eq("id", booking.id).single();
      expect(fila.status).toBe("expired");
      const { data: turnos } = await db()
        .from("appointments")
        .select("id")
        .eq("shop_id", SHOP_ID)
        .eq("start_time", artTimestamp(miercoles, "13:00"));
      expect(turnos).toEqual([]);
    }, 50_000);

    it("G4 · una transferencia cuyo horario ya se ocupo: 'el turno ya no esta disponible'", async () => {
      const { confirmBankTransferBooking } = await import("@/lib/dashboard/appointments/pending-booking-actions");
      await cablearAuth(OWNER_ID, "owner");
      await crearTurnoLab({ staffId: LUCIN, fecha: miercoles, desde: "15:00", hasta: "15:30", status: "confirmed" });
      const booking = await crearBookingPendiente({ staffId: LUCIN, desde: "15:00" });
      const res = await confirmBankTransferBooking(booking.id, SHOP_ID);
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toBe("El turno ya no esta disponible");
      const { data: fila } = await db().from("pending_bookings").select("status").eq("id", booking.id).single();
      expect(fila.status).toBe("expired");
    }, 50_000);

    it("G5 · rechazar una transferencia la borra sin dejar rastro", async () => {
      const { rejectBankTransferBooking, getPendingBankTransfers } = await import(
        "@/lib/dashboard/appointments/pending-booking-actions"
      );
      await cablearAuth(OWNER_ID, "owner");
      const booking = await crearBookingPendiente({ staffId: LUCIN, desde: "16:00" });
      const res = await rejectBankTransferBooking(booking.id, SHOP_ID);
      expect(res.success).toBe(true);
      const { data: queda } = await db().from("pending_bookings").select("id").eq("id", booking.id);
      expect(queda).toEqual([]);
      const { data: turnos } = await db()
        .from("appointments")
        .select("id")
        .eq("shop_id", SHOP_ID)
        .eq("start_time", artTimestamp(miercoles, "16:00"));
      expect(turnos).toEqual([]);
      const cola = await getPendingBankTransfers(SHOP_ID);
      expect(cola.success && cola.data).toHaveLength(0);
    }, 50_000);

    it("G6 · la cola de transferencias esconde las de MP y las vencidas", async () => {
      const { getPendingBankTransfers } = await import("@/lib/dashboard/appointments/pending-booking-actions");
      await cablearAuth(OWNER_ID, "owner");
      await crearBookingPendiente({ staffId: LUCIN, method: "mp", desde: "17:00" });
      await crearBookingPendiente({ staffId: LUCIN, method: "bank_transfer", expiraEnMin: -1, desde: "17:30" });
      const cola = await getPendingBankTransfers(SHOP_ID);
      expect(cola.success).toBe(true);
      if (!cola.success) return;
      expect(cola.data, "solo las de transferencia bancarias vivas").toHaveLength(0);
    }, 50_000);

    it("G7 · sin MP conectado, la preferencia de pago dice SHOP_MP_NOT_CONNECTED", async () => {
      const { createPaymentPreference } = await import("@/lib/dashboard/booking/public-booking-actions");
      const turnoId = await crearTurnoLab({
        staffId: LUCIN,
        serviceId: servicio,
        fecha: miercoles,
        desde: "09:00",
        hasta: "09:30",
        status: "pending_payment",
      });
      await db().from("shops").update({ mp_access_token: null, mp_public_key: null }).eq("id", SHOP_ID);
      const res = await createPaymentPreference({
        appointmentId: turnoId,
        shopId: SHOP_ID,
        shopSlug: SHOP_SLUG,
      });
      expect(res.success).toBe(false);
      // HALLAZGO: el action NO devuelve el codigo `SHOP_MP_NOT_CONNECTED`
      // aunque es lo que emite por dentro: lo traduce a texto para el
      // cliente. Para el usuario esta bien; para un cliente de API o un
      // test queda imposible branch-ear por codigo.
      if (!res.success) {
        console.log(`  [G7] createPaymentPreference sin MP -> ${res.error}`);
        expect(res.error).not.toBe("SHOP_MP_NOT_CONNECTED");
        expect(res.error).toContain("Mercado Pago");
      }
    }, 50_000);

    it("G8 · un turno inexistente o de otro local no genera preferencia", async () => {
      const { createPaymentPreference } = await import("@/lib/dashboard/booking/public-booking-actions");
      const ajena = await crearTurnoLab({
        staffId: LUCIN,
        fecha: miercoles,
        desde: "09:00",
        hasta: "09:30",
        status: "pending_payment",
      });
      // El turno existe pero en OTRO local.
      const { crearIntruso, borrarIntruso } = await import("./klip-lab");
      const intruso = await crearIntruso();
      try {
        await db().from("appointments").update({ shop_id: intruso.shopId }).eq("id", ajena);
        const res = await createPaymentPreference({
          appointmentId: ajena,
          shopId: SHOP_ID,
          shopSlug: SHOP_SLUG,
        });
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.error).toBe("Turno no encontrado para generar preferencia");
        }
      } finally {
        await borrarIntruso(intruso);
      }
    }, 50_000);

    it("G9 · un servicio de precio 0 no genera preferencia", async () => {
      const { createPaymentPreference } = await import("@/lib/dashboard/booking/public-booking-actions");
      const gratis = await crearServicioLab({ name: "gratis", price: 0, duration: 30 });
      await db().from("staff_services").insert({ staff_id: LUCIN, service_id: gratis });
      const turnoId = await crearTurnoLab({
        staffId: LUCIN,
        serviceId: gratis,
        servicePrice: 0,
        fecha: miercoles,
        desde: "09:00",
        hasta: "09:30",
        status: "pending_payment",
      });
      const res = await createPaymentPreference({
        appointmentId: turnoId,
        shopId: SHOP_ID,
        shopSlug: SHOP_SLUG,
      });
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error).toBe("No hay nada para cobrar");
    }, 50_000);

    it("G10 · la firma del webhook: sin firma, con firma mala y con ts viejo", async () => {
      const { NextRequest } = await import("next/server");
      const { POST } = await import("@/app/api/payments/mercadopago-webhook/route");
      const secret = process.env.MP_WEBHOOK_SECRET!;
      expect(secret, "hace falta MP_WEBHOOK_SECRET para esta prueba").toBeTruthy();
      if (!secret) return;

      const cuerpo = JSON.stringify({ type: "payment", data: { id: "999" } });
      const url = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/payments/mercadopago-webhook?data.id=999&type=payment`;

      // OJO: el route lee `request.nextUrl`, que existe SOLO en `NextRequest`.
      // Con un `Request` web crudo revienta con un TypeError y devuelve 500,
      // lo cual hace creer que la firma falla cuando en realidad el handler
      // ni llego a mirarla.
      const pedir = (body: string, headers: Record<string, string>) =>
        POST(
          new NextRequest(url, {
            method: "POST",
            body,
            headers: { "content-type": "application/json", ...headers },
          }),
        );

      // 1. Sin headers de firma.
      const sinFirma = await pedir(cuerpo, {});
      expect(sinFirma.status).toBe(401);

      // 2. Firma con el secreto equivocado.
      const ts = Math.floor(Date.now() / 1000);
      const crypto = await import("crypto");
      const firmaMala = crypto
        .createHmac("sha256", "secreto-incorrecto")
        .update(`id:999;request-id:req-1;ts:${ts}`)
        .digest("hex");
      const r2 = await pedir(cuerpo, {
        "x-signature": `ts=${ts},v1=${firmaMala}`,
        "x-request-id": "req-1",
      });
      expect(r2.status).toBe(401);

      // 3. Firma correcta pero con el ts de hace una hora (fuera de la ventana).
      const tsViejo = Math.floor(Date.now() / 1000) - 3600;
      const firmaVieja = crypto
        .createHmac("sha256", secret)
        .update(`id:999;request-id:req-1;ts:${tsViejo}`)
        .digest("hex");
      const r3 = await pedir(cuerpo, {
        "x-signature": `ts=${tsViejo},v1=${firmaVieja}`,
        "x-request-id": "req-1",
      });
      expect(r3.status, "el ts vencido invalida la firma").toBe(401);

      // 4. Cuerpo que no es JSON (firma valida: el 400 tiene que venir del parseo).
      const r4 = await pedir("no soy json", {
        "x-signature": `ts=${ts},v1=${crypto.createHmac("sha256", secret).update(`id:999;request-id:req-1;ts:${ts}`).digest("hex")}`,
        "x-request-id": "req-1",
      });
      expect(r4.status).toBe(400);

      // 5. data.id del query != data.id del cuerpo.
      const firmaOk = crypto
        .createHmac("sha256", secret)
        .update(`id:999;request-id:req-1;ts:${ts}`)
        .digest("hex");
      const r5 = await pedir(JSON.stringify({ type: "payment", data: { id: "111" } }), {
        "x-signature": `ts=${ts},v1=${firmaOk}`,
        "x-request-id": "req-1",
      });
      expect(r5.status, "el data.id del cuerpo tiene que coincidir con el firmado").toBe(401);
    }, 60_000);
  });

  async function leerShop() {
    const { data } = await db().from("shops").select("*").eq("id", SHOP_ID).single();
    return data as Record<string, unknown>;
  }
});
