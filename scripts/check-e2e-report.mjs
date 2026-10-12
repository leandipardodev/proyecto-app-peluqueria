/**
 * Falla si el E2E no corrio de verdad.
 *
 * POR QUE ESTE ARCHIVO EXISTE
 * ---------------------------
 * Los tests de Caja y reservas usan `test.skip(...)` cuando falta
 * `E2E_LOGIN_EMAIL`. Playwright sale con codigo 0 cuando TODO esta skipeado, asi
 * que el step "E2E Smoke" del Quality Gate era un check verde que no habia
 * verificado nada: 20 de 22 tests se saltaban en cada push y nadie lo notaba.
 *
 * Que hace
 * --------
 * Lee el reporte JSON de Playwright y:
 *   - falla si no corrio ningun test;
 *   - falla si TODOS se saltearon (o sea, faltaban credenciales);
 *   - falla si hay alguno fallado o interrumpido;
 *   - avisa (sin fallar) si faltan las credenciales, para no bloquear deploys de
 *     alguien que todavia no las cargo.
 *
 * Con esto: cuando las credenciales estan, un E2E roto no puede entrar en verde.
 */
import fs from "node:fs";

const REPORT = process.env.PLAYWRIGHT_JSON_REPORT || ".playwright-report.json";

function parseReport() {
  if (!fs.existsSync(REPORT)) {
    return { error: `no se encontro el reporte en ${REPORT}` };
  }
  try {
    return { data: JSON.parse(fs.readFileSync(REPORT, "utf8")) };
  } catch (e) {
    return { error: `el reporte no se pudo leer: ${e instanceof Error ? e.message : "error desconocido"}` };
  }
}

function walk(suites, acc) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const testCase of spec.tests || []) {
        acc.total += 1;
        const status = testCase.status || testCase.results?.at(-1)?.status || "unknown";
        acc.byStatus[status] = (acc.byStatus[status] || 0) + 1;
      }
    }
    walk(suite.suites, acc);
  }
  return acc;
}

const { data, error } = parseReport();

if (error) {
  console.error(`[check-e2e-report] FALLA: ${error}`);
  process.exit(1);
}

const acc = walk(data.suites, { total: 0, byStatus: {} });
// Los estados de Playwright NO son passed/failed: son
// "expected" (paso), "unexpected" (FALLO), "skipped" y "flaky".
// `unexpected` como "fallado" es lo que hacia que este script dijera OK con 7
// tests en rojo.
const corridos = acc.total - (acc.byStatus.skipped || 0);
const fallados = (acc.byStatus.unexpected || 0) + (acc.byStatus.flaky || 0);

console.log(
  `[check-e2e-report] ${acc.total} tests: ` +
    Object.entries(acc.byStatus)
      .map(([k, v]) => `${k}=${v}`)
      .join(" "),
);

if (acc.total === 0) {
  console.error("[check-e2e-report] FALLA: no se ejecuto ningun test de E2E.");
  process.exit(1);
}

if (fallados > 0) {
  console.error(`[check-e2e-report] FALLA: ${fallados} tests de E2E no pasaron.`);
  process.exit(1);
}

if (corridos === 0) {
  const hayCredenciales = Boolean(process.env.E2E_LOGIN_EMAIL && process.env.E2E_LOGIN_PASSWORD);
  const mensaje =
    "[check-e2e-report] AVISO: TODOS los tests de E2E se saltearon. " +
    "El gate queda en verde sin verificar nada.";
  if (hayCredenciales) {
    console.error(`${mensaje} Las credenciales estan seteadas, asi que algo se rompio: revisa el filtro \`test.skip\`.`);
    process.exit(1);
  }
  console.warn(mensaje);
  console.warn(
    "[check-e2e-report] Para que el gate verifique de verdad, defini E2E_LOGIN_EMAIL y E2E_LOGIN_PASSWORD como secrets del repositorio.",
  );
  process.exit(0);
}

const desconocidos = acc.total - (acc.byStatus.expected || 0) - (acc.byStatus.skipped || 0) - fallados;
if (desconocidos > 0) {
  console.error(`[check-e2e-report] FALLA: ${desconocidos} tests quedaron en un estado inesperado.`);
  process.exit(1);
}

console.log(`[check-e2e-report] OK: ${acc.byStatus.expected || 0} tests de E2E ejecutados y pasando.`);