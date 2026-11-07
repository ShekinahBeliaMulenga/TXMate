/** How long an account may stay unverified, with nothing attached to it, before it is removed. */
export const UNVERIFIED_MAX_AGE_DAYS = 7;
/** At most this many accounts are removed per run, so one run can never delete a surprising number. */
export const CLEANUP_BATCH_SIZE = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Accounts created before this moment are old enough to remove. */
export function unverifiedCutoff(now: Date): Date {
  return new Date(now.getTime() - UNVERIFIED_MAX_AGE_DAYS * DAY_MS);
}

/** True when an account is old enough, unverified and not anonymised. The database query adds "nothing attached". */
export function isStaleUnverified(account: { emailVerified: boolean; createdAt: Date; anonymisedAt: Date | null }, now: Date): boolean {
  return !account.emailVerified && account.anonymisedAt === null && account.createdAt < unverifiedCutoff(now);
}
