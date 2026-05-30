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

export function logError(ctx: LogContext, message: string, error?: unknown, data?: Record<string, unknown>): void {
  const elapsed = Date.now() - ctx.startTime;
  const errStr = error instanceof Error ? error.message : error ? String(error) : "";
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  console.error(`[${timestamp()}] [${ctx.requestId}] [ERROR] [${ctx.method} ${ctx.path}] [${elapsed}ms] ${message}${errStr ? ` | ${errStr}` : ""}${payload}`);
}
