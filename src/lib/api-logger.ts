import crypto from "crypto";

export type LogContext = {
  requestId: string;
  method: string;
  path: string;
  startTime: number;
};

export function createLogContext(method: string, path: string): LogContext {
  return {
    requestId: crypto.randomUUID().slice(0, 8),
    method,
    path,
    startTime: Date.now(),
  };
}

function timestamp(): string {
  return new Date().toISOString();
}

export function logInfo(ctx: LogContext, message: string, data?: Record<string, unknown>): void {
  const elapsed = Date.now() - ctx.startTime;
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${timestamp()}] [${ctx.requestId}] [INFO] [${ctx.method} ${ctx.path}] [${elapsed}ms] ${message}${payload}`);
}

export function logWarn(ctx: LogContext, message: string, data?: Record<string, unknown>): void {
  const elapsed = Date.now() - ctx.startTime;
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  console.warn(`[${timestamp()}] [${ctx.requestId}] [WARN] [${ctx.method} ${ctx.path}] [${elapsed}ms] ${message}${payload}`);
}

/**
 * Describe un valor lanzado para que el log sirva para debuggear.
 *
 * `String(error)` sobre un objeto plano devuelve "[object Object]": el
 * cliente de Mercado Pago y varios fetchers tiran objetos con `response`,
 * `status` y `data`, no instancias de Error, asi que el mensaje real del
 * fallo (tipicamente un 401 o un body de la API) se perdia.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ? `${error.message}\n${error.stack}` : error.message;
  }
  if (!error || typeof error !== "object") return String(error ?? "");

  const obj = error as Record<string, unknown>;
  const parts: string[] = [];

  for (const key of ["name", "message", "code", "status", "statusCode"]) {
    const value = obj[key];
    if (value !== undefined && value !== null) parts.push(`${key}=${String(value)}`);
  }

  const response = obj.response as Record<string, unknown> | undefined;
  if (response && typeof response === "object") {
    const status = response.status ?? response.statusCode;
    if (status !== undefined) parts.push(`response.status=${String(status)}`);
    const data = response.data;
    if (data !== undefined) parts.push(`response.data=${safeStringify(data)}`);
  }

  if (parts.length > 0) return parts.join(" ");

  return safeStringify(obj);
}

function safeStringify(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    if (!text) return String(value);
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return String(value);
  }
}

export function logError(ctx: LogContext, message: string, error?: unknown, data?: Record<string, unknown>): void {
  const elapsed = Date.now() - ctx.startTime;
  const errStr = error === undefined ? "" : describeError(error);
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  console.error(
    `[${timestamp()}] [${ctx.requestId}] [ERROR] [${ctx.method} ${ctx.path}] [${elapsed}ms] ${message}${errStr ? ` | ${errStr.replace(/\n/g, "\n    ")}` : ""}${payload}`,
  );
}
