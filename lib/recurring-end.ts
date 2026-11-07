import { addCalendarDays, localDateString } from "./academic-mate-availability";
import { isValidLocalDate, parseLocalEndDate } from "./recurring-arrangements";

/** The longest a recurring arrangement can run from its first session. */
export const RECURRING_MAX_DAYS = 365;

export type RecurrenceEndCheck = { ok: true; endsOn: string; endsAt: Date } | { ok: false; message: string };

/**
 * Every recurring arrangement must say when it stops. `endsOn` is a calendar date (YYYY-MM-DD) in the
 * schedule's timezone; the last session may fall on that day. It must leave room for at least two
 * sessions and no more than a year from the first.
 */
export function checkRecurrenceEnd(input: { endsOn: unknown; firstStart: Date; timezone: string; everyWeeks: number }): RecurrenceEndCheck {
  const { endsOn, firstStart, timezone, everyWeeks } = input;
  if (typeof endsOn !== "string" || !isValidLocalDate(endsOn)) return { ok: false, message: "Choose the date your recurring sessions should end." };
  const first = localDateString(firstStart, timezone);
  if (!first) return { ok: false, message: "That schedule could not be read. Choose another time." };
  const earliest = addCalendarDays(first, everyWeeks * 7);
  if (endsOn < earliest) return { ok: false, message: `The end date must leave room for at least two sessions. Choose ${earliest} or later.` };
  const latest = addCalendarDays(first, RECURRING_MAX_DAYS);
  if (endsOn > latest) return { ok: false, message: `Recurring sessions can run for up to a year. Choose ${latest} or earlier.` };
  const endsAt = parseLocalEndDate(endsOn, timezone);
  if (!endsAt) return { ok: false, message: "That end date could not be used. Choose another." };
  return { ok: true, endsOn, endsAt };
}
