import type { prisma as PrismaInstance } from "@/lib/prisma";
import type { MateRequestWhereInput } from "@/generated/prisma/models/MateRequest";
import { NO_RESPONSE_AFTER_MS } from "@/lib/session-lifecycle-rules";

/** Works with the shared client or a transaction handle. */
type Db = Pick<typeof PrismaInstance, "mateRequest">;

/**
 * Closes one-time arrangements whose only session ended more than 24h ago with nobody answering,
 * so they stop blocking a new request for the same offering. Anything with a dispute, a problem
 * report or even one completion confirmation is left alone: those need a person to look at them.
 * Never completes anything. Safe to call repeatedly; each call is one conditional UPDATE.
 */
export async function expireStaleOneTimeArrangements(
  db: Db,
  now: Date,
  scope: Pick<MateRequestWhereInput, "studentProfileId" | "offeringId" | "OR"> = {},
): Promise<number> {
  const cutoff = new Date(now.getTime() - NO_RESPONSE_AFTER_MS);
  const result = await db.mateRequest.updateMany({
    where: {
      ...scope,
      status: "ACCEPTED",
      arrangementType: "ONE_TIME",
      arrangementStatus: "ACTIVE",
      tutoringSession: {
        is: {
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          scheduledEnd: { lt: cutoff },
          studentCompletionConfirmedAt: null,
          mateCompletionConfirmedAt: null,
          completionDisputedAt: null,
          completionReviewRequiredAt: null,
          NOT: { attendance: { is: { status: "DISPUTED" } } },
        },
      },
    },
    data: { arrangementStatus: "EXPIRED" },
  });
  return result.count;
}

/** Expires stale arrangements the given user is part of, as student or Academic Mate. Never throws. */
export async function expireStaleForUser(db: Db, userId: string, now = new Date()): Promise<void> {
  try {
    await expireStaleOneTimeArrangements(db, now, {
      OR: [{ studentProfile: { userId } }, { offering: { academicMateProfile: { userId } } }],
    });
  } catch (error) {
    console.error("Expiring stale one-time arrangements failed (list still served):", error);
  }
}

/**
 * A finished one-time session that is stuck under review (disputed, mismatched attendance, an
 * overdue confirmation) or ended as a no-show must not lock the student out of that offering
 * while it waits. The arrangement is closed so a fresh request is possible; the session keeps
 * its status, so the dispute stays visible and nothing is ever marked completed.
 * Student-scoped on purpose: it only runs when that student is about to request again.
 */
export async function releaseStuckOneTimeArrangements(
  db: Db,
  now: Date,
  scope: Pick<MateRequestWhereInput, "studentProfileId" | "offeringId">,
): Promise<number> {
  const result = await db.mateRequest.updateMany({
    where: {
      ...scope,
      status: "ACCEPTED",
      arrangementType: "ONE_TIME",
      arrangementStatus: "ACTIVE",
      tutoringSession: {
        is: {
          scheduledEnd: { lt: now },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          OR: [
            { status: { in: ["DISPUTED", "NO_SHOW"] } },
            { completionDisputedAt: { not: null } },
            { completionReviewRequiredAt: { not: null } },
            { attendance: { is: { status: "DISPUTED" } } },
          ],
        },
      },
    },
    data: { arrangementStatus: "EXPIRED" },
  });
  return result.count;
}

/** Everything that may stop this student requesting an offering again, cleared in one call. */
export async function releaseStudentRequestBlocks(
  db: Db,
  now: Date,
  scope: Pick<MateRequestWhereInput, "studentProfileId" | "offeringId">,
): Promise<void> {
  await expireStaleOneTimeArrangements(db, now, scope);
  await releaseStuckOneTimeArrangements(db, now, scope);
}
