export const RANGE_WEEKS = [4, 8, 12, 26] as const;
export type RangeWeeks = (typeof RANGE_WEEKS)[number];

export type WeekPoint = { label: string; students: number; mates: number; requests: number; completed: number };
export type Kpi = { key: string; label: string; current: number; previous: number };
export type Slice = { label: string; value: number };

export type AnalyticsReport = {
  weeksShown: RangeWeeks;
  universityId: string | null;
  universityOptions: Array<{ id: string; code: string; name: string }>;
  kpis: Kpi[];
  weeks: WeekPoint[];
  /** Share of answered requests (accepted, declined or expired) in the period that were accepted. */
  acceptance: { current: number | null; previous: number | null; answered: number };
  /** Share of sessions that ended in the period that were completed. */
  completion: { current: number | null; previous: number | null; ended: number };
  rating: { average: number | null; count: number; distribution: number[] };
  requestMix: Slice[];
  sessionMix: Slice[];
  topCourses: Array<{ course: string; name: string; requests: number }>;
  byUniversity: Array<{ code: string; name: string; students: number; mates: number; requests: number }>;
};

export function parseRange(value: string | undefined): RangeWeeks {
  const number = Number(value);
  return (RANGE_WEEKS as readonly number[]).includes(number) ? (number as RangeWeeks) : 8;
}
