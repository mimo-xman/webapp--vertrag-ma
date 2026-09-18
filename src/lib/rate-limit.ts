// Simple in-memory rate limiter (single-instance design, like CVAutoSender).
// For multi-instance production deployments, swap for Redis/Upstash.
// Set DISABLE_RATE_LIMIT=true to bypass (for automated testing).

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
let cleanupStarted = false;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "127.0.0.1";
}

function initCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  setInterval(
    () => {
      const now = Date.now();
      for (const [key, entry] of store.entries()) {
        if (entry.resetAt < now) store.delete(key);
      }
    },
    5 * 60 * 1000
  ).unref?.();
}

export function rateLimit(
  request: Request,
  identifier: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  // Bypass for automated testing. Accepts both "true" and "test"
  // (the value documented in DEPLOYMENT.md).
  const flag = process.env.DISABLE_RATE_LIMIT;
  if (flag === "true" || flag === "test") {
    return { success: true, remaining: 999, resetAt: Date.now() + windowMs };
  }

  initCleanup();
  const ip = getClientIp(request);
  const key = `${identifier}:${ip}`;
  const now = Date.now();

  let entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);

  return {
    success: entry.count <= limit,
    remaining,
    resetAt: entry.resetAt,
  };
}

export function rateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
