const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Counts dates per consecutive 7-day window starting at `start`. Dates outside the windows, and empty dates, are ignored. */
export function bucketByWeek(dates: ReadonlyArray<Date | null>, start: Date, weeks: number): number[] {
  const counts = new Array<number>(weeks).fill(0);
  for (const date of dates) {
    if (!date) continue;
    const index = Math.floor((date.getTime() - start.getTime()) / WEEK_MS);
    if (index >= 0 && index < weeks) counts[index] += 1;
  }
  return counts;
}

/** good / (good + bad), or null when there is nothing to measure. */
export function share(good: number, bad: number): number | null {
  return good + bad > 0 ? good / (good + bad) : null;
}
