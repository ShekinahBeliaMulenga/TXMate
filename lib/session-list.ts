/** Pure helpers behind the student Sessions list: grouping, filtering and history paging. No React, no clock. */
import { availableActions, isCancelled, resolutionStatus, type ResolutionStatus } from "./session-lifecycle-rules";
import { snapshotOf } from "./session-lifecycle-serialize";
import type { SessionLifecycleItem } from "./session-lifecycle-types";

export type SessionEntry =
  | { kind: "group"; key: string; groupId: string; sessions: SessionLifecycleItem[]; start: number }
  | { kind: "session"; key: string; session: SessionLifecycleItem; start: number };
/** "ACTION" is the sessions where this person has something to answer right now. */
export type SessionFilter = "ALL" | "ACTION" | Exclude<ResolutionStatus, "NONE" | "NO_SHOW">;

/** Sessions that have left the active schedule for good. */
export function isSessionClosed(session: SessionLifecycleItem): boolean {
  return isCancelled(snapshotOf(session)) || ["COMPLETED", "NO_SHOW"].includes(session.status);
}

export function sessionStart(session: SessionLifecycleItem): number {
  const value = new Date(session.scheduledStart).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function buildEntries(sessions: SessionLifecycleItem[]): SessionEntry[] {
  const groups = new Map<string, SessionLifecycleItem[]>();
  const entries: SessionEntry[] = [];
  for (const session of sessions) {
    if (session.viewerRole === "ACADEMIC_MATE" && session.groupId && !isSessionClosed(session) && session.arrangementStatus !== "EXPIRED") {
      groups.set(session.groupId, [...(groups.get(session.groupId) ?? []), session]);
    } else {
      entries.push({ kind: "session", key: session.id, session, start: sessionStart(session) });
    }
  }
  for (const [groupId, members] of groups) entries.push({ kind: "group", key: `group:${groupId}`, groupId, sessions: members, start: sessionStart(members[0]) });
  return entries;
}

export const membersOf = (entry: SessionEntry): SessionLifecycleItem[] => entry.kind === "group" ? entry.sessions : [entry.session];

/**
 * Keeps only the sessions that pass `keep`. A group card shrinks to the members that match instead of
 * showing the whole group because one member does, and disappears when none match.
 */
export function filterEntries(entries: SessionEntry[], keep: (session: SessionLifecycleItem) => boolean): SessionEntry[] {
  const result: SessionEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "session") { if (keep(entry.session)) result.push(entry); continue; }
    const members = entry.sessions.filter(keep);
    if (members.length === 0) continue;
    result.push(members.length === entry.sessions.length ? entry : { ...entry, sessions: members, start: sessionStart(members[0]) });
  }
  return result;
}

/** True when this person can answer something (attendance or completion) on the session right now. */
export function needsAnswer(session: SessionLifecycleItem, now: number): boolean {
  const actions = availableActions(snapshotOf(session), session.viewerRole, now);
  return actions.attendance || actions.completion;
}

export function matchesFilter(session: SessionLifecycleItem, filter: SessionFilter, now: number): boolean {
  if (filter === "ALL") return true;
  if (filter === "ACTION") return needsAnswer(session, now);
  return resolutionStatus(snapshotOf(session), now) === filter;
}

export function matchesSearch(session: SessionLifecycleItem, search: string): boolean {
  if (!search) return true;
  return [session.course.code, session.course.name, session.otherParticipantName, session.studentName, session.academicMateName, session.meetingLocation].some((value) => value.toLowerCase().includes(search));
}

export type HistoryState = { started: boolean; cursor: string | null; hasMore: boolean };
export const INITIAL_HISTORY: HistoryState = { started: false, cursor: null, hasMore: false };
/**
 * A background refresh only ever returns the newest page of history. The paging position is therefore set
 * once, from the first successful load; later refreshes must not move it (they would restart or re-open
 * history the person already paged through). Paging itself is advanced only by "Show older sessions".
 */
export function historyAfterRefresh(state: HistoryState, page: { nextHistoryCursor?: string | null; hasMoreHistory?: boolean }): HistoryState {
  if (state.started) return state;
  return { started: true, cursor: page.nextHistoryCursor ?? null, hasMore: !!page.hasMoreHistory };
}
export function historyAfterPage(page: { nextHistoryCursor?: string | null; hasMoreHistory?: boolean }): HistoryState {
  return { started: true, cursor: page.nextHistoryCursor ?? null, hasMore: !!page.hasMoreHistory };
}
