/**
 * Per-IP fixed-window rate limiter, in memory.
 *
 * Only `/api/parse-watchlist` uses it, because that route spends someone else's quota. The
 * deterministic path is arithmetic over bundled data and is deliberately unlimited.
 *
 * On Vercel this Map is per instance, so the real limit is `limit × instances` — leaky by
 * construction. That is documented in the README's Limitations rather than papered over with
 * a comment claiming otherwise; fixing it properly means Redis, which is not a thing this
 * repo needs.
 *
 * The clock is injected so the tests do not sleep.
 */

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets — goes straight into `Retry-After`. */
  retry_after_seconds: number;
}

interface Window {
  started: number;
  count: number;
}

export function createRateLimiter({ limit, windowMs, now = Date.now }: RateLimitOptions) {
  const windows = new Map<string, Window>();

  return function take(key: string): RateLimitResult {
    const timestamp = now();
    const existing = windows.get(key);

    if (!existing || timestamp - existing.started >= windowMs) {
      windows.set(key, { started: timestamp, count: 1 });
      return { allowed: true, remaining: limit - 1, retry_after_seconds: 0 };
    }

    const elapsed = timestamp - existing.started;
    const retry_after_seconds = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));

    if (existing.count >= limit) {
      return { allowed: false, remaining: 0, retry_after_seconds };
    }

    existing.count += 1;
    return { allowed: true, remaining: limit - existing.count, retry_after_seconds };
  };
}

/**
 * Best-effort client address. Behind Vercel the left-most `x-forwarded-for` entry is the
 * client; locally there is no header at all and everyone shares one bucket, which is fine
 * because the limiter exists to protect an API key, not to be an access control.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "local";
}
