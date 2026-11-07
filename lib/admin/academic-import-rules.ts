/**
 * Pure parsing and validation for the academic structure import (schools, departments, programmes).
 * No server imports, so it is unit tested and can run in the browser for instant feedback.
 *
 * CSV columns (header row required, order free):
 *   school_code, school_name, department_code, department_name, programme_code, programme_name, level, duration_years
 * department_* are optional (both or neither). level defaults to BACHELOR. A blank duration_years means "not known yet": no programme years are created for it.
 */

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_CHARS = 1_000_000;
export const LEVELS = ["CERTIFICATE", "DIPLOMA", "BACHELOR", "MASTERS", "DOCTORATE", "OTHER"] as const;
export type ProgrammeLevelName = (typeof LEVELS)[number];

export type ImportRow = {
  line: number;
  schoolCode: string;
  schoolName: string;
  departmentCode: string | null;
  departmentName: string | null;
  programmeCode: string;
  programmeName: string;
  level: ProgrammeLevelName;
  /** Null when the file leaves it blank. */
  durationYears: number | null;
};

export type ImportProblem = { line: number; message: string };

/** Minimal RFC 4180 style parser: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

const REQUIRED = ["school_code", "school_name", "programme_code", "programme_name"] as const;
const KNOWN = [...REQUIRED, "department_code", "department_name", "level", "duration_years"];
const CODE = /^[A-Z0-9][A-Z0-9-]*$/;

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

export function validateImport(text: string): { rows: ImportRow[]; problems: ImportProblem[]; fatal: string | null } {
  if (text.length > IMPORT_MAX_CHARS) return { rows: [], problems: [], fatal: "That file is too large (limit about 1 MB)." };
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], problems: [], fatal: "The file is empty." };

  const header = table[0].map((cell) => clean(cell).toLowerCase().replace(/[\s-]+/g, "_"));
  const missing = REQUIRED.filter((name) => !header.includes(name));
  if (missing.length > 0) return { rows: [], problems: [], fatal: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` };
  const unknown = header.filter((name) => name && !KNOWN.includes(name));
  if (unknown.length > 0) return { rows: [], problems: [], fatal: `Unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.` };
  if (new Set(header).size !== header.length) return { rows: [], problems: [], fatal: "A column name appears twice." };
  if (table.length - 1 > IMPORT_MAX_ROWS) return { rows: [], problems: [], fatal: `Too many rows (limit ${IMPORT_MAX_ROWS}).` };

  const at = (cells: string[], name: string) => clean(cells[header.indexOf(name)]);
  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  const programmeLines = new Map<string, number>();
  const schoolNames = new Map<string, string>();
  const departmentNames = new Map<string, string>();

  for (let index = 1; index < table.length; index++) {
    const line = index + 1; // spreadsheet line number (header is line 1)
    const cells = table[index];
    const fail = (message: string) => problems.push({ line, message });

    const schoolCode = at(cells, "school_code").toUpperCase();
    const schoolName = at(cells, "school_name");
    const departmentCode = at(cells, "department_code").toUpperCase();
    const departmentName = at(cells, "department_name");
    const programmeCode = at(cells, "programme_code").toUpperCase();
    const programmeName = at(cells, "programme_name");
    const levelText = (at(cells, "level") || "BACHELOR").toUpperCase();
    const durationText = at(cells, "duration_years");

    let ok = true;
    const bad = (message: string) => { fail(message); ok = false; };

    if (!CODE.test(schoolCode) || schoolCode.length < 2 || schoolCode.length > 12) bad("school_code must be 2 to 12 letters, numbers or dashes.");
    if (schoolName.length < 3 || schoolName.length > 150) bad("school_name must be 3 to 150 characters.");
    if (Boolean(departmentCode) !== Boolean(departmentName)) bad("Give both department_code and department_name, or neither.");
    if (departmentCode && (!CODE.test(departmentCode) || departmentCode.length > 12)) bad("department_code must be up to 12 letters, numbers or dashes.");
    if (departmentName && (departmentName.length < 3 || departmentName.length > 150)) bad("department_name must be 3 to 150 characters.");
    if (!CODE.test(programmeCode) || programmeCode.length < 2 || programmeCode.length > 20) bad("programme_code must be 2 to 20 letters, numbers or dashes.");
    if (programmeName.length < 3 || programmeName.length > 200) bad("programme_name must be 3 to 200 characters.");
    if (!(LEVELS as readonly string[]).includes(levelText)) bad(`level must be one of ${LEVELS.join(", ")}.`);
    const duration = durationText === "" ? null : Number(durationText);
    if (durationText !== "" && (!/^\d+$/.test(durationText) || duration === null || duration < 1 || duration > 8)) bad("duration_years must be blank or a whole number from 1 to 8.");
    if (!ok) continue;

    const earlier = programmeLines.get(programmeCode);
    if (earlier !== undefined) { fail(`programme_code ${programmeCode} was already used on line ${earlier}.`); continue; }
    const knownSchool = schoolNames.get(schoolCode);
    if (knownSchool !== undefined && knownSchool !== schoolName) { fail(`school_code ${schoolCode} is used with two different names.`); continue; }
    const deptKey = `${schoolCode}/${departmentCode}`;
    const knownDept = departmentNames.get(deptKey);
    if (departmentCode && knownDept !== undefined && knownDept !== departmentName) { fail(`department_code ${departmentCode} is used with two different names in ${schoolCode}.`); continue; }

    programmeLines.set(programmeCode, line);
    schoolNames.set(schoolCode, schoolName);
    if (departmentCode) departmentNames.set(deptKey, departmentName);
    rows.push({
      line,
      schoolCode,
      schoolName,
      departmentCode: departmentCode || null,
      departmentName: departmentName || null,
      programmeCode,
      programmeName,
      level: levelText as ProgrammeLevelName,
      durationYears: duration,
    });
  }
  return { rows, problems, fatal: null };
}

/** Header only on purpose: a sample row would overwrite real records if someone imported it by mistake. */
export const IMPORT_TEMPLATE = "school_code,school_name,department_code,department_name,programme_code,programme_name,level,duration_years\n";
export const IMPORT_EXAMPLE = "SICT,School of Information and Communication Technology,CS,Department of Computer Science,BSC-CS,Bachelor of Science in Computer Science,BACHELOR,4";
