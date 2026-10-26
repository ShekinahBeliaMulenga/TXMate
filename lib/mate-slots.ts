/** A booked or proposed time, in epoch milliseconds, for one of the Academic Mate's offerings. */
export type MateSlot = { offeringId: string; start: number; end: number };

/**
 * An Academic Mate can only be in one place at a time. The one allowed overlap is a group
 * session: the same course at the exact same start and end as an existing session.
 */
export function clashesWithMateSession(candidate: MateSlot, existing: MateSlot[]): boolean {
  return existing.some((other) =>
    candidate.start < other.end && candidate.end > other.start &&
    !(other.offeringId === candidate.offeringId && other.start === candidate.start && other.end === candidate.end),
  );
}
