import type { Weekday } from "@/generated/prisma/client";

export const BOOKING_WINDOW_DAYS = 30;
export const ACTIVE_SESSION_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "DISPUTED",
] as const;

const WEEKDAYS: Weekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export type AvailabilityWindow = {
  day: Weekday;
  startMinute: number;
  endMinute: number;
  timezone: string;
};

export type AvailableSlot = {
  start: Date;
  end: Date;
  timezone: string;
  localDate: string;
  localStart: string;
  localEnd: string;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: Weekday;
};

function getLocalParts(date: Date, timezone: string): LocalParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
      hourCycle: "h23",
    }).formatToParts(date);

    const value = (type: string) => parts.find((part) => part.type === type)?.value;
    const weekdayText = value("weekday")?.toUpperCase();
    if (!weekdayText || !WEEKDAYS.includes(weekdayText as Weekday)) return null;

    const result = {
      year: Number(value("year")),
      month: Number(value("month")),
      day: Number(value("day")),
      hour: Number(value("hour")),
      minute: Number(value("minute")),
      second: Number(value("second")),
      weekday: weekdayText as Weekday,
    };

    if (Object.values(result).some((part) => typeof part === "number" && !Number.isFinite(part))) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

export function localDateString(date: Date, timezone: string): string | null {
  const parts = getLocalParts(date, timezone);
  if (!parts) return null;
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function addCalendarDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function weekdayForDate(dateString: string): Weekday {
  const [year, month, day] = dateString.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function localTimeToUtc(
  dateString: string,
  minuteOfDay: number,
  timezone: string,
): Date | null {
  const [year, month, day] = dateString.split("-").map(Number);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const targetTimestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetTimestamp;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parts = getLocalParts(new Date(guess), timezone);
    if (!parts) return null;

    const representedTimestamp = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0,
    );
    const correctedGuess = guess + (targetTimestamp - representedTimestamp);
    if (correctedGuess === guess) break;
    guess = correctedGuess;
  }

  const result = new Date(guess);
  const verified = getLocalParts(result, timezone);
  if (
    !verified ||
    verified.year !== year ||
    verified.month !== month ||
    verified.day !== day ||
    verified.hour !== hour ||
    verified.minute !== minute ||
    verified.second !== 0 ||
    result.getUTCMilliseconds() !== 0
  ) {
    return null;
  }

  return result;
}

function formatLocalClock(date: Date, timezone: string): string | null {
  const parts = getLocalParts(date, timezone);
  if (!parts) return null;
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function findMatchingAvailability(
  start: Date,
  durationMinutes: number,
  availability: AvailabilityWindow[],
): AvailabilityWindow | null {
  if (
    !Number.isFinite(start.getTime()) ||
    start.getUTCSeconds() !== 0 ||
    start.getUTCMilliseconds() !== 0
  ) {
    return null;
  }

  for (const window of availability) {
    if (window.endMinute - window.startMinute !== durationMinutes) continue;
    const parts = getLocalParts(start, window.timezone);
    if (
      parts &&
      parts.second === 0 &&
      parts.weekday === window.day &&
      parts.hour * 60 + parts.minute === window.startMinute
    ) {
      return window;
    }
  }

  return null;
}

export function getLocalSchedule(
  start: Date,
  timezone: string,
): { weekday: Weekday; localStartMinute: number; localDate: string } | null {
  const parts = getLocalParts(start, timezone);
  const localDate = localDateString(start, timezone);
  if (!parts || !localDate || parts.second !== 0) return null;
  return {
    weekday: parts.weekday,
    localStartMinute: parts.hour * 60 + parts.minute,
    localDate,
  };
}

export function generateAvailabilitySlots(
  now: Date,
  availability: AvailabilityWindow[],
  durationMinutes: number,
  days = BOOKING_WINDOW_DAYS,
): AvailableSlot[] {
  const candidates = new Map<string, AvailableSlot>();

  for (const window of availability) {
    const today = localDateString(now, window.timezone);
    if (!today || window.endMinute - window.startMinute !== durationMinutes) continue;

    for (let offset = 0; offset <= days; offset += 1) {
      const localDate = addCalendarDays(today, offset);
      if (weekdayForDate(localDate) !== window.day) continue;

      const start = localTimeToUtc(localDate, window.startMinute, window.timezone);
      if (!start || start <= now) continue;

      const end = new Date(start.getTime() + durationMinutes * 60_000);
      const localStart = formatLocalClock(start, window.timezone);
      const localEnd = formatLocalClock(end, window.timezone);
      if (localStart === null || localEnd === null) continue;

      candidates.set(start.toISOString(), {
        start,
        end,
        timezone: window.timezone,
        localDate,
        localStart,
        localEnd,
      });
    }
  }

  return [...candidates.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}
