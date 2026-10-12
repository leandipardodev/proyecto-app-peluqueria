/**
 * BLOQUE A + B: la disponibilidad y la reserva publica del local real "klip".
 *
 * Se prueba contra el local de verdad: sus horarios cargados a mano (lunes
 * cerrado, jueves con descanso 13-16, sabado 09-13), sus 5 profesionales, el
 * feriado real del 15/10 y los 590 turnos historicos.
 *
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/turnos-klip.db.test.ts
 */
import { vi } from "vitest";
import {
  DB_TESTS_ON,
  SHOP_ID,
  OWNER2_ID,
  STAFF_INACTIVO_ID,
  TAG,
  db,
  artDate,
  proximoDiaDeSemana,
  artTimestamp,
  hhmmEnArt,
  horasDe,
  limpiar,
  snapshotLocal,
  restaurarLocal,
  liberarLocal,
  crearServicioLab,
  crearTurnoLab,
  crearOverrideLab,
  ponerHorario,
  cargarDisponibilidad,
  ipUnica,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "./klip-lab";

// El reloj de `setup.ts` esta clavado en 2030-06-15. Sin esto, "hoy" seria una
// fecha en la que el local no tiene ni un solo turno y todos los casos de
// colision darÃ­an un falso verde.
vi.unmock("@/lib/argentina-time");

describe.skipIf(!DB_TESTS_ON)("Turnos klip · disponibilidad (A)", () => {
  let martes: string;
  let miercoles: string;
  let jueves: string;
  let sabado: string;
  let lunes: string;
  let domingo: string;
  let feriado: string;
  let servicio30: string;

  beforeAll(async () => {
    await snapshotLocal();
  }, 900_000);

  beforeEach(async () => {
    await limpiar();
    // Cada prueba arranca con los horarios del local como estaban, y con una IP
    // propia para no comerse el limite de 30/min de la consulta de slots.
    await restaurarLocal();
    ipUnica();
  }, 60_000);

  afterAll(async () => {
    await limpiar();
    await restaurarLocal();
    await liberarLocal();
  }, 900_000);

  beforeAll(async () => {
    martes = proximoDiaDeSemana(2);
    miercoles = proximoDiaDeSemana(3);
    jueves = proximoDiaDeSemana(4);
    sabado = proximoDiaDeSemana(6);
    lunes = proximoDiaDeSemana(1);
    domingo = proximoDiaDeSemana(0);
    // El feriado que el local ya tiene cargado ("dia de la raza").
    const { data } = await db()
      .from("shop_date_overrides")
      .select("date")
      .eq("shop_id", SHOP_ID)
      .is("staff_id", null)
      .eq("is_closed", true)
      .limit(1);
    feriado = (data?.[0]?.date as string) ?? "";
  }, 60_000);

  // ------------------------------------------------------------------ A1
  it("A1 · un dia normal abre 09:00 y el ultimo slot arranca 19:30", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const horas = horasDe(res);
    expect(horas[0]).toBe("09:00");
    expect(horas.at(-1)).toBe("19:30");
    // 11 horas con servicio de 30: 22 inicios en grilla de 30.
    expect(res.data).toHaveLength(22);
  }, 30_000);

  // ------------------------------------------------------------------ A2
  it("A2 · el lunes el local esta CERRADO aunque los profesionales trabajen", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, lunes);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual([]);
  }, 30_000);

  // ------------------------------------------------------------------ A3
  it("A3 · el domingo esta cerrado", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, domingo);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual([]);
  }, 30_000);

  // ------------------------------------------------------------------ A4
  it("A4 · el sabado cierra a las 13:00", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, sabado);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const horas = horasDe(res);
    expect(horas[0]).toBe("09:00");
    expect(horas.at(-1)).toBe("12:30");
    expect(res.data).toHaveLength(8);
  }, 30_000);

  // ------------------------------------------------------------------ A5
  it("A5 · el descanso del jueves (13-16) parte la grilla en dos", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, jueves);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const horas = horasDe(res);
    // Antes del descanso, el ultimo que entra es 12:30 (termina 13:00).
    expect(horas).toContain("12:30");
    expect(horas).not.toContain("13:00");
    expect(horas).not.toContain("15:30");
    // El primero despues del descanso arranca 16:00.
    expect(horas).toContain("16:00");
    expect(res.data).toHaveLength(16);
  }, 30_000);

  // ------------------------------------------------------------------ A6
  it("A6 · un servicio de 60 minutos empuja el ultimo inicio a las 19:00", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const res = await fetchPublicAvailableSlots(SHOP_ID, 60, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const horas = horasDe(res);
    expect(horas[0]).toBe("09:00");
    expect(horas.at(-1)).toBe("19:00");
    expect(res.data).toHaveLength(21);
  }, 30_000);

  // ------------------------------------------------------------------ A7
  it("A7 · un servicio de 10 horas NO se rechaza: se recorta a 8", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    // HALLAZGO: el motor no dice "no entra". Clampa la duracion a 480 min y
    // ofrece los slots que entran en 480. O sea que un servicio de 10 horas se
    // vende como si durara 8. Si el servicio real dura mas, el turno se recorta
    // solo y el local pierde plata sin enterarse.
    const res = await fetchPublicAvailableSlots(SHOP_ID, 600, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.length).toBeGreaterThan(0);
    const horas = horasDe(res);
    expect(horas[0]).toBe("09:00");
    // 09:00 + 480 = 17:00, entra. El siguiente inicio posible seria 17:30.
    expect(horas.at(-1)).toBe("12:00");
  }, 30_000);

  // ------------------------------------------------------------------ A8
  it("A8 · el limite de la duracion son 8 horas (480 min)", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const res = await fetchPublicAvailableSlots(SHOP_ID, 480, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const horas = horasDe(res);
    expect(horas[0]).toBe("09:00");
    expect(horas.at(-1)).toBe("12:00");
    // 09:00, 09:30, 10:00, 10:30, 11:00, 11:30 y 12:00: el ultimo termina 20:00.
    expect(res.data).toHaveLength(7);
  }, 30_000);

  // ------------------------------------------------------------------ A9
  it("A9 · una duracion de 0 o negativa se trata como 60 minutos", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const cero = await fetchPublicAvailableSlots(SHOP_ID, 0, miercoles);
    const negativo = await fetchPublicAvailableSlots(SHOP_ID, -90, miercoles);
    expect(cero.success && negativo.success).toBe(true);
    if (!cero.success || !negativo.success) return;
    expect(cero.data).toHaveLength(21); // igual que 60
    expect(negativo.data).toHaveLength(21);
  }, 30_000);

  // ------------------------------------------------------------------ A10
  it("A10 · una duracion debajo de 15 minutos se sube a 15", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const res = await fetchPublicAvailableSlots(SHOP_ID, 5, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const horas = horasDe(res);
    // Con 15 min el ultimo inicio es 19:45, que NO esta en la grilla de 30:
    // los inicios siguen siendo multiples de 30, asi que el ultimo es 19:30.
    expect(horas[0]).toBe("09:00");
    expect(horas.at(-1)).toBe("19:30");
  }, 30_000);

  // ------------------------------------------------------------------ A11
  it("A11 · un turno confirmado le saca el slot a ESE profesional y no a los otros", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    const mefis = "30a88204-ba79-42d1-a02a-54b9ef0d0ad3";
    await crearTurnoLab({ staffId: lucin, fecha: miercoles, desde: "11:00", hasta: "11:30", status: "confirmed" });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;

    const once = res.data.find((s) => hhmmEnArt(s.start) === "11:00");
    expect(once, "el slot de las 11 sigue existiendo por los demas").toBeDefined();
    expect(once!.staffIds).not.toContain(lucin);
    expect(once!.staffIds).toContain(mefis);
    // Los horarios de alrededor no se mueven.
    const antes = res.data.find((s) => hhmmEnArt(s.start) === "10:30");
    const despues = res.data.find((s) => hhmmEnArt(s.start) === "11:30");
    expect(antes?.staffIds).toContain(lucin);
    expect(despues?.staffIds).toContain(lucin);
  }, 30_000);

  // ------------------------------------------------------------------ A12
  it("A12 · un turno CANCELADO no ocupa el slot", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    const mefis = "30a88204-ba79-42d1-a02a-54b9ef0d0ad3";
    await crearTurnoLab({ staffId: lucin, fecha: miercoles, desde: "11:00", hasta: "11:30", status: "cancelled" });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const once = res.data.find((s) => hhmmEnArt(s.start) === "11:00");
    expect(once?.staffIds).toContain(lucin);
    expect(once?.staffIds).toContain(mefis);
  }, 30_000);

  // ------------------------------------------------------------------ A13
  it("A13 · un pago pendiente de hace 20 minutos ya NO bloquea el slot", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    await crearTurnoLab({
      staffId: lucin,
      fecha: miercoles,
      desde: "11:00",
      hasta: "11:30",
      status: "pending_payment",
      creadoHaceMinutos: 20,
    });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const once = res.data.find((s) => hhmmEnArt(s.start) === "11:00");
    expect(once?.staffIds).toContain(lucin);
  }, 30_000);

  // ------------------------------------------------------------------ A14
  it("A14 · un pago pendiente de hace 2 minutos SI bloquea el slot (retencion de 10 min)", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    await crearTurnoLab({
      staffId: lucin,
      fecha: miercoles,
      desde: "11:00",
      hasta: "11:30",
      status: "pending_payment",
      creadoHaceMinutos: 2,
    });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const once = res.data.find((s) => hhmmEnArt(s.start) === "11:00");
    expect(once?.staffIds).not.toContain(lucin);
  }, 30_000);

  // ------------------------------------------------------------------ A15
  it("A15 · un turno COMPLETADO sigue bloqueando el slot (a proposito)", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    await crearTurnoLab({ staffId: lucin, fecha: miercoles, desde: "11:00", hasta: "11:30", status: "completed" });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const once = res.data.find((s) => hhmmEnArt(s.start) === "11:00");
    expect(once?.staffIds).not.toContain(lucin);
  }, 30_000);

  // ------------------------------------------------------------------ A16
  it("A16 · el feriado REAL del local (15/10) cierra el dia entero", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    expect(feriado, "el local tiene un feriado cargado de verdad").not.toBe("");
    if (!feriado) return;

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, feriado);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual([]);
  }, 30_000);

  // ------------------------------------------------------------------ A17
  it("A17 · un feriado con horario reducido recorta el dia", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const dia = proximoDiaDeSemana(2);
    await crearOverrideLab({ fecha: dia, isClosed: false, start: "09:00", end: "12:00", motivo: "feriado medio dia" });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, dia);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const horas = horasDe(res);
    expect(horas[0]).toBe("09:00");
    expect(horas.at(-1)).toBe("11:30");
    expect(res.data).toHaveLength(6);
  }, 30_000);

  // ------------------------------------------------------------------ A18
  it("A18 · un override MAS ANCHO que el horario del local no lo ensancha", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const dia = proximoDiaDeSemana(2);
    // El local abre 09:00-20:00; este override pide 06:00-23:00.
    await crearOverrideLab({ fecha: dia, isClosed: false, start: "06:00", end: "23:00", motivo: "override ancho" });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, dia);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const horas = horasDe(res);
    expect(horas[0]).toBe("09:00");
    expect(horas.at(-1)).toBe("19:30");
  }, 30_000);

  // ------------------------------------------------------------------ A19
  it("A19 · un override con apertura posterior al cierre no ofrece nada (no explota)", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const dia = proximoDiaDeSemana(2);
    await crearOverrideLab({ fecha: dia, isClosed: false, start: "18:00", end: "10:00", motivo: "override invertido" });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, dia);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual([]);
  }, 30_000);

  // ------------------------------------------------------------------ A20
  it("A20 · vacaciones de UN profesional: el resto sigue vendiendo el dia", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    const mefis = "30a88204-ba79-42d1-a02a-54b9ef0d0ad3";
    await crearOverrideLab({ fecha: miercoles, staffId: lucin, isClosed: true, motivo: "vacaciones" });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.length).toBeGreaterThan(0);
    for (const s of res.data) {
      expect(s.staffIds).not.toContain(lucin);
      expect(s.staffIds).toContain(mefis);
    }
  }, 30_000);

  // ------------------------------------------------------------------ A21
  it("A21 · un profesional con horario reducido solo ofrece su ventana", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    const mefis = "30a88204-ba79-42d1-a02a-54b9ef0d0ad3";
    await crearOverrideLab({
      fecha: miercoles,
      staffId: lucin,
      isClosed: false,
      start: "14:00",
      end: "17:00",
      motivo: "turno medico",
    });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;

    const conLucin = (hora: string) => res.data.find((s) => hhmmEnArt(s.start) === hora)?.staffIds ?? [];
    // 13:30 es antes de su ventana: sigue en el slot por los demas, pero el
    // no esta.
    expect(conLucin("13:30")).not.toContain(lucin);
    expect(conLucin("14:00")).toContain(lucin);
    expect(conLucin("16:30")).toContain(lucin);
    // 17:00 -> termina 17:30, fuera de su ventana.
    expect(conLucin("17:00")).not.toContain(lucin);
    // Y el resto del equipo no se vio afectado.
    expect(conLucin("09:00")).toContain(mefis);
  }, 30_000);

  // ------------------------------------------------------------------ A22
  it("A22 · un descanso puntual de UN profesional le saca esa franja", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    const mefis = "30a88204-ba79-42d1-a02a-54b9ef0d0ad3";
    await crearOverrideLab({
      fecha: miercoles,
      staffId: lucin,
      isClosed: false,
      breakStart: "10:00",
      breakEnd: "11:00",
      motivo: "descanso",
    });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const conLucin = (hora: string) => res.data.find((s) => hhmmEnArt(s.start) === hora)?.staffIds ?? [];
    expect(conLucin("10:00")).not.toContain(lucin);
    expect(conLucin("10:30")).not.toContain(lucin);
    expect(conLucin("09:30")).toContain(lucin);
    expect(conLucin("11:00")).toContain(lucin);
    // Los demas siguen ballots en esa franja.
    expect(conLucin("10:00")).toContain(mefis);
  }, 30_000);

  // ------------------------------------------------------------------ A23
  it("A23 · un profesional part-time no aparece los dias que no cargo", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const pable = "17e3abd1-b258-4cec-905e-c0fae0680780";
    // pable tiene filas L-V y sabado. El domingo el local esta cerrado asi que
    // no sirve: se usa el SABADO, que si esta abierto, y el LUNES, que esta
    // cerrado a nivel de local. Para discriminar hace falta un dia abierto sin
    // fila: se le saca la fila del jueves y se lo busca ahi.
    const { error } = await db()
      .from("staff_schedules")
      .update({ is_active: false })
      .eq("staff_id", pable)
      .eq("day_of_week", 4);
    expect(error).toBeNull();

    try {
      const res = await fetchPublicAvailableSlots(SHOP_ID, 30, jueves);
      expect(res.success).toBe(true);
      if (!res.success) return;
      const alguna = res.data.find((s) => s.staffIds.includes(pable));
      expect(alguna, "con la fila del jueves desactivada no puede aparecer el jueves").toBeUndefined();
      // Y sigue apareciendo los demas dias.
      const mar = await fetchPublicAvailableSlots(SHOP_ID, 30, martes);
      expect(mar.success).toBe(true);
      if (!mar.success) return;
      expect(mar.data.some((s) => s.staffIds.includes(pable))).toBe(true);
    } finally {
      await db()
        .from("staff_schedules")
        .update({ is_active: true })
        .eq("staff_id", pable)
        .eq("day_of_week", 4);
    }
  }, 40_000);

  // ------------------------------------------------------------------ A24
  it("A24 · un profesional SIN horario cargado hereda el del local", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    // `E2E Klip` (segundo owner) no tiene ninguna fila en staff_schedules.
    const { data } = await db().from("staff_schedules").select("id").eq("staff_id", OWNER2_ID);
    expect(data, "este owner no tiene horarios cargados, que es la premisa del caso").toEqual([]);

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const conOwner2 = res.data.find((s) => s.staffIds.includes(OWNER2_ID));
    expect(conOwner2).toBeDefined();
    expect(hhmmEnArt(conOwner2!.start)).toBe("09:00");
  }, 30_000);

  // ------------------------------------------------------------------ A25
  it("A25 · un miembro con is_active=false no aparece en la reserva publica", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    for (const s of res.data) expect(s.staffIds).not.toContain(STAFF_INACTIVO_ID);
  }, 30_000);

  // ------------------------------------------------------------------ A26
  it("A26 · filtrar por un servicio que el profesional no hace devuelve la nada", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    servicio30 = await crearServicioLab({ name: "solo-lucin", price: 10000, duration: 30 });
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    const pable = "17e3abd1-b258-4cec-905e-c0fae0680780";
    // A lucin le agregamos el servicio; pable no lo tiene.
    await db().from("staff_services").insert({ staff_id: lucin, service_id: servicio30 });

    const soloLucin = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles, [lucin], servicio30);
    const soloPable = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles, [pable], servicio30);
    expect(soloLucin.success && soloPable.success).toBe(true);
    if (!soloLucin.success || !soloPable.success) return;
    expect(soloLucin.data.length).toBeGreaterThan(0);
    expect(soloPable.data).toEqual([]);
  }, 40_000);

  // ------------------------------------------------------------------ A27
  it("A27 · un servicio que NADIE tiene asignado deja pasar a todos", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const servicioHuerfano = await crearServicioLab({ name: "sin-asignar", price: 10000, duration: 30 });
    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles, undefined, servicioHuerfano);
    expect(res.success).toBe(true);
    if (!res.success) return;
    // Sin filas en staff_services, el filtro no acota: quedan todos los que
    // pueden ese dia.
    expect(res.data.length).toBeGreaterThan(0);
  }, 30_000);

  // ------------------------------------------------------------------ A28
  it("A28 · el filtro por profesional NO se ignora aunque otro pueda ese dia", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const mefis = "30a88204-ba79-42d1-a02a-54b9ef0d0ad3";
    // mefis no tiene fila del domingo (solo 1-6) y el domingo el local esta
    // cerrado. Se usa el mismo criterio con el sabado: mefis trabaja sabado,
    // pero no tiene fila de Break/Start: el caso real es que el filtro se cruce
    // con la lista de servicios.
    const sinFiltro = await fetchPublicAvailableSlots(SHOP_ID, 30, sabado);
    const filtrado = await fetchPublicAvailableSlots(SHOP_ID, 30, sabado, [STAFF_INACTIVO_ID]);
    expect(sinFiltro.success && filtrado.success).toBe(true);
    if (!sinFiltro.success || !filtrado.success) return;
    expect(sinFiltro.data.length).toBeGreaterThan(0);
    expect(filtrado.data).toEqual([]);
    expect(mefis).toBeTruthy();
  }, 30_000);

  // ------------------------------------------------------------------ A29
  it("A29 · sin equipo activo el local no ofrece ningun slot", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    // Se bajan TODAS las membresias activas y se restauran en el finally.
    const { data: antes } = await db().from("shop_memberships").select("user_id").eq("shop_id", SHOP_ID).eq("is_active", true);
    await db().from("shop_memberships").update({ is_active: false }).eq("shop_id", SHOP_ID).eq("is_active", true);
    try {
      const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data).toEqual([]);
    } finally {
      for (const m of antes ?? []) {
        await db().from("shop_memberships").update({ is_active: true }).eq("shop_id", SHOP_ID).eq("user_id", m.user_id);
      }
    }
  }, 40_000);

  // ------------------------------------------------------------------ A30
  it("A30 · sin business_hours configurado entra el default (L-S 09-20, domingo cerrado)", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    await db().from("shops").update({ business_hours: null }).eq("id", SHOP_ID);
    try {
      const sab = await fetchPublicAvailableSlots(SHOP_ID, 30, sabado);
      const lun = await fetchPublicAvailableSlots(SHOP_ID, 30, proximoDiaDeSemana(1));
      expect(sab.success && lun.success).toBe(true);
      if (!sab.success || !lun.success) return;
      // Con el default el sabado cierra 20:00, no 13:00 como el horario real.
      expect(horasDe(sab).at(-1)).toBe("19:30");
      // El lunes si esta abierto con el default, al reves del local real.
      expect(horasDe(lun).length).toBeGreaterThan(0);
    } finally {
      const { data } = await db().from("shops").select("business_hours").eq("id", SHOP_ID);
      void data;
      await restaurarLocal();
    }
  }, 40_000);

  // ------------------------------------------------------------------ A31
  it("A31 · cambiar el horario del local mueve la grilla en el momento", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const antes = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(antes.success).toBe(true);
    if (!antes.success) return;
    expect(horasDe(antes)[0]).toBe("09:00");

    await ponerHorario("wednesday", { open: true, start: "11:00", end: "14:00", break_start: null, break_end: null });
    const despues = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(despues.success).toBe(true);
    if (!despues.success) return;
    const horas = horasDe(despues);
    expect(horas[0]).toBe("11:00");
    expect(horas.at(-1)).toBe("13:30");
    expect(despues.data).toHaveLength(6);
  }, 30_000);

  // ------------------------------------------------------------------ A32
  it("A32 · cerrar el local un dia que estaba abierto lo deja sin slots", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const antes = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(antes.success && antes.data!.length > 0).toBe(true);

    await ponerHorario("wednesday", { open: false, start: "09:00", end: "20:00", break_start: null, break_end: null });
    const despues = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(despues.success).toBe(true);
    if (!despues.success) return;
    expect(despues.data).toEqual([]);
  }, 30_000);

// ------------------------------------------------------------------ A33
  it("A33 · una reserva pendiente viva (pending_bookings) bloquea el slot", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    const mefis = "30a88204-ba79-42d1-a02a-54b9ef0d0ad3";
    const servicio = await crearServicioLab({ name: "para-pendiente", price: 10000, duration: 30 });
    const { data, error } = await db()
      .from("pending_bookings")
      .insert({
        shop_id: SHOP_ID,
        customer_name: `${TAG} pendiente viva`,
        customer_phone: "1155550001",
        service_id: servicio,
        staff_id: lucin,
        start_time: artTimestamp(miercoles, "11:00"),
        end_time: artTimestamp(miercoles, "11:30"),
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        status: "pending",
        payment_method: "mp",
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    try {
      const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
      expect(res.success).toBe(true);
      if (!res.success) return;
      const once = res.data.find((s) => hhmmEnArt(s.start) === "11:00");
      expect(once?.staffIds).not.toContain(lucin);
      expect(once?.staffIds).toContain(mefis);
    } finally {
      await db().from("pending_bookings").delete().eq("id", data!.id);
    }
  }, 30_000);

  // ------------------------------------------------------------------ A34
  it("A34 · una reserva pendiente VENCIDA ya no bloquea", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    const servicio = await crearServicioLab({ name: "para-pendiente-vencida", price: 10000, duration: 30 });
    const { data, error } = await db()
      .from("pending_bookings")
      .insert({
        shop_id: SHOP_ID,
        customer_name: `${TAG} pendiente vencida`,
        customer_phone: "1155550002",
        service_id: servicio,
        staff_id: lucin,
        start_time: artTimestamp(miercoles, "11:00"),
        end_time: artTimestamp(miercoles, "11:30"),
        expires_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        status: "pending",
        payment_method: "mp",
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    try {
      const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.find((s) => hhmmEnArt(s.start) === "11:00")?.staffIds).toContain(lucin);
    } finally {
      await db().from("pending_bookings").delete().eq("id", data!.id);
    }
  }, 30_000);

  // ------------------------------------------------------------------ A35
  it("A35 · HOY no ofrece horarios que ya pasaron", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const hoy = artDate();
    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, hoy);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const ahora = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    for (const h of horasDe(res)) {
      expect(h >= ahora, `${h} ya paso (ahora son las ${ahora})`).toBe(true);
    }
  }, 30_000);

  // ------------------------------------------------------------------ A36
  it("A36 · el limite de 30 consultas por minuto devuelve lista vacia, sin error", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const dia = proximoDiaDeSemana(5); // viernes
    const conSlots = await fetchPublicAvailableSlots(SHOP_ID, 30, dia);
    expect(conSlots.success).toBe(true);
    if (!conSlots.success) return;
    expect(conSlots.data.length, "la primera llamada todavia trae slots").toBeGreaterThan(0);

    let ultimo;
    for (let i = 0; i < 32; i++) ultimo = await fetchPublicAvailableSlots(SHOP_ID, 30, dia);
    expect(ultimo?.success, "el limitador NO debe romper la respuesta").toBe(true);
    if (!ultimo?.success) return;
    expect(ultimo.data, "agotado el cupo, la lista viene vacia").toEqual([]);
  }, 120_000);

  // ------------------------------------------------------------------ A37
  it("A37 · el slot trae start/end en UTC y `time` en texto legible (no parseable)", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const primero = res.data[0];
    // HALLAZGO: `time` no es "09:00", es "09:00 a. m.". Es la etiqueta para
    // pintar, no un dato. Si algo la parsea (un `startsWith("18")` para marcar
    // el turno de la noche, por ejemplo) revienta.
    expect(primero.time).toBe("09:00 a. m.");
    // El dato confiable es `start`, que va en UTC: 09:00 ART = 12:00 UTC.
    expect(primero.start).toBe(`${miercoles}T12:00:00.000Z`);
    expect(primero.end).toBe(`${miercoles}T12:30:00.000Z`);
  }, 30_000);

  // ------------------------------------------------------------------ A38
  it("A38 · un turno fuera de grilla bloquea el slot que lo pisa", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const lucin = "05051ed9-4104-4dec-894b-58b437d7a237";
    const mefis = "30a88204-ba79-42d1-a02a-54b9ef0d0ad3";
    // 10:37-11:12 no cae en la grilla de 30.
    await crearTurnoLab({ staffId: lucin, fecha: miercoles, desde: "10:37", hasta: "11:12", status: "confirmed" });

    const res = await fetchPublicAvailableSlots(SHOP_ID, 30, miercoles);
    expect(res.success).toBe(true);
    if (!res.success) return;
    // 11:00-11:30 se pisa (11:00 < 11:12).
    const once = res.data.find((s) => hhmmEnArt(s.start) === "11:00");
    expect(once, "el slot sigue existiendo para los demas").toBeDefined();
    expect(once!.staffIds).not.toContain(lucin);
    // 11:30-12:00 ya no se pisa: arranca despues de que termina.
    const limite = res.data.find((s) => hhmmEnArt(s.start) === "11:30");
    expect(limite?.staffIds).toContain(lucin);
    // Y los otros no se ven afectados.
    expect(once!.staffIds).toContain(mefis);
  }, 30_000);

  // ------------------------------------------------------------------ A39
  it("A39 · el filtro por profesional se cruza con el horario del local", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const sabadoMefis = await fetchPublicAvailableSlots(SHOP_ID, 30, sabado, ["30a88204-ba79-42d1-a02a-54b9ef0d0ad3"]);
    expect(sabadoMefis.success).toBe(true);
    if (!sabadoMefis.success) return;
    // El sabado el local cierra 13:00: el filtro no puede empujar el cierre.
    const horas = horasDe(sabadoMefis);
    expect(horas[0]).toBe("09:00");
    expect(horas.at(-1)).toBe("12:30");
  }, 30_000);

  // ------------------------------------------------------------------ A40
  it("A40 · cambiar la duracion del servicio reordena la grilla sin tocar el horario", async () => {
    const { fetchPublicAvailableSlots } = await cargarDisponibilidad();
    const corto = await fetchPublicAvailableSlots(SHOP_ID, 15, miercoles);
    const largo = await fetchPublicAvailableSlots(SHOP_ID, 90, miercoles);
    expect(corto.success && largo.success).toBe(true);
    if (!corto.success || !largo.success) return;
    // 15 min: mismo arranque, mismo ultimo (19:30 entra y termina 19:45).
    expect(horasDe(corto).at(-1)).toBe("19:30");
    // 90 min: el ultimo que entra antes de las 20:00 es 18:30.
    expect(horasDe(largo).at(-1)).toBe("18:30");
    expect(largo.data.length).toBeLessThan(corto.data.length);
  }, 30_000);
});