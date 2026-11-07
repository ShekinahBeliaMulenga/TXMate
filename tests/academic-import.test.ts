import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { IMPORT_EXAMPLE, IMPORT_TEMPLATE, parseCsv, validateImport } from "../lib/admin/academic-import-rules";

const HEADER = "school_code,school_name,department_code,department_name,programme_code,programme_name,level,duration_years\n";

describe("csv parsing", () => {
  test("quotes, commas, doubled quotes, CRLF and BOM", () => {
    expect(parseCsv('﻿a,"b,c","d ""e"""\r\n1,2,3\r\n')).toEqual([["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
    expect(parseCsv("a,b\n\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("import validation", () => {
  test("the template is headings only, so importing it unchanged can never overwrite anything", () => {
    const result = validateImport(IMPORT_TEMPLATE);
    expect(result.fatal).toBeNull();
    expect(result.rows).toEqual([]);
  });
  test("the documented example row is valid", () => {
    const result = validateImport(IMPORT_TEMPLATE + IMPORT_EXAMPLE + "\n");
    expect(result.problems).toEqual([]);
    expect(result.rows[0]).toMatchObject({ schoolCode: "SICT", programmeCode: "BSC-CS", level: "BACHELOR", durationYears: 4 });
  });
  test("defaults, normalisation and column order", () => {
    const text = "programme_name,programme_code,school_name,school_code\n  Bachelor of Law ,llb,School of Law,law\n";
    const { rows, problems } = validateImport(text);
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({ schoolCode: "LAW", programmeCode: "LLB", programmeName: "Bachelor of Law", level: "BACHELOR", durationYears: null, departmentCode: null });
  });
  test("fatal header problems", () => {
    expect(validateImport("").fatal).toBeTruthy();
    expect(validateImport("school_code,programme_code\nA,B\n").fatal).toContain("Missing");
    expect(validateImport(HEADER.trim() + ",extra\n").fatal).toContain("Unknown");
    expect(validateImport("school_code,school_code,school_name,programme_code,programme_name\n").fatal).toContain("twice");
  });
  test("row problems are reported with line numbers", () => {
    const text = HEADER + "S,School,,,P1,Programme One,BACHELOR,4\nSCH,School,D1,,P2,Programme Two,BACHELOR,4\nSCH,School,,,P3,Programme Three,WIZARD,4\nSCH,School,,,P4,Programme Four,BACHELOR,12\n";
    const { rows, problems } = validateImport(text);
    expect(rows).toHaveLength(0);
    expect(problems.map((p) => p.line)).toEqual([2, 3, 4, 5]);
  });
  test("duplicate programme codes and conflicting names are rejected", () => {
    const text = HEADER + "SCH,School A,,,P1,Programme One,BACHELOR,4\nSCH,School A,,,P1,Programme Dup,BACHELOR,4\nSCH,School B,,,P2,Programme Two,BACHELOR,4\n";
    const { rows, problems } = validateImport(text);
    expect(rows).toHaveLength(1);
    expect(problems).toHaveLength(2);
  });
  test("row limit", () => {
    const many = HEADER + Array.from({ length: 2001 }, (_, i) => `SCH,School,,,P${i},Programme ${i},BACHELOR,4`).join("\n");
    expect(validateImport(many).fatal).toContain("Too many");
  });
});

describe("shipped data files", () => {
  test("the UNZA file validates, every programme has a department and no duration is invented", () => {
    const { rows, problems, fatal } = validateImport(readFileSync(new URL("../docs/academic-data/unza-bachelor-programmes.csv", import.meta.url), "utf8"));
    expect(fatal).toBeNull();
    expect(problems).toEqual([]);
    expect(rows.length).toBe(107);
    for (const row of rows) {
      expect(row.departmentCode).not.toBeNull();
      expect(row.durationYears).toBeNull();
    }
  });
});
