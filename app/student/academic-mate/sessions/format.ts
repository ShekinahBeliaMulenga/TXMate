const TIME_ZONE = "Africa/Lusaka";
const LOCALE = "en-ZM";

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const fullFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** e.g. "Mon, 3 Nov". Falls back to the raw value if it is not a valid date. */
export function formatDate(value: string): string {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : value;
}

/** e.g. "Mon, 3 Nov 2026, 14:00". Falls back to the raw value if invalid. */
export function formatFull(value: string): string {
  const date = parseDate(value);
  return date ? fullFormatter.format(date) : value;
}

/** e.g. "14:00 – 15:30". Returns an empty string if either end is invalid. */
export function formatTimeRange(start: string, end: string): string {
  const from = parseDate(start);
  const to = parseDate(end);
  if (!from || !to) return "";
  return `${timeFormatter.format(from)} – ${timeFormatter.format(to)}`;
}

/** e.g. "1h 30m". Returns null if the range is invalid or not positive. */
export function formatDuration(start: string, end: string): string | null {
  const from = parseDate(start);
  const to = parseDate(end);
  if (!from || !to) return null;
  const minutes = Math.round((to.getTime() - from.getTime()) / MINUTE_MS);
  if (minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  return hours ? `${hours}h` : `${rest}m`;
}

export type DeadlineTone = "overdue" | "urgent" | "normal";

export type Deadline = { label: string; tone: DeadlineTone };

/**
 * Time left to respond. The original session start is the deadline.
 * `now` is passed in (epoch ms) so this stays pure and testable.
 */
export function getDeadline(start: string, now: number): Deadline {
  const date = parseDate(start);
  if (!date) return { label: "Respond before start", tone: "normal" };

  const remaining = date.getTime() - now;
  if (remaining <= 0) return { label: "Deadline passed", tone: "overdue" };
  if (remaining < HOUR_MS) {
    return { label: `${Math.max(1, Math.round(remaining / MINUTE_MS))} min left`, tone: "urgent" };
  }
  if (remaining < DAY_MS) {
    return { label: `${Math.round(remaining / HOUR_MS)}h left`, tone: "urgent" };
  }
  const days = Math.floor(remaining / DAY_MS);
  return { label: `${days} ${days === 1 ? "day" : "days"} left`, tone: "normal" };
}

export function getInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return letters || "?";
}

/** "IN_PROGRESS" -> "In progress" */
export function humanize(value: string): string {
  const text = value.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
