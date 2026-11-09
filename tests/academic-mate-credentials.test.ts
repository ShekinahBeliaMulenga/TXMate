import { describe, expect, test } from "bun:test";
import { MAX_CREDENTIALS, parseExperiences, parseQualifications } from "../lib/academic-mate-credentials";

const NOW = new Date("2026-11-08T10:00:00Z");

describe("qualifications", () => {
  test("accepts a full entry and trims text", () => {
    const result = parseQualifications([{ name: "  BSc Computer Science ", issuer: "UNZA", year: 2025, credentialUrl: "https://example.com/cert" }], NOW);
    expect(result).toEqual({ ok: true, value: [{ name: "BSc Computer Science", issuer: "UNZA", year: 2025, credentialUrl: "https://example.com/cert" }] });
  });
  test("only the name is required; blanks become null", () => {
    expect(parseQualifications([{ name: "Grade 12", issuer: " ", year: "", credentialUrl: null }], NOW)).toEqual({ ok: true, value: [{ name: "Grade 12", issuer: null, year: null, credentialUrl: null }] });
    expect(parseQualifications([{ name: "  " }], NOW).ok).toBe(false);
  });
  test("an empty list is valid (it clears the list)", () => {
    expect(parseQualifications([], NOW)).toEqual({ ok: true, value: [] });
  });
  test("rejects non-lists, bad entries and too many", () => {
    expect(parseQualifications("x", NOW).ok).toBe(false);
    expect(parseQualifications([null], NOW).ok).toBe(false);
    expect(parseQualifications(Array.from({ length: MAX_CREDENTIALS + 1 }, () => ({ name: "a" })), NOW).ok).toBe(false);
  });
  test("years must be whole and plausible; an expected future year is allowed", () => {
    expect(parseQualifications([{ name: "a", year: 1800 }], NOW).ok).toBe(false);
    expect(parseQualifications([{ name: "a", year: 2020.5 }], NOW).ok).toBe(false);
    expect(parseQualifications([{ name: "a", year: "2020" }], NOW).ok).toBe(false);
    expect(parseQualifications([{ name: "a", year: 2028 }], NOW).ok).toBe(true);
    expect(parseQualifications([{ name: "a", year: 2040 }], NOW).ok).toBe(false);
  });
  test("links must be http(s)", () => {
    for (const link of ["javascript:alert(1)", "data:text/html,x", "ftp://x.com", "not a url"]) expect(parseQualifications([{ name: "a", credentialUrl: link }], NOW).ok).toBe(false);
    expect(parseQualifications([{ name: "a", credentialUrl: "http://example.com" }], NOW).ok).toBe(true);
  });
  test("length and control characters are enforced", () => {
    expect(parseQualifications([{ name: "x".repeat(121) }], NOW).ok).toBe(false);
    expect(parseQualifications([{ name: "bad\u0000name" }], NOW).ok).toBe(false);
    expect(parseQualifications([{ name: "two\nlines" }], NOW).ok).toBe(false);
  });
});

describe("experience", () => {
  test("accepts a full entry", () => {
    expect(parseExperiences([{ title: "Peer tutor", organisation: "UNZA", description: "Maths", startYear: 2023, endYear: null }], NOW)).toEqual({ ok: true, value: [{ title: "Peer tutor", organisation: "UNZA", description: "Maths", startYear: 2023, endYear: null }] });
  });
  test("the role is required", () => {
    expect(parseExperiences([{ organisation: "UNZA" }], NOW).ok).toBe(false);
  });
  test("end year cannot precede start year or stand alone, and cannot be in the future", () => {
    expect(parseExperiences([{ title: "a", startYear: 2024, endYear: 2023 }], NOW).ok).toBe(false);
    expect(parseExperiences([{ title: "a", endYear: 2023 }], NOW).ok).toBe(false);
    expect(parseExperiences([{ title: "a", startYear: 2024, endYear: 2024 }], NOW).ok).toBe(true);
    expect(parseExperiences([{ title: "a", startYear: 2030 }], NOW).ok).toBe(false);
  });
  test("details may span lines but are limited to 500 characters", () => {
    expect(parseExperiences([{ title: "a", description: "line one\nline two" }], NOW).ok).toBe(true);
    expect(parseExperiences([{ title: "a", description: "x".repeat(501) }], NOW).ok).toBe(false);
  });
});
