/**
 * Pure rules for the session attendance + completion workflow.
 *
 * Nothing in this file touches the database or the clock: every function takes the
 * session snapshot and `now`. The API routes, the scheduler and the UI all import the
 * same rules, so what a user sees can never disagree with what the server enforces.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
/** Students may confirm attendance this long after the scheduled start. */
export const STUDENT_ATTENDANCE_DELAY_MS = 20 * MINUTE_MS;
/** The Academic Mate may confirm attendance from this long before the scheduled end. */
export const MATE_ATTENDANCE_LEAD_MS = 10 * MINUTE_MS;
/** After the first completion confirmation, the other side has this long to answer. */
export const COMPLETION_DEADLINE_MS = 12 * HOUR_MS;
/** A student may change an attendance answer at most this many times. */
export const MAX_STUDENT_ANSWER_CHANGES = 3;
/** A student can only correct an attendance answer for this long after giving it. */
export const ANSWER_CHANGE_WINDOW_MS = 10 * MINUTE_MS;
/** A finished session nobody has resolved for this long is filed as "No response". */
export const NO_RESPONSE_AFTER_MS = 24 * HOUR_MS;

export type Role = "STUDENT" | "ACADEMIC_MATE";
type TimeInput = Date | string | number | null | undefined;

export type LifecycleSnapshot = {
  status: string;
  scheduledStart: TimeInput;
  scheduledEnd: TimeInput;
  requestStatus: string;
  arrangementStatus: string;
  completedAt?: TimeInput;
  studentCompletionConfirmedAt?: TimeInput;
  mateCompletionConfirmedAt?: TimeInput;
  completionDisputedAt?: TimeInput;
  completionReviewRequiredAt?: TimeInput;
  attendance?: {
    status: string;
    studentAttended: boolean | null;
    mateConfirmedStudentAttended: boolean | null;
    studentAnswerChanges?: number | null;
    studentRespondedAt?: TimeInput;
  } | null;
};

export function toMs(value: TimeInput): number | null {
  if (value === null || value === undefined) return null;
  const result = value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

// ---------------------------------------------------------------- attendance

export type AttendanceOutcome = "PENDING" | "VERIFIED" | "NO_SHOW" | "DISPUTED";

/** Compare the two independent attendance answers. `null` means "not answered yet". */
export function compareAttendance(studentAttended: boolean | null, mateSaysAttended: boolean | null): AttendanceOutcome {
  if (studentAttended === null || mateSaysAttended === null) return "PENDING";
  if (studentAttended && mateSaysAttended) return "VERIFIED";
  if (!studentAttended && !mateSaysAttended) return "NO_SHOW";
  return "DISPUTED";
}

export function studentAttendanceOpensAt(start: number): number {
  return start + STUDENT_ATTENDANCE_DELAY_MS;
}
/** Never before the session starts, otherwise 10 minutes before it ends. */
export function mateAttendanceOpensAt(start: number, end: number): number {
  return Math.max(start, end - MATE_ATTENDANCE_LEAD_MS);
}
export function attendanceOpensAt(role: Role, start: number, end: number): number {
  return role === "STUDENT" ? studentAttendanceOpensAt(start) : mateAttendanceOpensAt(start, end);
}

export function attendanceOutcome(snapshot: LifecycleSnapshot): AttendanceOutcome {
  const attendance = snapshot.attendance;
  if (!attendance) return "PENDING";
  if (attendance.status === "DISPUTED") return "DISPUTED";
  return compareAttendance(attendance.studentAttended, attendance.mateConfirmedStudentAttended);
}

// ---------------------------------------------------------------- completion

export function firstCompletionConfirmedAt(snapshot: LifecycleSnapshot): number | null {
  const values = [toMs(snapshot.studentCompletionConfirmedAt), toMs(snapshot.mateCompletionConfirmedAt)].filter((v): v is number => v !== null);
  return values.length ? Math.min(...values) : null;
}
/** When the second confirmation is due; null until someone has confirmed. */
export function completionDeadlineAt(snapshot: LifecycleSnapshot): number | null {
  const first = firstCompletionConfirmedAt(snapshot);
  return first === null ? null : first + COMPLETION_DEADLINE_MS;
}
export function bothConfirmedCompletion(snapshot: LifecycleSnapshot): boolean {
  return toMs(snapshot.studentCompletionConfirmedAt) !== null && toMs(snapshot.mateCompletionConfirmedAt) !== null;
}
export function completionDeadlineExpired(snapshot: LifecycleSnapshot, now: number): boolean {
  const deadline = completionDeadlineAt(snapshot);
  return deadline !== null && !bothConfirmedCompletion(snapshot) && toMs(snapshot.completedAt) === null && now >= deadline;
}

// ------------------------------------------------------------------- status

export function isCancelled(snapshot: LifecycleSnapshot): boolean {
  // Cancelling this session itself always counts.
  if (snapshot.status === "CANCELLED") return true;
  // Cancelling the arrangement later must not rewrite an outcome that was already recorded.
  const hasRecordedOutcome = snapshot.status === "COMPLETED" || snapshot.status === "NO_SHOW" || snapshot.status === "DISPUTED" ||
    toMs(snapshot.completedAt) !== null || snapshot.attendance?.status === "DISPUTED" ||
    toMs(snapshot.completionDisputedAt) !== null || toMs(snapshot.completionReviewRequiredAt) !== null;
  if (hasRecordedOutcome) return false;
  return snapshot.requestStatus === "CANCELLED" || snapshot.arrangementStatus === "CANCELLED";
}

/** True when the session is still live enough to accept attendance/completion answers. */
export function acceptsResponses(snapshot: LifecycleSnapshot): boolean {
  if (isCancelled(snapshot)) return false;
  if (snapshot.requestStatus !== "ACCEPTED") return false;
  if (!["SCHEDULED", "IN_PROGRESS"].includes(snapshot.status)) return false;
  if (toMs(snapshot.completedAt) !== null) return false;
  if (snapshot.arrangementStatus === "ACTIVE") return true;
  // A paused arrangement still lets an already running session be wrapped up.
  return snapshot.arrangementStatus === "PAUSED" && snapshot.status === "IN_PROGRESS";
}

export function needsReview(snapshot: LifecycleSnapshot, now: number): boolean {
  if (snapshot.status === "CANCELLED" || snapshot.status === "COMPLETED" || toMs(snapshot.completedAt) !== null) return false;
  return snapshot.status === "DISPUTED" ||
    snapshot.attendance?.status === "DISPUTED" ||
    toMs(snapshot.completionDisputedAt) !== null ||
    toMs(snapshot.completionReviewRequiredAt) !== null ||
    completionDeadlineExpired(snapshot, now);
}

/** Time status: where the session sits on the clock, independent of any answers. */
export type TimeStatus = "UPCOMING" | "IN_PROGRESS" | "PAST";
export function timeStatus(snapshot: LifecycleSnapshot, now: number): TimeStatus {
  const start = toMs(snapshot.scheduledStart);
  const end = toMs(snapshot.scheduledEnd);
  if (start === null || end === null) return "UPCOMING";
  if (now < start) return "UPCOMING";
  if (now < end) return "IN_PROGRESS";
  return "PAST";
}

/** Resolution status: whether the session still needs anyone, independent of the clock. */
export type ResolutionStatus = "NONE" | "AWAITING_CONFIRMATION" | "NEEDS_REVIEW" | "NO_RESPONSE" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
export function resolutionStatus(snapshot: LifecycleSnapshot, now: number): ResolutionStatus {
  // Individual outcomes come first; only an unresolved session inherits its arrangement's cancellation.
  if (snapshot.status === "CANCELLED") return "CANCELLED";
  if (snapshot.status === "COMPLETED" || toMs(snapshot.completedAt) !== null) return "COMPLETED";
  if (snapshot.status === "NO_SHOW") return "NO_SHOW";
  if (needsReview(snapshot, now)) return "NEEDS_REVIEW";
  if (isCancelled(snapshot)) return "CANCELLED";
  // Closed because nobody answered in time; it no longer takes answers.
  if (snapshot.arrangementStatus === "EXPIRED") return "NO_RESPONSE";
  const start = toMs(snapshot.scheduledStart);
  const end = toMs(snapshot.scheduledEnd);
  if (start === null || end === null || !acceptsResponses(snapshot)) return "NONE";
  if (now >= end + NO_RESPONSE_AFTER_MS) return "NO_RESPONSE";
  const verified = attendanceOutcome(snapshot) === "VERIFIED";
  if (verified ? now >= end : now >= studentAttendanceOpensAt(start)) return "AWAITING_CONFIRMATION";
  return "NONE";
}

// ------------------------------------------------------------ conversation

export type ConversationClosedReason = "CANCELLED" | "COMPLETED" | "NO_RESPONSE";
/**
 * Why a conversation no longer accepts new messages (history stays readable), or null when open.
 * A finished or cancelled arrangement is closed. A one-time arrangement is also closed once its
 * only session has gone unresolved for NO_RESPONSE_AFTER_MS; recurring ones stay open.
 */
export function conversationClosedReason(
  input: { arrangementStatus: string; arrangementType: string; session: { status: string; scheduledEnd: TimeInput } | null },
  now: number,
): ConversationClosedReason | null {
  if (input.arrangementStatus === "CANCELLED") return "CANCELLED";
  if (input.arrangementStatus === "COMPLETED") return "COMPLETED";
  if (input.arrangementStatus === "EXPIRED") return "NO_RESPONSE";
  if (input.arrangementType !== "ONE_TIME" || !input.session) return null;
  const end = toMs(input.session.scheduledEnd);
  if (end !== null && !["COMPLETED", "CANCELLED"].includes(input.session.status) && now >= end + NO_RESPONSE_AFTER_MS) return "NO_RESPONSE";
  return null;
}

// ------------------------------------------------------------------ actions

export type ActionKind = "CONFIRM_ATTENDANCE" | "CONFIRM_COMPLETION" | "REPORT_ISSUE";
export type AvailableActions = Record<"attendance" | "changeAttendance" | "completion" | "dispute", boolean>;

function ownAttendanceAnswer(snapshot: LifecycleSnapshot, role: Role): boolean | null {
  const attendance = snapshot.attendance;
  if (!attendance) return null;
  return role === "STUDENT" ? attendance.studentAttended : attendance.mateConfirmedStudentAttended;
}
function ownCompletionAnswer(snapshot: LifecycleSnapshot, role: Role): number | null {
  return toMs(role === "STUDENT" ? snapshot.studentCompletionConfirmedAt : snapshot.mateCompletionConfirmedAt);
}

/** How many more times the student may change their attendance answer. */
export function answerChangesLeft(snapshot: LifecycleSnapshot): number {
  return Math.max(0, MAX_STUDENT_ANSWER_CHANGES - (snapshot.attendance?.studentAnswerChanges ?? 0));
}

/** Milliseconds left to change the student's answer; 0 when it can no longer be changed. */
export function answerChangeTimeLeftMs(snapshot: LifecycleSnapshot, now: number): number {
  const answeredAt = toMs(snapshot.attendance?.studentRespondedAt);
  if (answeredAt === null) return 0;
  return Math.max(0, answeredAt + ANSWER_CHANGE_WINDOW_MS - now);
}

export function availableActions(snapshot: LifecycleSnapshot, role: Role, now: number): AvailableActions {
  const none = { attendance: false, changeAttendance: false, completion: false, dispute: false };
  const start = toMs(snapshot.scheduledStart);
  const end = toMs(snapshot.scheduledEnd);
  if (start === null || end === null || !acceptsResponses(snapshot) || needsReview(snapshot, now)) return none;
  const outcome = attendanceOutcome(snapshot);
  const attendanceAnswered = ownAttendanceAnswer(snapshot, role) !== null;
  return {
    // The Academic Mate answers after the student: the student's answer is what the mate reviews.
    attendance: now >= start && now >= attendanceOpensAt(role, start, end) && !attendanceAnswered &&
      (role === "STUDENT" || ownAttendanceAnswer(snapshot, "STUDENT") !== null),
    // A student may correct their answer until the Academic Mate has answered, a limited number of times.
    changeAttendance: role === "STUDENT" && attendanceAnswered && snapshot.attendance?.mateConfirmedStudentAttended === null &&
      answerChangesLeft(snapshot) > 0 && answerChangeTimeLeftMs(snapshot, now) > 0,
    completion: now >= end && outcome === "VERIFIED" && ownCompletionAnswer(snapshot, role) === null,
    // A completion issue may be raised once the session has ended, even if attendance is unresolved.
    dispute: now >= end,
  };
}

export type NextAction = { kind: ActionKind | "WAIT" | "REVIEW" | "NONE"; label: string; hint: string };

/** One plain-English "what happens next" line for a session, from the viewer's side. */
export function nextAction(snapshot: LifecycleSnapshot, role: Role, now: number): NextAction {
  const start = toMs(snapshot.scheduledStart);
  const end = toMs(snapshot.scheduledEnd);
  const resolution = resolutionStatus(snapshot, now);
  if (resolution === "CANCELLED") return { kind: "NONE", label: "Cancelled", hint: "This session was cancelled." };
  if (resolution === "COMPLETED") return { kind: "NONE", label: "Completed", hint: "Both of you confirmed this session." };
  if (resolution === "NO_SHOW") return { kind: "NONE", label: "No-show", hint: "Both of you reported that nobody attended." };
  if (resolution === "NEEDS_REVIEW") return { kind: "REVIEW", label: "Needs review", hint: "Your answers did not match, or a confirmation is overdue. The TXMate team will review it." };
  if (resolution === "NO_RESPONSE" && snapshot.arrangementStatus === "EXPIRED") return { kind: "NONE", label: "No response", hint: "Nobody responded within 24 hours, so this one-time session was closed." };
  if (start === null || end === null) return { kind: "NONE", label: "Scheduled", hint: "" };
  // Falls through on purpose: a "No response" session can still be answered late.
  const actions = availableActions(snapshot, role, now);
  if (actions.attendance) return { kind: "CONFIRM_ATTENDANCE", label: role === "STUDENT" ? "Confirm you attended" : "Confirm attendance", hint: "Takes one tap." };
  if (actions.completion) return { kind: "CONFIRM_COMPLETION", label: "Confirm completion", hint: "Tell us the session went ahead as planned." };
  const outcome = attendanceOutcome(snapshot);
  if (!acceptsResponses(snapshot)) return { kind: "NONE", label: "Scheduled", hint: "" };
  if (now < start) return { kind: "NONE", label: "Upcoming", hint: "Nothing to do until the session starts." };
  if (ownAttendanceAnswer(snapshot, role) === null) {
    const opens = attendanceOpensAt(role, start, end);
    if (role === "ACADEMIC_MATE" && now >= opens) return { kind: "WAIT", label: "Waiting for the student", hint: "You can confirm once the student has answered." };
    return { kind: "WAIT", label: "In progress", hint: now < opens ? "Attendance opens shortly." : "" };
  }
  if (outcome === "PENDING") return { kind: "WAIT", label: "Waiting for the other person", hint: "Your attendance answer is saved. We are waiting for theirs." };
  if (now < end) return { kind: "WAIT", label: "In progress", hint: "Completion opens when the session ends." };
  if (ownCompletionAnswer(snapshot, role) !== null) return { kind: "WAIT", label: "Waiting for the other person", hint: "You confirmed. The other person has 12 hours from the first confirmation." };
  return { kind: "WAIT", label: "Waiting for the other person", hint: "" };
}

// -------------------------------------------------------- completion result

export type CompletionResult = "COMPLETED" | "WAITING" | "REVIEW";
/** Decide what a set of completion answers means. Only two confirmations ever complete a session. */
export function evaluateCompletion(snapshot: LifecycleSnapshot, now: number): CompletionResult {
  if (toMs(snapshot.completionDisputedAt) !== null) return "REVIEW";
  if (bothConfirmedCompletion(snapshot) && attendanceOutcome(snapshot) === "VERIFIED") return "COMPLETED";
  if (completionDeadlineExpired(snapshot, now)) return "REVIEW";
  return "WAITING";
}
