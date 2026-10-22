import { prisma } from "@/lib/prisma";

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 500;

type ExpireOptions = {
  sessionId?: string;
  limit?: number;
};

export type RescheduleExpiryResult = {
  checked: number;
  expired: number;
  failed: number;
  hasMore: boolean;
};

/**
 * Expires pending rescheduling proposals once the original session start has
 * passed. This does not move or otherwise change the session itself.
 *
 * Called from the conversation read path (lazy enforcement) and from the
 * existing scheduler endpoint (background enforcement when the scheduler runs).
 */
export async function expirePendingRescheduleProposals(
  now: Date = new Date(),
  options: ExpireOptions = {},
): Promise<RescheduleExpiryResult> {
  const requestedLimit = options.limit ?? DEFAULT_BATCH_SIZE;
  const limit = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(requestedLimit)));

  const staleProposals = await prisma.sessionRescheduleRequest.findMany({
    where: {
      status: "PENDING",
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      session: {
        is: {
          scheduledStart: { lte: now },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true,
      sessionId: true,
      proposedByUserId: true,
      respondingUserId: true,
      proposedStart: true,
      proposedBy: { select: { name: true } },
      session: {
        select: {
          scheduledStart: true,
          request: {
            select: {
              id: true,
              recurrenceTimezone: true,
              studentProfile: { select: { user: { select: { name: true } } } },
              offering: {
                select: {
                  course: { select: { code: true, name: true } },
                  academicMateProfile: { select: { user: { select: { name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  let expired = 0;
  let failed = 0;

  for (const proposal of staleProposals) {
    try {
      const didExpire = await prisma.$transaction(async (tx) => {
        // Keep the eligibility condition in the write itself. If another
        // transaction has already rescheduled the session or resolved this
        // proposal, this update must not expire it based on stale read data.
        const claimed = await tx.sessionRescheduleRequest.updateMany({
          where: {
            id: proposal.id,
            status: "PENDING",
            session: {
              is: {
                scheduledStart: { lte: now },
              },
            },
          },
          data: {
            status: "EXPIRED",
            respondedAt: now,
          },
        });

        if (claimed.count !== 1) return false;

        const request = proposal.session.request;
        const courseCode = request.offering.course.code;
        const courseName = request.offering.course.name;
        const timezone = request.recurrenceTimezone || "Africa/Lusaka";
        const studentName = request.studentProfile.user.name || "the student";
        const mateName = request.offering.academicMateProfile.user.name || "the Academic Mate";
        const proposerName = proposal.proposedBy.name || "The other participant";
        const formatTime = (value: Date) => {
          try {
            return new Intl.DateTimeFormat("en-ZM", {
              timeZone: timezone, weekday: "short", day: "numeric", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit", hourCycle: "h23",
            }).format(value);
          } catch {
            return value.toISOString();
          }
        };
        const originalTime = formatTime(proposal.session.scheduledStart);
        const proposedTime = formatTime(proposal.proposedStart);
        const title = `${courseCode} rescheduling proposal expired`;
        const conversationUrl = `/student/sessions/${encodeURIComponent(proposal.sessionId)}/conversation`;
        const commonData = {
          sessionId: proposal.sessionId,
          requestId: request.id,
          rescheduleRequestId: proposal.id,
          courseCode,
          courseName,
          originalStart: proposal.session.scheduledStart.toISOString(),
          proposedStart: proposal.proposedStart.toISOString(),
          studentName,
          academicMateName: mateName,
          proposedByName: proposerName,
          url: conversationUrl,
          conversationUrl,
        };
        const proposerBody = `Your rescheduling proposal for ${courseCode} · ${courseName}, from ${originalTime} to ${proposedTime} (${timezone}), expired because it was not accepted before the original session started. The session was not moved.`;
        const responderBody = `${proposerName}'s rescheduling proposal for ${courseCode} · ${courseName}, from ${originalTime} to ${proposedTime} (${timezone}), expired because the original session start passed before it was accepted. The session was not moved.`;

        await tx.notification.createMany({
          data: [
            {
              userId: proposal.proposedByUserId,
              type: "SYSTEM",
              title,
              body: proposerBody,
              data: commonData,
            },
            {
              userId: proposal.respondingUserId,
              type: "SYSTEM",
              title,
              body: responderBody,
              data: commonData,
            },
          ],
        });

        return true;
      }, { maxWait: 10_000, timeout: 10_000 });

      if (didExpire) expired++;
    } catch (error) {
      failed++;
      console.error(
        `Failed to expire rescheduling proposal ${proposal.id}:`,
        error,
      );
    }
  }

  return {
    checked: staleProposals.length,
    expired,
    failed,
    hasMore: staleProposals.length === limit,
  };
}
