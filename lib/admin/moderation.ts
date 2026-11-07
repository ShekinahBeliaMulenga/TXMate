import { dayRangeFilter } from "./date-range";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit";
import type { AdminContext } from "./guard";
import { canAccessUniversity } from "./permissions";
import type { RequestContext } from "./request-context";
import { REASON_MAX, REASON_MIN, REVIEW_PAGE_SIZE, type ConversationView, type ReviewPage } from "./moderation-types";
import { sessionScope } from "./disputes";

type Fail = { ok: false; status: 400 | 403 | 404 | 409; error: string };
const fail = (status: 400 | 403 | 404 | 409, error: string): Fail => ({ ok: false, status, error });
const reasonProblem = (reason: string) => (reason.length < REASON_MIN || reason.length > REASON_MAX ? `Give a reason of ${REASON_MIN} to ${REASON_MAX} characters.` : null);

// ------------------------------------------------------------------ reviews

export async function listReviews(admin: AdminContext, input: { q: string; state: string; page: number; from?: string; to?: string }): Promise<ReviewPage> {
  const page = Math.max(1, Math.min(10000, Math.floor(input.page) || 1));
  const q = input.q.trim().slice(0, 100);
  const written = dayRangeFilter(input.from, input.to);
  const where = {
    session: { is: sessionScope(admin) },
    ...(written ? { createdAt: written } : {}),
    ...(input.state === "hidden" ? { hiddenAt: { not: null } } : input.state === "visible" ? { hiddenAt: null } : {}),
    ...(q ? { OR: [{ comment: { contains: q, mode: "insensitive" as const } }, { reviewerUser: { is: { name: { contains: q, mode: "insensitive" as const } } } }, { mateProfile: { is: { user: { is: { name: { contains: q, mode: "insensitive" as const } } } } } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * REVIEW_PAGE_SIZE,
      take: REVIEW_PAGE_SIZE,
      select: {
        id: true, rating: true, comment: true, createdAt: true, hiddenAt: true, hiddenReason: true,
        reviewerUser: { select: { name: true } },
        mateProfile: { select: { user: { select: { name: true } }, university: { select: { code: true } } } },
        session: { select: { request: { select: { offering: { select: { course: { select: { code: true } } } } } } } },
      },
    }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      reviewer: row.reviewerUser.name,
      mate: row.mateProfile.user.name,
      course: row.session.request.offering.course.code,
      university: row.mateProfile.university.code,
      hidden: row.hiddenAt !== null,
      hiddenReason: row.hiddenReason,
    })),
    page,
    pageCount: Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE)),
    total,
  };
}

/** Hides or restores one review. A hidden review stays on record but is not shown to students or counted in ratings. */
export async function setReviewHidden(admin: AdminContext, input: { reviewId: string; hidden: boolean; reason: string; context: RequestContext }): Promise<{ ok: true; message: string } | Fail> {
  const reason = input.reason.trim();
  const problem = reasonProblem(reason);
  if (problem) return fail(400, problem);
  return prisma.$transaction(async (tx) => {
    const review = await tx.review.findUnique({ where: { id: input.reviewId }, select: { id: true, hiddenAt: true, mateProfile: { select: { universityId: true, user: { select: { name: true } } } } } });
    if (!review || !canAccessUniversity(admin.scope, review.mateProfile.universityId)) return fail(404, "Review not found.");
    if (input.hidden === (review.hiddenAt !== null)) return fail(409, input.hidden ? "This review is already hidden." : "This review is not hidden.");
    await tx.review.update({ where: { id: review.id }, data: input.hidden ? { hiddenAt: new Date(), hiddenByAdminId: admin.adminId, hiddenReason: reason } : { hiddenAt: null, hiddenByAdminId: null, hiddenReason: null } });
    await recordAudit(tx, {
      actor: admin,
      action: input.hidden ? "REVIEW_HIDDEN" : "REVIEW_RESTORED",
      targetType: "REVIEW",
      targetId: review.id,
      universityId: review.mateProfile.universityId,
      summary: `${input.hidden ? "Hid" : "Restored"} a review of ${review.mateProfile.user.name}`,
      metadata: { reason },
      context: input.context,
    });
    return { ok: true as const, message: input.hidden ? "Review hidden." : "Review restored." };
  });
}

// ----------------------------------------------------------------- messages

const MESSAGE_LIMIT = 200;

/**
 * Reads the conversation of one request. Private messages are sensitive, so a reason is required,
 * the read is written to the audit log in the same transaction, and only roles with messages:view get here.
 */
export async function viewConversation(admin: AdminContext, input: { requestId: string; reason: string; context: RequestContext }): Promise<({ ok: true } & ConversationView) | Fail> {
  const reason = input.reason.trim();
  const problem = reasonProblem(reason);
  if (problem) return fail(400, problem);
  return prisma.$transaction(async (tx) => {
    const request = await tx.mateRequest.findUnique({ where: { id: input.requestId }, select: { id: true, universityId: true, conversation: { select: { id: true, studentMessagingEnabled: true } } } });
    if (!request || !canAccessUniversity(admin.scope, request.universityId)) return fail(404, "Request not found.");
    if (!request.conversation) return fail(404, "This request has no conversation yet.");
    const rows = await tx.message.findMany({
      where: { conversationId: request.conversation.id },
      orderBy: { createdAt: "desc" },
      take: MESSAGE_LIMIT + 1,
      select: { id: true, body: true, createdAt: true, senderUser: { select: { name: true } } },
    });
    await recordAudit(tx, { actor: admin, action: "MESSAGES_VIEWED", targetType: "CONVERSATION", targetId: request.conversation.id, universityId: request.universityId, summary: "Read a conversation", metadata: { requestId: request.id, reason }, context: input.context });
    return {
      ok: true as const,
      messagingEnabled: request.conversation.studentMessagingEnabled,
      more: rows.length > MESSAGE_LIMIT,
      messages: rows.slice(0, MESSAGE_LIMIT).reverse().map((row) => ({ id: row.id, sender: row.senderUser.name, body: row.body, createdAt: row.createdAt.toISOString() })),
    };
  });
}

/** Turns the student's ability to send messages in one conversation off or on. */
export async function setMessagingEnabled(admin: AdminContext, input: { requestId: string; enabled: boolean; reason: string; context: RequestContext }): Promise<{ ok: true; message: string } | Fail> {
  const reason = input.reason.trim();
  const problem = reasonProblem(reason);
  if (problem) return fail(400, problem);
  return prisma.$transaction(async (tx) => {
    const request = await tx.mateRequest.findUnique({ where: { id: input.requestId }, select: { id: true, universityId: true, conversation: { select: { id: true, studentMessagingEnabled: true } } } });
    if (!request || !canAccessUniversity(admin.scope, request.universityId)) return fail(404, "Request not found.");
    if (!request.conversation) return fail(404, "This request has no conversation yet.");
    if (request.conversation.studentMessagingEnabled === input.enabled) return fail(409, input.enabled ? "Messaging is already on." : "Messaging is already off.");
    await tx.conversation.update({ where: { id: request.conversation.id }, data: { studentMessagingEnabled: input.enabled } });
    await recordAudit(tx, { actor: admin, action: input.enabled ? "MESSAGING_ENABLED" : "MESSAGING_DISABLED", targetType: "CONVERSATION", targetId: request.conversation.id, universityId: request.universityId, summary: `${input.enabled ? "Turned on" : "Turned off"} the student’s messaging in a conversation`, metadata: { reason }, context: input.context });
    return { ok: true as const, message: input.enabled ? "Messaging turned on." : "Messaging turned off." };
  });
}
