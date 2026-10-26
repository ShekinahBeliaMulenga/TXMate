import { prisma } from "@/lib/prisma";
import { notifyOnce } from "@/lib/notify";
import { parseReviewInput, reviewEditableUntil, summarizeRatings, type RatingSummary } from "@/lib/reviews";

export type ReviewView = { id: string; rating: number; comment: string | null; createdAt: string; editable: boolean; editableUntil: string };
export type ReviewState = { canReview: boolean; reason: string | null; review: ReviewView | null };
export type ReviewResult =
  | { ok: true; message: string; review: ReviewView }
  | { ok: false; status: number; message: string };

const fail = (status: number, message: string): ReviewResult => ({ ok: false, status, message });

/** The query for the review a student already wrote for any session of this arrangement. */
const arrangementReview = (userId: string, arrangementId: string) => ({
  where: { reviewerUserId: userId, session: { arrangementId } },
  select: { id: true, rating: true, comment: true, createdAt: true },
  orderBy: { createdAt: "asc" },
} as const);

const SESSION_FOR_REVIEW = {
  id: true,
  status: true,
  completedAt: true,
  arrangementId: true,
  request: {
    select: {
      studentProfile: { select: { userId: true, user: { select: { name: true } } } },
      offering: { select: { course: { select: { code: true, name: true } }, academicMateProfile: { select: { id: true, userId: true } } } },
    },
  },
} as const;

function viewOf(review: { id: string; rating: number; comment: string | null; createdAt: Date }, now: number): ReviewView {
  const until = reviewEditableUntil(review.createdAt);
  return { id: review.id, rating: review.rating, comment: review.comment, createdAt: review.createdAt.toISOString(), editable: now <= until, editableUntil: new Date(until).toISOString() };
}

/** Whether this user may review the session, and the review they already left. Null if not theirs. */
export async function getReviewState(userId: string, sessionId: string, now = Date.now()): Promise<ReviewState | { error: "NOT_FOUND" | "FORBIDDEN" }> {
  const session = await prisma.tutoringSession.findUnique({ where: { id: sessionId }, select: SESSION_FOR_REVIEW });
  if (!session) return { error: "NOT_FOUND" };
  const student = session.request.studentProfile.userId;
  const mate = session.request.offering.academicMateProfile.userId;
  if (userId !== student && userId !== mate) return { error: "FORBIDDEN" };
  if (userId !== student) return { canReview: false, reason: "Only the student can review a session.", review: null };
  const existing = await prisma.review.findFirst(arrangementReview(userId, session.arrangementId));
  if (existing) return { canReview: false, reason: null, review: viewOf(existing, now) };
  if (session.status !== "COMPLETED" || !session.completedAt) return { canReview: false, reason: "You can review once the session is completed.", review: null };
  return { canReview: true, reason: null, review: null };
}

/**
 * Creates the student's review for this arrangement, or edits it while the edit window is open.
 * One review per student per arrangement, whichever of its sessions they reviewed from.
 */
export async function submitReview(input: { userId: string; sessionId: string; rating: unknown; comment?: unknown }): Promise<ReviewResult> {
  const parsed = parseReviewInput({ rating: input.rating, comment: input.comment });
  if (!parsed.ok) return fail(400, parsed.message);
  const { rating, comment } = parsed.value;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const session = await tx.tutoringSession.findUnique({ where: { id: input.sessionId }, select: SESSION_FOR_REVIEW });
    if (!session) return fail(404, "Session not found.");
    const student = session.request.studentProfile;
    const mate = session.request.offering.academicMateProfile;
    if (input.userId !== student.userId) return fail(403, input.userId === mate.userId ? "Only the student can review a session." : "You are not a participant in this session.");
    if (student.userId === mate.userId) return fail(403, "You can't review yourself.");

    // Serialises two quick submits for the same arrangement.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`review:${session.arrangementId}`}, 0))`;
    const existing = await tx.review.findFirst(arrangementReview(input.userId, session.arrangementId));
    if (existing) {
      if (now.getTime() > reviewEditableUntil(existing.createdAt)) return fail(409, "Your review can no longer be edited.");
      const updated = await tx.review.update({ where: { id: existing.id }, data: { rating, comment }, select: { id: true, rating: true, comment: true, createdAt: true } });
      return { ok: true as const, message: "Review updated.", review: viewOf(updated, now.getTime()) };
    }
    if (session.status !== "COMPLETED" || !session.completedAt) return fail(409, "You can review once the session is completed.");

    const created = await tx.review.create({
      data: { sessionId: session.id, reviewerUserId: input.userId, mateProfileId: mate.id, rating, comment },
      select: { id: true, rating: true, comment: true, createdAt: true },
    });
    const course = session.request.offering.course;
    await notifyOnce(tx, [{
      userId: mate.userId, type: "REVIEW_RECEIVED", dedupeKey: `review:${created.id}`,
      title: `New ${rating}-star review`,
      body: `${student.user.name || "A student"} rated your ${course.code} session ${rating} out of 5.`,
      url: "/student/academic-mate/profile", data: { reviewId: created.id, event: "REVIEW_RECEIVED" },
    }]);
    return { ok: true as const, message: "Thanks for your review.", review: viewOf(created, now.getTime()) };
  }, { timeout: 15_000 });
}

/** Star counts, average and total for one Academic Mate. */
export async function getRatingSummary(mateProfileId: string): Promise<RatingSummary> {
  const rows = await prisma.review.groupBy({ by: ["rating"], where: { mateProfileId }, _count: { _all: true } });
  return summarizeRatings(rows.map((row) => ({ rating: row.rating, count: row._count._all })));
}
