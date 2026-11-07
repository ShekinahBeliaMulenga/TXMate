import { describe, expect, test } from "bun:test";
import { COURSE_EXAMPLE, COURSE_TEMPLATE, validateCourseImport } from "../lib/admin/course-import-rules";

const row = (extra: string) => COURSE_TEMPLATE + extra + "\n";

describe("course import validation", () => {
  test("headings alone import nothing", () => {
    const result = validateCourseImport(COURSE_TEMPLATE);
    expect(result.fatal).toBeNull();
    expect(result.rows).toEqual([]);
  });
  test("the example row is valid and defaults to compulsory", () => {
    const { rows, problems } = validateCourseImport(row(COURSE_EXAMPLE));
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({ programmeCode: "BSC-CS", yearNumber: 1, courseCode: "CS101", semester: 1, compulsory: true, group: null, credits: null });
  });
  test("electives need a group and sensible limits", () => {
    expect(validateCourseImport(row("BSC-CS,2,CS210,Graphics,2,ELECTIVE,,,,")).problems).toHaveLength(1);
    const ok = validateCourseImport(row("BSC-CS,2,CS210,Graphics,2,ELECTIVE,Option A,1,2,3"));
    expect(ok.problems).toEqual([]);
    expect(ok.rows[0]).toMatchObject({ compulsory: false, group: "Option A", minSelections: 1, maxSelections: 2, credits: 3 });
    expect(validateCourseImport(row("BSC-CS,2,CS210,Graphics,2,ELECTIVE,Option A,3,2,")).problems).toHaveLength(1);
    expect(validateCourseImport(row("BSC-CS,2,CS210,Graphics,2,COMPULSORY,Option A,,,")).problems).toHaveLength(1);
  });
  test("bad values are reported by line", () => {
    const { rows, problems } = validateCourseImport(row("BSC-CS,9,CS101,Intro,3,,,,,\nBSC-CS,1,C,Intro,,,,,,"));
    expect(rows).toHaveLength(0);
    expect([...new Set(problems.map((problem) => problem.line))]).toEqual([2, 3]);
  });
  test("duplicates and conflicting names are rejected", () => {
    const text = row("BSC-CS,1,CS101,Intro to Programming,,,,,,\nBSC-CS,1,CS101,Intro to Programming,,,,,,\nBSC-IT,1,CS101,Something Else,,,,,,");
    const { rows, problems } = validateCourseImport(text);
    expect(rows).toHaveLength(1);
    expect(problems).toHaveLength(2);
  });
  test("the same course may sit in several programmes", () => {
    const { rows, problems } = validateCourseImport(row("BSC-CS,1,MAT101,Calculus,,,,,,\nBSC-IT,1,MAT101,Calculus,,,,,,"));
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(2);
  });
  test("header problems", () => {
    expect(validateCourseImport("programme_code,course_code\nA,B").fatal).toContain("Missing");
    expect(validateCourseImport(COURSE_TEMPLATE.trim() + ",extra\n").fatal).toContain("Unknown");
  });
});

import { checkRecurrenceEnd, RECURRING_MAX_DAYS } from "../lib/recurring-end";

describe("recurring end date", () => {
  const firstStart = new Date("2026-11-09T08:00:00Z"); // Monday 10:00 in Lusaka
  const base = { firstStart, timezone: "Africa/Lusaka", everyWeeks: 1 };
  test("a recurring arrangement must have an end date", () => {
    expect(checkRecurrenceEnd({ ...base, endsOn: undefined }).ok).toBe(false);
    expect(checkRecurrenceEnd({ ...base, endsOn: "" }).ok).toBe(false);
    expect(checkRecurrenceEnd({ ...base, endsOn: "not a date" }).ok).toBe(false);
    expect(checkRecurrenceEnd({ ...base, endsOn: "2026-02-30" }).ok).toBe(false);
  });
  test("it must leave room for a second session", () => {
    const early = checkRecurrenceEnd({ ...base, endsOn: "2026-11-15" });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.message).toContain("2026-11-16");
    expect(checkRecurrenceEnd({ ...base, endsOn: "2026-11-16" }).ok).toBe(true);
  });
  test("it scales with the repeat interval", () => {
    expect(checkRecurrenceEnd({ ...base, everyWeeks: 4, endsOn: "2026-11-30" }).ok).toBe(false);
    expect(checkRecurrenceEnd({ ...base, everyWeeks: 4, endsOn: "2026-12-07" }).ok).toBe(true);
  });
  test("it cannot run for more than a year", () => {
    expect(RECURRING_MAX_DAYS).toBe(365);
    expect(checkRecurrenceEnd({ ...base, endsOn: "2027-11-09" }).ok).toBe(true);
    expect(checkRecurrenceEnd({ ...base, endsOn: "2027-11-10" }).ok).toBe(false);
  });
  test("the last day is kept to the end of that local day", () => {
    const result = checkRecurrenceEnd({ ...base, endsOn: "2026-12-14" });
    expect(result.ok && result.endsAt.toISOString()).toBe("2026-12-14T21:59:00.000Z");
  });
});
