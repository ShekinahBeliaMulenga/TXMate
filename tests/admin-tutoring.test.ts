import { beforeAll, describe, expect, mock, test } from "bun:test";
import { matches } from "./helpers/where";
import { parseDirectoryQuery } from "../lib/admin/directory-query";

const parse = (query: string) => parseDirectoryQuery(new URLSearchParams(query));

describe("tutoring list parameters", () => {
  test("defaults are valid", () => {
    const result = parse("");
    expect(result.ok && result.query).toMatchObject({ kind: "requests", status: "all", arrangement: "", page: 1 });
  });
  test("known values pass", () => {
    expect(parse("kind=sessions&status=NEEDS_REVIEW&from=2026-11-01&to=2026-11-02&page=3").ok).toBe(true);
    expect(parse("kind=requests&status=ACCEPTED&arrangement=CANCELLED").ok).toBe(true);
    expect(parse("kind=requests&status=ARR_ACTIVE").ok).toBe(true);
  });
  test("unknown values are refused, not ignored", () => {
    expect(parse("kind=people").ok).toBe(false);
    expect(parse("kind=sessions&status=ACCEPTED").ok).toBe(false);
    expect(parse("kind=requests&status=NEEDS_REVIEW").ok).toBe(false);
    expect(parse("status=NOPE").ok).toBe(false);
    expect(parse("arrangement=NOPE").ok).toBe(false);
    expect(parse("kind=sessions&arrangement=ACTIVE").ok).toBe(false);
  });
  test("dates must be real and in order", () => {
    expect(parse("from=2026-02-30").ok).toBe(false);
    expect(parse("to=tomorrow").ok).toBe(false);
    expect(parse("from=2026-11-05&to=2026-11-01").ok).toBe(false);
    expect(parse("from=2026-11-05&to=2026-11-05").ok).toBe(true);
  });
  test("page must be a whole number from 1 to 10000", () => {
    for (const page of ["0", "-1", "abc", "1.5", "10001", "999999"]) expect(parse(`page=${page}`).ok).toBe(false);
    expect(parse("page=10000").ok).toBe(true);
  });
  test("the search text is trimmed and capped", () => {
    const result = parse(`q=${encodeURIComponent("  " + "x".repeat(300))}`);
    expect(result.ok && result.query.q.length).toBe(100);
  });
});

// ------------------------------------------------------------ listDirectory against in-memory data

const H = 3600 * 1000;
const NOW = Date.now();
const user = (name: string) => ({ user: { name } });
function sessionRow(id: string, course: string, student: string, mate: string, hoursFromNow: number, extra: Record<string, unknown> = {}, request: Record<string, unknown> = {}) {
  return {
    id, status: "SCHEDULED", scheduledStart: new Date(NOW + hoursFromNow * H), scheduledEnd: new Date(NOW + (hoursFromNow + 1) * H), meetingLocation: "Library", groupId: null,
    completedAt: null, cancelledAt: null, cancellationReason: null, completionDisputeReason: null, studentCompletionConfirmedAt: null, mateCompletionConfirmedAt: null,
    completionDisputedAt: null, completionReviewRequiredAt: null, attendance: null, review: null,
    request: { status: "ACCEPTED", arrangementStatus: "ACTIVE", arrangementType: "RECURRING", universityId: "u1", university: { code: "UNZA" },
      studentProfile: { studentId: `ID-${student}`, ...user(student) }, offering: { course: { code: course, name: `${course} course` }, academicMateProfile: user(mate) }, ...request },
    ...extra,
  };
}
const SESSIONS = [
  // Six completed sessions of an arrangement that was later cancelled, plus four upcoming ones.
  ...Array.from({ length: 6 }, (_, i) => sessionRow(`done${i}`, "MAT101", "Ada", "Bo", -300 + i * 24, { status: "COMPLETED", completedAt: new Date(NOW - (290 - i * 24) * H) }, { arrangementStatus: "CANCELLED" })),
  ...Array.from({ length: 4 }, (_, i) => sessionRow(`later${i}`, "MAT101", "Ada", "Bo", 24 * (i + 1), {}, { arrangementStatus: "CANCELLED" })),
  sessionRow("other", "PHY200", "Cy", "Di", 48),
  sessionRow("elsewhere", "PHY200", "Cy", "Di", 48, {}, { universityId: "u2" }),
];

let listDirectory: typeof import("../lib/admin/ops").listDirectory;
beforeAll(async () => {
  const table = (rows: any[]) => ({
    count: async ({ where }: any) => rows.filter((row) => matches(row, where)).length,
    findMany: async ({ where, skip = 0, take = 1000 }: any) => rows.filter((row) => matches(row, where)).sort((a, b) => +b.scheduledStart - +a.scheduledStart).slice(skip, skip + take),
  });
  mock.module("@/lib/prisma", () => ({ prisma: { tutoringSession: table(SESSIONS), mateRequest: table([]) } }));
  ({ listDirectory } = await import("../lib/admin/ops"));
});

const admin = { scope: { kind: "UNIVERSITY", universityIds: ["u1"] } } as never;
const base = { kind: "sessions" as const, status: "all", q: "", page: 1 };

describe("tutoring session list", () => {
  test("is limited to the admin's universities", async () => {
    const page = await listDirectory(admin, base);
    expect(page.total).toBe(11);
    expect(page.items.some((row) => row.id === "elsewhere")).toBe(false);
  });
  test("the state filter returns exactly the rows labelled with that state, even when the arrangement was cancelled later", async () => {
    const completed = await listDirectory(admin, { ...base, status: "COMPLETED" });
    expect(completed.items.map((row) => row.status)).toEqual(Array(6).fill("Completed"));
    const cancelled = await listDirectory(admin, { ...base, status: "CANCELLED" });
    expect(cancelled.total).toBe(4);
    expect(cancelled.items.every((row) => row.status === "Cancelled")).toBe(true);
    const upcoming = await listDirectory(admin, { ...base, status: "UPCOMING" });
    expect(upcoming.items.map((row) => row.id)).toEqual(["other"]);
  });
  test("every row is returned by the filter for its own label", async () => {
    const all = await listDirectory(admin, base);
    const states = ["UPCOMING", "IN_PROGRESS", "AWAITING_CONFIRMATION", "NO_RESPONSE", "NEEDS_REVIEW", "COMPLETED", "NO_SHOW", "CANCELLED"];
    let seen = 0;
    for (const state of states) {
      const page = await listDirectory(admin, { ...base, status: state });
      seen += page.total;
    }
    expect(seen).toBe(all.total);
  });
  test("search matches student, mate, course and student ID", async () => {
    expect((await listDirectory(admin, { ...base, q: "cy" })).items.map((row) => row.id)).toEqual(["other"]);
    expect((await listDirectory(admin, { ...base, q: "di" })).total).toBe(1);
    expect((await listDirectory(admin, { ...base, q: "phy200" })).total).toBe(1);
    expect((await listDirectory(admin, { ...base, q: "ID-Ada" })).total).toBe(10);
    expect((await listDirectory(admin, { ...base, q: "nobody" })).total).toBe(0);
  });
  test("pages are 25 rows and page numbers beyond the end are empty", async () => {
    const first = await listDirectory(admin, base);
    expect(first.pageCount).toBe(1);
    expect((await listDirectory(admin, { ...base, page: 2 })).items).toHaveLength(0);
  });
  test("the date range filters by session start (days are Lusaka days)", async () => {
    const lusakaDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lusaka" }).format(ms);
    const day = lusakaDay(NOW + 48 * H);
    const page = await listDirectory(admin, { ...base, from: day, to: day });
    const expected = SESSIONS.filter((row) => row.request.universityId === "u1" && lusakaDay(+row.scheduledStart) === day).map((row) => row.id).sort();
    expect(expected.length).toBeGreaterThan(0);
    expect(page.items.map((row) => row.id).sort()).toEqual(expected);
  });
  test("the details say which arrangement the session belongs to", async () => {
    const page = await listDirectory(admin, { ...base, status: "COMPLETED" });
    const facts = Object.fromEntries(page.items[0].facts.map((fact) => [fact.label, fact.value]));
    expect(facts["Arrangement"]).toBe("Recurring · cancelled");
    expect(facts["Session record"]).toBe("Completed");
  });
});
