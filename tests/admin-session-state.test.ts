import { describe, expect, test } from "bun:test";
import { dayRangeFilter, lusakaDayStart } from "../lib/admin/date-range";
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
