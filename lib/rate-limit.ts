/**
 * Small in-memory rate limiter for routes that a signed-in person could hammer (sending messages, looking up phone numbers).
 *
 * It counts requests per key in a fixed window. The counters live in this server process, which fits how TXMate runs
 * (one custom Node server). If the app is ever run as several instances, each keeps its own count, so the effective limit
 * becomes the limit times the number of instances; swap the store for a shared one (Redis) at that point.
 */

export type RateLimitRule = { limit: number; windowMs: number };
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

type Bucket = { count: number; resetAt: number };
type Store = { buckets: Map<string, Bucket>; lastSweepAt: number };

const SWEEP_EVERY_MS = 60_000;

// Kept on globalThis because the custom server and the bundled route handlers can load this module in separate
// module contexts (the same reason lib/realtime/socket-server.ts keeps its server there).
const globalStore = globalThis as typeof globalThis & { txmateRateLimits?: Store };

function store(): Store {
  if (!globalStore.txmateRateLimits) globalStore.txmateRateLimits = { buckets: new Map(), lastSweepAt: 0 };
  return globalStore.txmateRateLimits;
}

/** Drops expired counters now and then so the map cannot grow without bound. */
function sweep(state: Store, now: number): void {
  if (now - state.lastSweepAt < SWEEP_EVERY_MS) return;
  state.lastSweepAt = now;
  for (const [key, bucket] of state.buckets) {
    if (bucket.resetAt <= now) state.buckets.delete(key);
  }
}

/** Counts one request against `key`. `allowed` is false once the key has used up `rule.limit` in the current window. */
export function takeRateLimit(key: string, rule: RateLimitRule, now: number = Date.now()): RateLimitResult {
  const state = store();
  sweep(state, now);
  const bucket = state.buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    state.buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= rule.limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Clears every counter. For tests. */
export function resetRateLimits(): void {
  store().buckets.clear();
}
