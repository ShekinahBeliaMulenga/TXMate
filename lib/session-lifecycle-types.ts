import type { CancellationInfo } from "@/lib/cancellation";

export type SessionViewerRole = "STUDENT" | "ACADEMIC_MATE";
export type SessionAttendance = {
  status: string;
  studentAttended: boolean | null;
  studentRespondedAt: string | null;
  studentAnswerChanges: number;
  mateConfirmedStudentAttended: boolean | null;
  mateRespondedAt: string | null;
  disputedAt: string | null;
  disputeReason: string | null;
  resolvedAt: string | null;
};
export type SessionLifecycleItem = {
  id: string;
  arrangementId: string;
  requestId: string;
  /** The offering (course) the session belongs to. */
  offeringId: string;
  /** Group this session shares with other students of the same Academic Mate slot. */
  groupId: string | null;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  meetingLocation: string;
  /** A venue the student proposed that the Academic Mate has not answered yet. */
  suggestedLocation: string | null;
  completedAt: string | null;
  studentCompletionConfirmedAt: string | null;
  mateCompletionConfirmedAt: string | null;
  completionDisputedAt: string | null;
  completionDisputedByUserId: string | null;
  completionDisputeReason: string | null;
  completionReviewRequiredAt: string | null;
  requestStatus: string;
  arrangementStatus: string;
  arrangementType: "ONE_TIME" | "RECURRING";
  recurrenceEndsAt: string | null;
  viewerRole: SessionViewerRole;
  studentName: string;
  academicMateName: string;
  otherParticipantName: string;
  otherParticipantImage: string | null;
  course: { code: string; name: string };
  attendance: SessionAttendance | null;
  /** Who cancelled it, when and why. Null unless the session or its arrangement is cancelled. */
  cancellation: CancellationInfo | null;
  detailUrl: string;
  conversationUrl: string;
};
export type GroupSheetRow = {
  sessionId: string;
  studentName: string;
  studentImage: string | null;
  /** What the student said: null until they respond. */
  studentAttended: boolean | null;
  studentRespondedAt: string | null;
  /** What the Academic Mate said: null until the group sheet is submitted. */
  mateAttended: boolean | null;
  outcome: "PENDING" | "VERIFIED" | "NO_SHOW" | "DISPUTED";
  /** Can the mate still answer for this student? */
  answerable: boolean;
  completionEligible: boolean;
  completionConfirmedByMate: boolean;
  studentConfirmedCompletion: boolean;
  needsReview: boolean;
  status: string;
  /** A venue this student proposed that the Academic Mate has not answered yet. */
  suggestedLocation: string | null;
};
export type GroupSheet = {
  id: string;
  course: { code: string; name: string };
  scheduledStart: string;
  scheduledEnd: string;
  meetingLocation: string;
  /** True when any student in the slot is on a weekly arrangement, so a venue can also cover later weeks. */
  recurring: boolean;
  attendanceOpensAt: string;
  attendanceSubmittedAt: string | null;
  completionSubmittedAt: string | null;
  rows: GroupSheetRow[];
  actions: { attendance: boolean; completion: boolean };
  detailUrl: string;
};
export type SessionLifecycleApiResponse = {
  session?: SessionLifecycleItem;
  sessions?: SessionLifecycleItem[];
  openLimitReached?: boolean;
  historyCount?: number;
  hasMoreHistory?: boolean;
  nextHistoryCursor?: string | null;
  error?: string;
  message?: string;
  status?: string;
};
