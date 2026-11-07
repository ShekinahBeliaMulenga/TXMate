/**
 * Pure parsing and validation for the course import: which courses each programme teaches, year by year.
 *
 * CSV columns (header row required, order free):
 *   programme_code, year_number, course_code, course_name           required
 *   semester (1 or 2), type (COMPULSORY or ELECTIVE), elective_group, min_selections, max_selections, credits   optional
 * type defaults to COMPULSORY. An ELECTIVE row needs an elective_group; students choose between
 * min_selections and max_selections courses from each group (default 1 and 1).
 * Programmes and their years must already exist: import or create them first.
 */
import { IMPORT_MAX_CHARS, IMPORT_MAX_ROWS, parseCsv, type ImportProblem } from "./academic-import-rules";

export type CourseRow = {
  line: number;
  programmeCode: string;
  yearNumber: number;
  courseCode: string;
  courseName: string;
  semester: number | null;
  compulsory: boolean;
  group: string | null;
  minSelections: number;
  maxSelections: number;
  credits: number | null;
};

export const COURSE_TEMPLATE = "programme_code,year_number,course_code,course_name,semester,type,elective_group,min_selections,max_selections,credits\n";
export const COURSE_EXAMPLE = "BSC-CS,1,CS101,Introduction to Programming,1,COMPULSORY,,,,";

const REQUIRED = ["programme_code", "year_number", "course_code", "course_name"] as const;
const KNOWN = [...REQUIRED, "semester", "type", "elective_group", "min_selections", "max_selections", "credits"];
const CODE = /^[A-Z0-9][A-Z0-9 ./-]*$/;
const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
const whole = (text: string) => /^\d+$/.test(text);

export function validateCourseImport(text: string): { rows: CourseRow[]; problems: ImportProblem[]; fatal: string | null } {
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

  const at = (cells: string[], name: string) => (header.includes(name) ? clean(cells[header.indexOf(name)]) : "");
  const rows: CourseRow[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  const groupLimits = new Map<string, string>();

  for (let index = 1; index < table.length; index++) {
    const line = index + 1;
    const cells = table[index];
    let ok = true;
    const bad = (message: string) => { problems.push({ line, message }); ok = false; };

    const programmeCode = at(cells, "programme_code").toUpperCase();
    const yearText = at(cells, "year_number");
    const courseCode = at(cells, "course_code").toUpperCase();
    const courseName = at(cells, "course_name");
    const semesterText = at(cells, "semester");
    const typeText = (at(cells, "type") || "COMPULSORY").toUpperCase();
    const group = at(cells, "elective_group");
    const minText = at(cells, "min_selections");
    const maxText = at(cells, "max_selections");
    const creditText = at(cells, "credits");

    if (programmeCode.length < 2 || programmeCode.length > 20 || !/^[A-Z0-9][A-Z0-9-]*$/.test(programmeCode)) bad("programme_code must be 2 to 20 letters, numbers or dashes.");
    if (!whole(yearText) || Number(yearText) < 1 || Number(yearText) > 8) bad("year_number must be a whole number from 1 to 8.");
    if (!CODE.test(courseCode) || courseCode.length < 2 || courseCode.length > 20) bad("course_code must be 2 to 20 letters, numbers, spaces, dots, slashes or dashes.");
    if (courseName.length < 3 || courseName.length > 200) bad("course_name must be 3 to 200 characters.");
    if (semesterText !== "" && !(semesterText === "1" || semesterText === "2")) bad("semester must be blank, 1 or 2.");
    if (typeText !== "COMPULSORY" && typeText !== "ELECTIVE") bad("type must be COMPULSORY or ELECTIVE.");
    if (typeText === "ELECTIVE" && (group.length < 2 || group.length > 100)) bad("An ELECTIVE course needs an elective_group of 2 to 100 characters.");
    if (typeText === "COMPULSORY" && (group || minText || maxText)) bad("elective_group, min_selections and max_selections are only for ELECTIVE courses.");
    const min = minText === "" ? 1 : Number(minText);
    const max = maxText === "" ? 1 : Number(maxText);
    if ((minText !== "" && !whole(minText)) || (maxText !== "" && !whole(maxText)) || min < 0 || max < 1 || max > 20 || min > max) bad("min_selections and max_selections must be whole numbers with min no more than max (max 1 to 20).");
    if (creditText !== "" && (!/^\d+(\.\d{1,2})?$/.test(creditText) || Number(creditText) > 99)) bad("credits must be a number up to 99 with at most two decimals.");
    if (!ok) continue;

    const key = `${programmeCode}/${yearText}/${courseCode}`;
    const earlier = seen.get(key);
    if (earlier !== undefined) { problems.push({ line, message: `${courseCode} is already listed for ${programmeCode} year ${yearText} on line ${earlier}.` }); continue; }
    const knownName = names.get(courseCode);
    if (knownName !== undefined && knownName !== courseName) { problems.push({ line, message: `course_code ${courseCode} is used with two different names.` }); continue; }
    if (typeText === "ELECTIVE") {
      const groupKey = `${programmeCode}/${yearText}/${group.toLowerCase()}`;
      const limits = `${min}-${max}`;
      const knownLimits = groupLimits.get(groupKey);
      if (knownLimits !== undefined && knownLimits !== limits) { problems.push({ line, message: `The group “${group}” is given two different selection limits.` }); continue; }
      groupLimits.set(groupKey, limits);
    }
    seen.set(key, line);
    names.set(courseCode, courseName);
    rows.push({
      line, programmeCode, yearNumber: Number(yearText), courseCode, courseName,
      semester: semesterText === "" ? null : Number(semesterText),
      compulsory: typeText === "COMPULSORY",
      group: typeText === "ELECTIVE" ? group : null,
      minSelections: min, maxSelections: max,
      credits: creditText === "" ? null : Number(creditText),
    });
  }
  return { rows, problems, fatal: null };
}
