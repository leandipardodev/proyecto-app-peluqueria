import { NextRequest, NextResponse } from "next/server";
import { LRUCache } from "lru-cache";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimiterOptions = {
  intervalMs: number;
  maxRequests: number;
};

type CheckResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
};

type RateLimiterEntry = {
  count: number;
  resetAt: number;
};

let upstashImpl: ReturnType<typeof createUpstashLimiter> | null = null;

function createUpstashLimiter(options: RateLimiterOptions) {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const redis = new Redis({ url, token });
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(options.maxRequests, `${options.intervalMs}ms`),
    analytics: true,
    prefix: "klip",
  });

  return {
    check: async (key: string): Promise<CheckResult> => {
      const { success, remaining, reset } = await ratelimit.limit(key);
      return {
        allowed: success,
        remaining,
        resetMs: Math.max(0, reset - Date.now()),
      };
    },
  };
}

function createMemoryLimiter(options: RateLimiterOptions) {
  const { intervalMs, maxRequests } = options;
  const cache = new LRUCache<string, RateLimiterEntry>({
    max: 10000,
    ttl: intervalMs,
  });

  return {
    check: async (key: string): Promise<CheckResult> => {
      const now = Date.now();
      const entry = cache.get(key);

      if (!entry) {
        cache.set(key, { count: 1, resetAt: now + intervalMs });
        return { allowed: true, remaining: maxRequests - 1, resetMs: intervalMs };
      }

      if (now >= entry.resetAt) {
        cache.set(key, { count: 1, resetAt: now + intervalMs });
        return { allowed: true, remaining: maxRequests - 1, resetMs: intervalMs };
      }

      entry.count++;
      if (entry.count > maxRequests) {
        return { allowed: false, remaining: 0, resetMs: entry.resetAt - now };
      }

      return { allowed: true, remaining: maxRequests - entry.count, resetMs: entry.resetAt - now };
    },
  };
}

export function createRateLimiter(options: RateLimiterOptions) {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    if (!upstashImpl) {
      upstashImpl = createUpstashLimiter(options);
    }
    return { check: (key: string) => upstashImpl!.check(key) };
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[rate-limiter] UPSTASH_REDIS_REST_URL/TOKEN not configured — falling back to in-memory limiter. " +
      "Rate limiting will NOT work across multiple instances.",
    );
  }

  return createMemoryLimiter(options);
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

export async function rateLimitRoute(
  request: NextRequest,
  limiter: ReturnType<typeof createRateLimiter>,
  keyPrefix: string,
): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  const result = await limiter.check(`${keyPrefix}:${ip}`);

  if (!result.allowed) {
    return NextResponse.json(
      { ok: false, error: "too_many_requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(result.resetMs / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  return null;
}
