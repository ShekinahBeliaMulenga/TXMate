/** Admin sessions end this long after sign-in, regardless of activity. Shorter than the app-wide session. */
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function isAdminSessionExpired(sessionCreatedAt: Date | string | number, now = Date.now()): boolean {
  const created = new Date(sessionCreatedAt).getTime();
  // An unreadable timestamp is treated as expired: fail closed.
  return Number.isNaN(created) || now - created > ADMIN_SESSION_MAX_AGE_MS;
}
