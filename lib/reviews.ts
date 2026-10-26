/**
 * Pure rules for session reviews. One review per student per arrangement (so a weekly
 * recurring student can't pile up ratings), written after a session is completed.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
/** The review prompt stops after this long. */
export const REVIEW_PROMPT_WINDOW_DAYS = 14;
/** A student can edit their review for this long after writing it. */
export const REVIEW_EDIT_WINDOW_DAYS = 30;
export const REVIEW_COMMENT_MAX = 500;

export type ReviewInput = { rating: unknown; comment?: unknown };
export type ReviewValue = { rating: number; comment: string | null };

/** Checks a rating (whole number 1–5) and tidies the optional comment. */
export function parseReviewInput(input: ReviewInput): { ok: true; value: ReviewValue } | { ok: false; message: string } {
  const rating = input.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, message: "Choose a rating from 1 to 5 stars." };
  let comment: string | null = null;
  if (input.comment !== undefined && input.comment !== null) {
    if (typeof input.comment !== "string") return { ok: false, message: "Your comment couldn't be read." };
    // Drop control characters, collapse long blank runs, trim.
    const cleaned = input.comment.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim();
    if (cleaned.length > REVIEW_COMMENT_MAX) return { ok: false, message: `Keep your comment to ${REVIEW_COMMENT_MAX} characters or fewer.` };
    comment = cleaned.length > 0 ? cleaned : null;
  }
  return { ok: true, value: { rating, comment } };
}

export function reviewEditableUntil(createdAt: Date | string | number): number {
  return new Date(createdAt).getTime() + REVIEW_EDIT_WINDOW_DAYS * DAY_MS;
}
export function reviewPromptOpen(completedAt: Date | string | number | null | undefined, now: number): boolean {
  if (completedAt === null || completedAt === undefined) return false;
  const completed = new Date(completedAt).getTime();
  return Number.isFinite(completed) && now >= completed && now <= completed + REVIEW_PROMPT_WINDOW_DAYS * DAY_MS;
}

export type RatingSummary = { count: number; average: number | null; distribution: Record<1 | 2 | 3 | 4 | 5, number> };
/** Builds the summary from per-star counts, e.g. [{ rating: 5, count: 8 }, ...]. */
export function summarizeRatings(rows: { rating: number; count: number }[]): RatingSummary {
  const distribution: RatingSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const row of rows) {
    if (!Number.isInteger(row.rating) || row.rating < 1 || row.rating > 5 || row.count <= 0) continue;
    distribution[row.rating as 1 | 2 | 3 | 4 | 5] += row.count;
    total += row.count;
    sum += row.rating * row.count;
  }
  return { count: total, average: total > 0 ? Number((sum / total).toFixed(2)) : null, distribution };
}
