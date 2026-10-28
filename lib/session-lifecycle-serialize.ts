import type { TutoringSessionGetPayload } from "@/generated/prisma/models/TutoringSession";
import type { SessionLifecycleItem } from "@/lib/session-lifecycle-types";
import type { LifecycleSnapshot } from "@/lib/session-lifecycle-rules";
import { buildCancellation } from "@/lib/cancellation";

/** The one select used everywhere a session is shown to a participant. */
export const SESSION_SELECT = {
  id: true,
  arrangementId: true,
  groupId: true,
  group: { select: { scheduledStart: true, scheduledEnd: true } },
  status: true,
  scheduledStart: true,
  scheduledEnd: true,
  meetingLocation: true,
  suggestedLocation: true,
  completedAt: true,
  studentCompletionConfirmedAt: true,
  mateCompletionConfirmedAt: true,
  completionDisputedAt: true,
  completionDisputedByUserId: true,
  completionDisputeReason: true,
  completionReviewRequiredAt: true,
  completionPromptSentAt: true,
  cancelledAt: true,
  cancellationReason: true,
  cancelledByUserId: true,
  request: {
    select: {
      id: true,
      offeringId: true,
      status: true,
      arrangementStatus: true,
      arrangementType: true,
      recurrenceEndsAt: true,
      arrangementCancelledAt: true,
      arrangementCancelledByUserId: true,
      arrangementCancellationReason: true,
      studentProfile: { select: { userId: true, user: { select: { name: true, image: true } } } },
      offering: {
        select: {
          course: { select: { code: true, name: true } },
          academicMateProfile: { select: { userId: true, user: { select: { name: true, image: true } } } },
        },
      },
    },
  },
  attendance: {
    select: {
      status: true,
      studentAttended: true,
      studentRespondedAt: true,
      studentAnswerChanges: true,
      mateConfirmedStudentAttended: true,
      mateRespondedAt: true,
      disputedAt: true,
      disputeReason: true,
      resolvedAt: true,
    },
  },
} as const;

export type SessionRecord = TutoringSessionGetPayload<{ select: typeof SESSION_SELECT }>;

export function serializeSession(record: SessionRecord, userId: string): SessionLifecycleItem {
  const student = record.request.studentProfile;
  const mate = record.request.offering.academicMateProfile;
  const viewerRole = student.userId === userId ? "STUDENT" as const : "ACADEMIC_MATE" as const;
  const other = viewerRole === "STUDENT" ? mate.user : student.user;
  return {
    id: record.id,
    arrangementId: record.arrangementId,
    requestId: record.request.id,
    offeringId: record.request.offeringId,
    groupId: record.groupId,
    status: record.status,
    scheduledStart: record.scheduledStart.toISOString(),
    scheduledEnd: record.scheduledEnd.toISOString(),
    meetingLocation: record.meetingLocation,
    suggestedLocation: record.suggestedLocation,
    completedAt: record.completedAt?.toISOString() ?? null,
    studentCompletionConfirmedAt: record.studentCompletionConfirmedAt?.toISOString() ?? null,
    mateCompletionConfirmedAt: record.mateCompletionConfirmedAt?.toISOString() ?? null,
    completionDisputedAt: record.completionDisputedAt?.toISOString() ?? null,
    completionDisputedByUserId: record.completionDisputedByUserId,
    completionDisputeReason: record.completionDisputeReason,
    completionReviewRequiredAt: record.completionReviewRequiredAt?.toISOString() ?? null,
    requestStatus: record.request.status,
    arrangementStatus: record.request.arrangementStatus,
    arrangementType: record.request.arrangementType,
    recurrenceEndsAt: record.request.recurrenceEndsAt?.toISOString() ?? null,
    viewerRole,
    studentName: student.user.name || "Student",
    academicMateName: mate.user.name || "Academic Mate",
    otherParticipantName: other.name || (viewerRole === "STUDENT" ? "Academic Mate" : "Student"),
    otherParticipantImage: other.image,
    course: record.request.offering.course,
    cancellation: buildCancellation({
      viewerUserId: userId,
      studentUserId: student.userId,
      studentName: student.user.name,
      mateUserId: mate.userId,
      mateName: mate.user.name,
      arrangementType: record.request.arrangementType,
      arrangementStatus: record.request.arrangementStatus,
      session: {
        status: record.status,
        cancelledAt: record.cancelledAt,
        cancelledByUserId: record.cancelledByUserId,
        cancellationReason: record.cancellationReason,
      },
      arrangement: {
        cancelledAt: record.request.arrangementCancelledAt,
        cancelledByUserId: record.request.arrangementCancelledByUserId,
        cancellationReason: record.request.arrangementCancellationReason,
      },
    }),
    attendance: record.attendance ? {
      status: record.attendance.status,
      studentAttended: record.attendance.studentAttended,
      studentRespondedAt: record.attendance.studentRespondedAt?.toISOString() ?? null,
      studentAnswerChanges: record.attendance.studentAnswerChanges,
      mateConfirmedStudentAttended: record.attendance.mateConfirmedStudentAttended,
      mateRespondedAt: record.attendance.mateRespondedAt?.toISOString() ?? null,
      disputedAt: record.attendance.disputedAt?.toISOString() ?? null,
      disputeReason: record.attendance.disputeReason,
      resolvedAt: record.attendance.resolvedAt?.toISOString() ?? null,
    } : null,
    detailUrl: `/student/sessions/${encodeURIComponent(record.id)}`,
    conversationUrl: `/student/sessions/${encodeURIComponent(record.id)}/conversation`,
  };
}

/** Shape the pure rules in `session-lifecycle-rules.ts` understand. */
export function snapshotOf(item: SessionLifecycleItem): LifecycleSnapshot {
  return {
    status: item.status,
    scheduledStart: item.scheduledStart,
    scheduledEnd: item.scheduledEnd,
    requestStatus: item.requestStatus,
    arrangementStatus: item.arrangementStatus,
    completedAt: item.completedAt,
    studentCompletionConfirmedAt: item.studentCompletionConfirmedAt,
    mateCompletionConfirmedAt: item.mateCompletionConfirmedAt,
    completionDisputedAt: item.completionDisputedAt,
    completionReviewRequiredAt: item.completionReviewRequiredAt,
    attendance: item.attendance,
  };
}
