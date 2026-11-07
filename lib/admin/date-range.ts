/**
 * Day-based date filters for admin lists. Dates are calendar days in Zambia (Africa/Lusaka, UTC+2, no daylight
 * saving), because that is how admins read the "When" column. "From" includes the whole first day and "To"
 * includes the whole last day.
 */
const LUSAKA_OFFSET_MS = 2 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Start of that Lusaka day as an instant, or null when the text is not a real calendar date. */
export function lusakaDayStart(value: string | null | undefined): Date | null {
  const match = DAY_PATTERN.exec((value ?? "").trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 2000 || year > 2100) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return new Date(utc.getTime() - LUSAKA_OFFSET_MS);
}

/** A Prisma date filter for the chosen days, or undefined when neither end is a valid date. */
export function dayRangeFilter(from: string | null | undefined, to: string | null | undefined): { gte?: Date; lt?: Date } | undefined {
  const start = lusakaDayStart(from);
  const end = lusakaDayStart(to);
  if (!start && !end) return undefined;
  return { ...(start ? { gte: start } : {}), ...(end ? { lt: new Date(end.getTime() + DAY_MS) } : {}) };
}
