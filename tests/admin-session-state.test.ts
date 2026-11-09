import { describe, expect, test } from "bun:test";
import { dayRangeFilter, lusakaDayStart } from "../lib/admin/date-range";
import { matches } from "./helpers/where";
import { ADMIN_SESSION_STATES, adminSessionState, adminSessionStateKey, sessionStateWhere } from "../lib/admin/session-state";

const H = 3600 * 1000;
const NOW = Date.parse("2026-11-02T10:00:00Z");
const base = { status: "IN_PROGRESS", requestStatus: "ACCEPTED", arrangementStatus: "ACTIVE" };
const at = (startHoursFromNow: number, hours = 1) => ({ scheduledStart: NOW + startHoursFromNow * H, scheduledEnd: NOW + (startHoursFromNow + hours) * H });

describe("admin session state", () => {
  test("a session that ended days ago with no answers is No response, not In progress", () => {
    expect(adminSessionState({ ...base, ...at(-72) }, NOW)).toBe("No response");
  });
  test("a session that just ended is awaiting confirmation", () => {
    expect(adminSessionStateKey({ ...base, ...at(-3) }, NOW)).toBe("AWAITING_CONFIRMATION");
  });
  test("only a session happening right now is In progress", () => {
    expect(adminSessionStateKey({ ...base, ...at(-0.5) }, NOW)).toBe("IN_PROGRESS");
  });
  test("a future session is Upcoming", () => {
    expect(adminSessionStateKey({ ...base, ...at(5) }, NOW)).toBe("UPCOMING");
  });
  test("cancelled and completed sessions keep those states", () => {
    expect(adminSessionStateKey({ ...base, status: "CANCELLED", ...at(-72) }, NOW)).toBe("CANCELLED");
    expect(adminSessionStateKey({ ...base, status: "COMPLETED", completedAt: NOW - 70 * H, ...at(-72) }, NOW)).toBe("COMPLETED");
  });
  test("every state has a database filter", () => {
    for (const state of ADMIN_SESSION_STATES) expect(sessionStateWhere(state, new Date(NOW))).toBeTruthy();
  });
});

describe("arrangement cancellation and recorded outcomes", () => {
  const cancelledArrangement = { requestStatus: "ACCEPTED", arrangementStatus: "CANCELLED" };
  test("a completed session stays Completed after its arrangement is cancelled", () => {
    expect(adminSessionStateKey({ status: "COMPLETED", completedAt: NOW - 70 * H, ...cancelledArrangement, ...at(-72) }, NOW)).toBe("COMPLETED");
    expect(adminSessionStateKey({ status: "COMPLETED", ...cancelledArrangement, ...at(-72) }, NOW)).toBe("COMPLETED");
  });
  test("no-show and review outcomes also keep their state", () => {
    expect(adminSessionStateKey({ status: "NO_SHOW", ...cancelledArrangement, ...at(-72) }, NOW)).toBe("NO_SHOW");
    expect(adminSessionStateKey({ status: "DISPUTED", ...cancelledArrangement, ...at(-72) }, NOW)).toBe("NEEDS_REVIEW");
    expect(adminSessionStateKey({ status: "IN_PROGRESS", completionDisputedAt: NOW - 50 * H, ...cancelledArrangement, ...at(-72) }, NOW)).toBe("NEEDS_REVIEW");
  });
  test("sessions with no outcome become Cancelled, past or future; an explicit cancel always wins", () => {
    expect(adminSessionStateKey({ status: "SCHEDULED", ...cancelledArrangement, ...at(5) }, NOW)).toBe("CANCELLED");
    expect(adminSessionStateKey({ status: "SCHEDULED", ...cancelledArrangement, ...at(-72) }, NOW)).toBe("CANCELLED");
    expect(adminSessionStateKey({ status: "SCHEDULED", requestStatus: "CANCELLED", arrangementStatus: "ACTIVE", ...at(5) }, NOW)).toBe("CANCELLED");
    expect(adminSessionStateKey({ status: "CANCELLED", completedAt: NOW - 70 * H, requestStatus: "ACCEPTED", arrangementStatus: "ACTIVE", ...at(-72) }, NOW)).toBe("CANCELLED");
  });
  test("a recurring arrangement cancelled after six sessions: six Completed, four Cancelled", () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({ status: i < 6 ? "COMPLETED" : "SCHEDULED", ...(i < 6 ? { completedAt: NOW - (200 - i) * H } : {}), ...cancelledArrangement, ...at(i < 6 ? -(200 - i * 24) : 24 * (i - 5)) }));
    const states = sessions.map((session) => adminSessionStateKey(session, NOW));
    expect(states.filter((state) => state === "COMPLETED")).toHaveLength(6);
    expect(states.filter((state) => state === "CANCELLED")).toHaveLength(4);
  });
});

describe("database filters agree with the displayed state", () => {
  test("every combination matches exactly the one state the rules display", () => {
    const now = new Date(NOW);
    const confirmations = [null, NOW - 20 * H, NOW - 2 * H];
    let checked = 0;
    for (const status of ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW", "DISPUTED"])
      for (const arrangementStatus of ["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"])
        for (const requestStatus of ["ACCEPTED", "CANCELLED"])
          for (const completedAt of [null, NOW - 60 * H])
            for (const attendanceStatus of [null, "DISPUTED"])
              for (const completionDisputedAt of [null, NOW - 30 * H])
                for (const studentConf of confirmations)
                  for (const mateConf of confirmations)
                    for (const offset of [-72, -3, -0.5, 5]) {
                      const times = at(offset);
                      const snapshot = {
                        status, requestStatus, arrangementStatus, completedAt, completionDisputedAt, ...times,
                        studentCompletionConfirmedAt: studentConf, mateCompletionConfirmedAt: mateConf,
                        attendance: attendanceStatus ? { status: attendanceStatus, studentAttended: null, mateConfirmedStudentAttended: null } : null,
                      };
                      const record = {
                        status, completedAt: completedAt === null ? null : new Date(completedAt), completionDisputedAt: completionDisputedAt === null ? null : new Date(completionDisputedAt),
                        completionReviewRequiredAt: null, scheduledStart: new Date(times.scheduledStart), scheduledEnd: new Date(times.scheduledEnd),
                        studentCompletionConfirmedAt: studentConf === null ? null : new Date(studentConf), mateCompletionConfirmedAt: mateConf === null ? null : new Date(mateConf),
                        attendance: attendanceStatus ? { status: attendanceStatus } : null, request: { status: requestStatus, arrangementStatus },
                      };
                      const matching = ADMIN_SESSION_STATES.filter((state) => matches(record, sessionStateWhere(state, now)));
                      expect(matching).toEqual([adminSessionStateKey(snapshot, NOW)]);
                      checked++;
                    }
    expect(checked).toBeGreaterThan(10000);
  });
});

describe("date range", () => {
  test("accepts real days only", () => {
    expect(lusakaDayStart("2026-02-30")).toBeNull();
    expect(lusakaDayStart("tomorrow")).toBeNull();
    expect(lusakaDayStart("")).toBeNull();
    expect(lusakaDayStart("2026-11-02")?.toISOString()).toBe("2026-11-01T22:00:00.000Z");
  });
  test("To includes the whole last day", () => {
    const range = dayRangeFilter("2026-11-02", "2026-11-02");
    expect(range?.gte?.toISOString()).toBe("2026-11-01T22:00:00.000Z");
    expect(range?.lt?.toISOString()).toBe("2026-11-02T22:00:00.000Z");
  });
  test("no valid date means no filter, one end works alone", () => {
    expect(dayRangeFilter("", "nope")).toBeUndefined();
    expect(dayRangeFilter("2026-11-02", "")?.lt).toBeUndefined();
    expect(dayRangeFilter("", "2026-11-02")?.gte).toBeUndefined();
  });
});

describe("console session words", () => {
  test("the usage line lists exactly the states the filter accepts", async () => {
    const { CONSOLE_COMMANDS } = await import("../lib/admin/console-parse");
    const usage = CONSOLE_COMMANDS.find((command) => command.name === "sessions")?.usage ?? "";
    for (const state of ADMIN_SESSION_STATES) expect(usage).toContain(state.toLowerCase());
  });
});
