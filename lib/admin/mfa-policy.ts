/** Limits for admin two-step sign-in. Pure, so the rules are tested without a database. */

/** Wrong codes in a row before the account is locked. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export function lockRemainingMs(lockedUntil: Date | null | undefined, now: number): number {
  if (!lockedUntil) return 0;
  return Math.max(0, lockedUntil.getTime() - now);
}

/** True once this many wrong codes in a row have been counted. */
export function shouldLock(failedAttempts: number): boolean {
  return failedAttempts >= MAX_FAILED_ATTEMPTS;
}

export type MfaMode = "setup" | "verify";

export function lockMessage(remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return `Too many wrong codes. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
