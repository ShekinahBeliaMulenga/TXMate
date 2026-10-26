import { prisma } from "@/lib/prisma";
import { SESSION_SELECT } from "@/lib/session-lifecycle-serialize";
import { attachSessionsToGroups, recordSnapshot, roleOf } from "@/lib/session-lifecycle-service";
import { REVIEW_PROMPT_WINDOW_DAYS, DAY_MS } from "@/lib/reviews";
import { PROMPT_WINDOW_MS, buildPrompts, type PromptInput, type SessionPrompt } from "@/lib/session-prompts-core";

const MAX_SESSIONS = 200;

/** The sessions that need this user's answer right now (server-side, authoritative). */
export async function getSessionPrompts(userId: string, now = new Date()): Promise<SessionPrompt[]> {
  const records = await prisma.tutoringSession.findMany({
    where: {
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      scheduledStart: { lte: now },
      scheduledEnd: { gte: new Date(now.getTime() - PROMPT_WINDOW_MS) },
      request: {
        is: {
          status: "ACCEPTED",
          arrangementStatus: { in: ["ACTIVE", "PAUSED"] },
          OR: [{ studentProfile: { userId } }, { offering: { academicMateProfile: { userId } } }],
        },
      },
    },
    orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
    take: MAX_SESSIONS,
    select: SESSION_SELECT,
  });
  const reviewInputs = await getReviewInputs(userId, now);
  if (records.length === 0) return buildPrompts(reviewInputs, now.getTime());

  // The Academic Mate answers once per group, so make sure their sessions are grouped.
  let groupIds = new Map<string, string>();
  try {
    groupIds = await attachSessionsToGroups(prisma, records
      .filter((record) => roleOf(record, userId) === "ACADEMIC_MATE")
      .map((record) => ({ id: record.id, offeringId: record.request.offeringId, scheduledStart: record.scheduledStart, scheduledEnd: record.scheduledEnd, groupId: record.groupId, group: record.group })));
  } catch (error) {
    console.error("Grouping sessions for prompts failed (prompts still served):", error);
  }

  const inputs: PromptInput[] = [];
  for (const record of records) {
    const role = roleOf(record, userId);
    if (!role) continue;
    inputs.push({
      id: record.id,
      groupId: role === "ACADEMIC_MATE" ? groupIds.get(record.id) ?? record.groupId : null,
      role,
      snapshot: recordSnapshot(record),
      courseCode: record.request.offering.course.code,
      courseName: record.request.offering.course.name,
      otherName: (role === "STUDENT" ? record.request.offering.academicMateProfile.user.name : record.request.studentProfile.user.name) || (role === "STUDENT" ? "your Academic Mate" : "the student"),
      scheduledStart: record.scheduledStart.toISOString(),
      scheduledEnd: record.scheduledEnd.toISOString(),
    });
  }
  return buildPrompts([...inputs, ...reviewInputs], now.getTime());
}

/** Completed sessions the student can still review: newest one per arrangement, none already reviewed. */
async function getReviewInputs(userId: string, now: Date): Promise<PromptInput[]> {
  const completed = await prisma.tutoringSession.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: new Date(now.getTime() - REVIEW_PROMPT_WINDOW_DAYS * DAY_MS) },
      request: { is: { studentProfile: { userId } } },
    },
    orderBy: [{ completedAt: "desc" }, { id: "asc" }],
    take: 20,
    select: {
      id: true, arrangementId: true, completedAt: true, scheduledStart: true, scheduledEnd: true,
      request: { select: { offering: { select: { course: { select: { code: true, name: true } }, academicMateProfile: { select: { userId: true, user: { select: { name: true } } } } } } } },
    },
  });
  if (completed.length === 0) return [];
  const reviewed = await prisma.review.findMany({
    where: { reviewerUserId: userId, session: { arrangementId: { in: completed.map((session) => session.arrangementId) } } },
    select: { session: { select: { arrangementId: true } } },
  });
  const skip = new Set(reviewed.map((review) => review.session.arrangementId));
  const seen = new Set<string>();
  const inputs: PromptInput[] = [];
  for (const session of completed) {
    const mate = session.request.offering.academicMateProfile;
    if (!session.completedAt || skip.has(session.arrangementId) || seen.has(session.arrangementId) || mate.userId === userId) continue;
    seen.add(session.arrangementId);
    inputs.push({
      id: session.id, groupId: null, role: "STUDENT",
      snapshot: { status: "COMPLETED", scheduledStart: session.scheduledStart, scheduledEnd: session.scheduledEnd, requestStatus: "ACCEPTED", arrangementStatus: "ACTIVE", completedAt: session.completedAt },
      courseCode: session.request.offering.course.code, courseName: session.request.offering.course.name,
      otherName: mate.user.name || "your Academic Mate",
      scheduledStart: session.scheduledStart.toISOString(), scheduledEnd: session.scheduledEnd.toISOString(),
      reviewOf: { completedAt: session.completedAt.toISOString() },
    });
  }
  return inputs;
}
