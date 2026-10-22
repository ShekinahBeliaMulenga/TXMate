import type { Weekday } from "@/generated/prisma/client";
import {
  addCalendarDays,
  localDateString,
  localTimeToUtc,
  getLocalSchedule,
  weekdayForDate,
} from "@/lib/academic-mate-availability";

export const RECURRING_GENERATION_HORIZON_DAYS = 30;
export const RECURRING_INTERVAL_OPTIONS = [1, 2, 3, 4] as const;

export type RecurringArrangementPlan = {
  anchorStart: Date;
  everyWeeks: number | null;
  weekday: Weekday | null;
  localStartMinute: number | null;
  timezone: string | null;
  endsAt: Date | null;
};

function dateSerial(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(timestamp / 86_400_000);
}

export function parseLocalEndDate(value: string, timezone: string): Date | null {
  const serial = dateSerial(value);
  if (serial === null) return null;
  // Store the user's selected local calendar date as 23:59 in the arrangement timezone.
  return localTimeToUtc(value, (24 * 60) - 1, timezone);
}

export function isValidLocalDate(value: string): boolean {
  return dateSerial(value) !== null;
}

/**
 * Builds recurring starts using local calendar weeks, not fixed 168-hour UTC
 * intervals. Returns null for incomplete/inconsistent schedules or a timezone
 * that cannot represent one of the generated local times.
 */
export function getRecurringOccurrenceStarts(
  plan: RecurringArrangementPlan,
  from: Date,
  through: Date,
  includeAnchor = false,
): Date[] | null {
  if (
    !Number.isFinite(plan.anchorStart.getTime()) ||
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(through.getTime()) ||
    from > through ||
    !plan.timezone ||
    !plan.weekday ||
    !Number.isInteger(plan.everyWeeks) ||
    !RECURRING_INTERVAL_OPTIONS.includes(plan.everyWeeks as (typeof RECURRING_INTERVAL_OPTIONS)[number]) ||
    !Number.isInteger(plan.localStartMinute) ||
    (plan.localStartMinute as number) < 0 ||
    (plan.localStartMinute as number) > 1439
  ) {
    return null;
  }

  if (plan.endsAt && !Number.isFinite(plan.endsAt.getTime())) return null;

  const anchorLocal = getLocalSchedule(plan.anchorStart, plan.timezone);
  const fromLocalDate = localDateString(from, plan.timezone);
  if (
    !anchorLocal ||
    !fromLocalDate ||
    anchorLocal.weekday !== plan.weekday ||
    anchorLocal.localStartMinute !== plan.localStartMinute
  ) {
    return null;
  }

  const anchorSerial = dateSerial(anchorLocal.localDate);
  const fromSerial = dateSerial(fromLocalDate);
  if (anchorSerial === null || fromSerial === null) return null;

  const stepDays = (plan.everyWeeks as number) * 7;
  const minIndex = includeAnchor ? 0 : 1;
  let index = Math.max(minIndex, Math.ceil((fromSerial - anchorSerial) / stepDays));
  const starts: Date[] = [];

  // 1000 iterations is over 19 years at the longest supported interval and
  // prevents malformed persisted data from causing an unbounded loop.
  for (let iteration = 0; iteration < 1000; iteration += 1, index += 1) {
    const localDate = addCalendarDays(anchorLocal.localDate, index * stepDays);
    if (weekdayForDate(localDate) !== plan.weekday) return null;

    const occurrenceStart = localTimeToUtc(
      localDate,
      plan.localStartMinute as number,
      plan.timezone,
    );
    if (!occurrenceStart) return null;
    if (plan.endsAt && occurrenceStart > plan.endsAt) break;
    if (occurrenceStart > through) break;
    if (occurrenceStart >= from) starts.push(occurrenceStart);
  }

  return starts;
}
/**
 * Returns recurrence starts whose session interval overlaps [from, through).
 * Unlike getRecurringOccurrenceStarts, this also considers an occurrence that
 * began before `from` but has not ended yet. That distinction matters when a
 * candidate slot begins later than a recurring session on the same day.
 */
export function getRecurringOccurrencesOverlappingRange(
  plan: RecurringArrangementPlan,
  from: Date,
  through: Date,
  durationMinutes: number,
): Date[] | null {
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(through.getTime()) ||
    from >= through ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    !Number.isFinite(plan.anchorStart.getTime()) ||
    !plan.timezone ||
    !plan.weekday ||
    !Number.isInteger(plan.everyWeeks) ||
    !RECURRING_INTERVAL_OPTIONS.includes(plan.everyWeeks as (typeof RECURRING_INTERVAL_OPTIONS)[number]) ||
    !Number.isInteger(plan.localStartMinute) ||
    (plan.localStartMinute as number) < 0 ||
    (plan.localStartMinute as number) > 1439
  ) {
    return null;
  }

  if (plan.endsAt && !Number.isFinite(plan.endsAt.getTime())) return null;

  const anchorLocal = getLocalSchedule(plan.anchorStart, plan.timezone);
  const fromLocalDate = localDateString(from, plan.timezone);
  const throughLocalDate = localDateString(through, plan.timezone);
  if (
    !anchorLocal ||
    !fromLocalDate ||
    !throughLocalDate ||
    anchorLocal.weekday !== plan.weekday ||
    anchorLocal.localStartMinute !== plan.localStartMinute
  ) {
    return null;
  }

  const anchorSerial = dateSerial(anchorLocal.localDate);
  const fromSerial = dateSerial(fromLocalDate);
  const throughSerial = dateSerial(throughLocalDate);
  if (anchorSerial === null || fromSerial === null || throughSerial === null) return null;

  const stepDays = (plan.everyWeeks as number) * 7;
  const periodsBack = Math.ceil(durationMinutes / ((plan.everyWeeks as number) * 7 * 24 * 60)) + 1;
  const firstIndex = Math.max(0, Math.floor((fromSerial - anchorSerial) / stepDays) - periodsBack);
  const starts: Date[] = [];

  for (let index = firstIndex, iteration = 0; iteration < 1000; index += 1, iteration += 1) {
    const localDate = addCalendarDays(anchorLocal.localDate, index * stepDays);
    if (weekdayForDate(localDate) !== plan.weekday) return null;

    const occurrenceStart = localTimeToUtc(
      localDate,
      plan.localStartMinute as number,
      plan.timezone,
    );
    if (!occurrenceStart) return null;
    if (plan.endsAt && occurrenceStart > plan.endsAt) break;
    if (occurrenceStart >= through) break;

    const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMinutes * 60_000);
    if (occurrenceStart < through && occurrenceEnd > from) starts.push(occurrenceStart);

    // Avoid spending time projecting many years beyond the queried interval.
    if (dateSerial(localDate)! > throughSerial + stepDays) break;
  }

  return starts;
}

