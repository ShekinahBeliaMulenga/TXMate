import { COMPLETION_DEADLINE_MS, NO_RESPONSE_AFTER_MS, resolutionStatus, timeStatus, type LifecycleSnapshot } from "../session-lifecycle-rules";

/**
 * The state an admin should read for a session. The stored status stays "In progress" until both people
 * confirm, so a session that ended days ago would otherwise look like it is still happening.
 * This uses the same rules as the student screens, so the two never disagree.
 */
export const ADMIN_SESSION_STATES = ["UPCOMING", "IN_PROGRESS", "AWAITING_CONFIRMATION", "NO_RESPONSE", "NEEDS_REVIEW", "COMPLETED", "NO_SHOW", "CANCELLED"] as const;
export type AdminSessionState = (typeof ADMIN_SESSION_STATES)[number];

export const ADMIN_SESSION_STATE_LABEL: Record<AdminSessionState, string> = {
  UPCOMING: "Upcoming",
  IN_PROGRESS: "In progress",
  AWAITING_CONFIRMATION: "Ended, awaiting confirmation",
  NO_RESPONSE: "No response",
  NEEDS_REVIEW: "Needs review",
  COMPLETED: "Completed",
  NO_SHOW: "No show",
  CANCELLED: "Cancelled",
};

export function isAdminSessionState(value: string): value is AdminSessionState {
  return (ADMIN_SESSION_STATES as readonly string[]).includes(value);
}

export function adminSessionStateKey(snapshot: LifecycleSnapshot, now: number): AdminSessionState {
  const resolution = resolutionStatus(snapshot, now);
  switch (resolution) {
    case "CANCELLED": return "CANCELLED";
    case "COMPLETED": return "COMPLETED";
    case "NO_SHOW": return "NO_SHOW";
    case "NEEDS_REVIEW": return "NEEDS_REVIEW";
    case "NO_RESPONSE": return "NO_RESPONSE";
    default: {
      const time = timeStatus(snapshot, now);
      if (time === "UPCOMING") return "UPCOMING";
      if (time === "IN_PROGRESS") return "IN_PROGRESS";
      const end = typeof snapshot.scheduledEnd === "number" ? snapshot.scheduledEnd : new Date(snapshot.scheduledEnd as string | Date).getTime();
      // Nobody settled it a day after it ended.
      return now >= end + NO_RESPONSE_AFTER_MS ? "NO_RESPONSE" : "AWAITING_CONFIRMATION";
    }
  }
}

export function adminSessionState(snapshot: LifecycleSnapshot, now: number): string {
  return ADMIN_SESSION_STATE_LABEL[adminSessionStateKey(snapshot, now)];
}

// ------------------------------------------------------------------ database filters

type Where = Record<string, unknown>;

/**
 * The same states as `adminSessionStateKey`, written as database filters, so the dashboard counts and the
 * Tutoring status filter always agree with the label on each row. Each state excludes the ones above it.
 * Keep the order identical to `resolutionStatus`: cancelled, completed, no show, needs review, then time.
 */
export function sessionStateWhere(state: AdminSessionState, now: Date): Where {
  const cutoff24 = new Date(now.getTime() - NO_RESPONSE_AFTER_MS);
  const cutoff12 = new Date(now.getTime() - COMPLETION_DEADLINE_MS);
  // An arrangement-level cancellation only applies to a session with no outcome already recorded.
  const arrangementCancelled: Where = { OR: [{ request: { is: { status: "CANCELLED" } } }, { request: { is: { arrangementStatus: "CANCELLED" } } }] };
  const noShow: Where = { status: "NO_SHOW" };
  const completed: Where = { OR: [{ status: "COMPLETED" }, { completedAt: { not: null } }] };
  const review: Where = {
    OR: [
      { status: "DISPUTED" },
      { attendance: { is: { status: "DISPUTED" } } },
      { completionDisputedAt: { not: null } },
      { completionReviewRequiredAt: { not: null } },
      // Each side's "not null" check comes first so the condition is never SQL "unknown"; an unknown value
      // inside a NOT (...) below would otherwise drop the row from every filter.
      { AND: [{ studentCompletionConfirmedAt: { not: null } }, { studentCompletionConfirmedAt: { lt: cutoff12 } }, { mateCompletionConfirmedAt: null }] },
      { AND: [{ mateCompletionConfirmedAt: { not: null } }, { mateCompletionConfirmedAt: { lt: cutoff12 } }, { studentCompletionConfirmedAt: null }] },
    ],
  };
  const cancelled: Where = { OR: [{ status: "CANCELLED" }, { AND: [arrangementCancelled, { NOT: { OR: [completed, noShow, review] } }] }] };
  const expired: Where = { request: { is: { arrangementStatus: "EXPIRED" } } };

  switch (state) {
    case "CANCELLED": return cancelled;
    case "COMPLETED": return { AND: [{ NOT: cancelled }, completed] };
    case "NO_SHOW": return { AND: [{ NOT: cancelled }, { NOT: completed }, noShow] };
    case "NEEDS_REVIEW": return { AND: [{ NOT: cancelled }, { NOT: completed }, { NOT: noShow }, review] };
  }
  const open: Where[] = [{ NOT: cancelled }, { NOT: completed }, { NOT: noShow }, { NOT: review }];
  switch (state) {
    case "NO_RESPONSE": return { AND: [...open, { OR: [expired, { scheduledEnd: { lte: cutoff24 } }] }] };
    case "AWAITING_CONFIRMATION": return { AND: [...open, { NOT: expired }, { scheduledEnd: { lte: now, gt: cutoff24 } }] };
    case "IN_PROGRESS": return { AND: [...open, { NOT: expired }, { scheduledStart: { lte: now }, scheduledEnd: { gt: now } }] };
    case "UPCOMING": return { AND: [...open, { NOT: expired }, { scheduledStart: { gt: now } }] };
  }
}
