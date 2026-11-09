import { describe, expect, test } from "bun:test";
import { INITIAL_HISTORY, buildEntries, filterEntries, historyAfterPage, historyAfterRefresh, matchesFilter, matchesSearch, needsAnswer } from "../lib/session-list";
import type { SessionLifecycleItem } from "../lib/session-lifecycle-types";

const H = 3600 * 1000;
const NOW = Date.parse("2026-11-02T10:00:00Z");

function session(id: string, overrides: Partial<SessionLifecycleItem> & { startHours: number }): SessionLifecycleItem {
  const { startHours, ...rest } = overrides;
  return {
    id, arrangementId: "a", requestId: "r", offeringId: "o", groupId: null, status: "SCHEDULED",
    scheduledStart: new Date(NOW + startHours * H).toISOString(), scheduledEnd: new Date(NOW + (startHours + 1) * H).toISOString(),
    meetingLocation: "Library", suggestedLocation: null, completedAt: null, studentCompletionConfirmedAt: null, mateCompletionConfirmedAt: null,
    completionDisputedAt: null, completionDisputedByUserId: null, completionDisputeReason: null, completionReviewRequiredAt: null,
    requestStatus: "ACCEPTED", arrangementStatus: "ACTIVE", arrangementType: "RECURRING", recurrenceEndsAt: null, viewerRole: "STUDENT",
    studentName: "Ada Student", academicMateName: "Bo Mate", otherParticipantName: "Bo Mate", otherParticipantImage: null,
    course: { code: "MAT101", name: "Calculus" }, attendance: null, cancellation: null, detailUrl: "", conversationUrl: "",
    ...rest,
  } as SessionLifecycleItem;
}

describe("answer shortcut", () => {
  test("the shortcut and the filter it opens use the same definition", () => {
    // The student can confirm attendance 20 minutes after the start.
    const mine = session("mine", { startHours: -0.5, status: "IN_PROGRESS" });
    // The mate is only waiting for the student's answer: it is "awaiting confirmation", but not waiting on this person.
    const waiting = session("waiting", { startHours: -0.5, status: "IN_PROGRESS", viewerRole: "ACADEMIC_MATE" });
    const future = session("future", { startHours: 5 });
    expect(needsAnswer(mine, NOW)).toBe(true);
    expect(matchesFilter(mine, "ACTION", NOW)).toBe(true);
    expect(needsAnswer(waiting, NOW)).toBe(false);
    expect(matchesFilter(waiting, "ACTION", NOW)).toBe(false);
    expect(matchesFilter(waiting, "AWAITING_CONFIRMATION", NOW)).toBe(true);
    expect(needsAnswer(future, NOW)).toBe(false);
    expect(matchesFilter(future, "ACTION", NOW)).toBe(false);
  });
});

describe("group filtering", () => {
  const members = [
    session("g1", { startHours: -0.5, status: "IN_PROGRESS", groupId: "G", viewerRole: "ACADEMIC_MATE", studentName: "Ann" }),
    session("g2", { startHours: -0.5, status: "IN_PROGRESS", groupId: "G", viewerRole: "ACADEMIC_MATE", studentName: "Ben", attendance: { status: "DISPUTED", studentAttended: true, mateConfirmedStudentAttended: false } as never }),
    session("solo", { startHours: 3 }),
  ];
  test("members of one group become a single entry", () => {
    const entries = buildEntries(members);
    expect(entries.filter((entry) => entry.kind === "group")).toHaveLength(1);
  });
  test("search shrinks the group to the matching member", () => {
    const entries = filterEntries(buildEntries(members), (s) => matchesSearch(s, "ben"));
    const group = entries.find((entry) => entry.kind === "group");
    expect(group && group.kind === "group" ? group.sessions.map((s) => s.id) : []).toEqual(["g2"]);
    expect(entries.some((entry) => entry.kind === "session")).toBe(false);
  });
  test("a status filter shows only the members in that state, and drops groups with none", () => {
    const entries = buildEntries(members);
    const review = filterEntries(entries, (s) => matchesFilter(s, "NEEDS_REVIEW", NOW));
    const group = review.find((entry) => entry.kind === "group");
    expect(group && group.kind === "group" ? group.sessions.map((s) => s.id) : []).toEqual(["g2"]);
    expect(filterEntries(entries, (s) => matchesFilter(s, "COMPLETED", NOW))).toHaveLength(0);
  });
  test("a group where every member matches is returned unchanged", () => {
    const entries = buildEntries(members);
    const all = filterEntries(entries, () => true);
    expect(all).toEqual(entries);
  });
});

describe("history paging", () => {
  test("a refresh never moves the position once it is set", () => {
    const first = historyAfterRefresh(INITIAL_HISTORY, { nextHistoryCursor: "c1", hasMoreHistory: true });
    expect(first).toEqual({ started: true, cursor: "c1", hasMore: true });
    const paged = historyAfterPage({ nextHistoryCursor: null, hasMoreHistory: false });
    expect(paged).toEqual({ started: true, cursor: null, hasMore: false });
    // After everything was loaded, a refresh (which only sees the newest page) must not offer "older" again.
    expect(historyAfterRefresh(paged, { nextHistoryCursor: "c1", hasMoreHistory: true })).toEqual(paged);
  });
  test("a failed first load does not start paging", () => {
    expect(INITIAL_HISTORY.started).toBe(false);
  });
});
