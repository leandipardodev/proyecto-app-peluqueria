function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => PromiseLike<T>,
  options?: { retries?: number; onRetry?: (attempt: number, error: unknown) => void; delayMs?: number }
): Promise<T> {
  const retries = options?.retries ?? 2;
  const delayMs = options?.delayMs ?? 500;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) throw err;
      options?.onRetry?.(i + 1, err);
      if (delayMs > 0) await sleep(delayMs);
    }
  }
  throw new Error("unreachable");
}
