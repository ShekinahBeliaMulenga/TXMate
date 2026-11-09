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
  /**
   * Completion rate among sessions with a reportable outcome: completed, no-show, cancelled, needs review, or no response.
   * Sessions still awaiting confirmation within the 24-hour window are excluded. Only sessions whose scheduled end fell
   * in the period count. `parts` lists each outcome for the current period.
   */
  completion: { current: number | null; previous: number | null; ended: number; parts: Slice[] };
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
