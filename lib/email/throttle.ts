export type ThrottleOptions = { cooldownMs: number; maxPerHour: number; now?: () => number };
export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Limits how often one key (an email address) may be sent mail, whoever asks.
 * Better Auth limits by IP; this limits by address so one inbox cannot be flooded from many IPs.
 * State is held in this process. With several server instances, use a shared store instead.
 */
export function createSendThrottle(options: ThrottleOptions) {
  const now = options.now ?? Date.now;
  const HOUR = 60 * 60 * 1000;
  const sends = new Map<string, number[]>();

  function recent(key: string, at: number): number[] {
    const list = (sends.get(key) ?? []).filter((time) => at - time < HOUR);
    if (list.length) sends.set(key, list);
    else sends.delete(key);
    return list;
  }

  return {
    /** Checks the limit and, when allowed, counts this send. */
    take(rawKey: string): ThrottleDecision {
      const key = rawKey.trim().toLowerCase();
      const at = now();
      const list = recent(key, at);
      const last = list[list.length - 1];
      if (last !== undefined && at - last < options.cooldownMs) {
        return { allowed: false, retryAfterSeconds: Math.ceil((options.cooldownMs - (at - last)) / 1000) };
      }
      if (list.length >= options.maxPerHour) {
        return { allowed: false, retryAfterSeconds: Math.ceil((HOUR - (at - list[0])) / 1000) };
      }
      list.push(at);
      sends.set(key, list);
      return { allowed: true };
    },
    /** Forgets a send that never went out, so a failed delivery does not use up the person's allowance. */
    refund(rawKey: string): void {
      const key = rawKey.trim().toLowerCase();
      const list = sends.get(key);
      if (!list?.length) return;
      list.pop();
      if (!list.length) sends.delete(key);
    },
    size: () => sends.size,
  };
}
