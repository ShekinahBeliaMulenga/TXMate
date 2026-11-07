import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit";
import type { AdminContext } from "./guard";
import type { RequestContext } from "./request-context";
import { validateImport, type ImportProblem, type ImportRow } from "./academic-import-rules";

export type ImportSummary = {
  schools: { created: number; updated: number };
  departments: { created: number; updated: number };
  programmes: { created: number; updated: number };
  yearsToCreate: number;
  /** Programmes in the file with no duration, so students cannot pick them until one is set. */
  withoutDuration: number;
};

/** An existing record whose stored name differs from the file, so the import would rename it. */
export type Rename = { kind: "School" | "Department" | "Programme"; code: string; from: string; to: string };

export type ImportOutcome =
  | { ok: true; dryRun: boolean; summary: ImportSummary; renames: Rename[]; problems: ImportProblem[]; sample: Array<{ line: number; school: string; programme: string; status: "new" | "update" }> }
  | { ok: false; status: 400 | 404 | 409; error: string; problems?: ImportProblem[] };

type Reader = Pick<typeof prisma, "university" | "school" | "department" | "programme" | "programmeYear">;

/** Compares the file with what is already stored. Never writes. */
async function analyse(db: Reader, universityId: string, rows: ImportRow[]) {
  const schoolCodes = [...new Set(rows.map((row) => row.schoolCode))];
  const existingSchools = await db.school.findMany({ where: { universityId, code: { in: schoolCodes } }, select: { id: true, code: true, name: true } });
  const schoolId = new Map<string, string>(existingSchools.map((school: { id: string; code: string }) => [school.code, school.id]));

  const existingDepartments = existingSchools.length
    ? await db.department.findMany({ where: { schoolId: { in: existingSchools.map((school: { id: string }) => school.id) } }, select: { id: true, code: true, schoolId: true, name: true } })
    : [];
  const existingProgrammes = await db.programme.findMany({
    where: { universityId, code: { in: rows.map((row) => row.programmeCode) } },
    select: { id: true, code: true, name: true, schoolId: true, durationYears: true, years: { select: { yearNumber: true } } },
  });
  const programmeByCode = new Map<string, { id: string; name: string; schoolId: string; years: Set<number> }>(
    existingProgrammes.map((programme: { id: string; code: string; name: string; schoolId: string; years: Array<{ yearNumber: number }> }) => [programme.code, { id: programme.id, name: programme.name, schoolId: programme.schoolId, years: new Set(programme.years.map((year) => year.yearNumber)) }]),
  );

  const renames: Rename[] = [];
  const schoolNameByCode = new Map<string, string>(existingSchools.map((school: { code: string; name: string }) => [school.code, school.name]));
  const problems: ImportProblem[] = [];
  const deptSeen = new Set<string>();
  let withoutDuration = 0, departmentsCreated = 0, departmentsUpdated = 0, yearsToCreate = 0, programmesCreated = 0, programmesUpdated = 0;
  const sample: Array<{ line: number; school: string; programme: string; status: "new" | "update" }> = [];

  for (const row of rows) {
    const school = schoolId.get(row.schoolCode);
    if (row.departmentCode) {
      const key = `${row.schoolCode}/${row.departmentCode}`;
      if (!deptSeen.has(key)) {
        deptSeen.add(key);
        const found = school ? existingDepartments.find((dept: { code: string; schoolId: string; name: string }) => dept.schoolId === school && dept.code === row.departmentCode) : undefined;
        if (found) { departmentsUpdated++; if (found.name !== row.departmentName) renames.push({ kind: "Department", code: row.departmentCode, from: found.name, to: row.departmentName ?? "" }); } else departmentsCreated++;
      }
    }
    const existing = programmeByCode.get(row.programmeCode);
    if (existing && school && existing.schoolId !== school) {
      problems.push({ line: row.line, message: `${row.programmeCode} already exists under a different school. Change its code or fix the school.` });
      continue;
    }
    if (existing && !school) {
      problems.push({ line: row.line, message: `${row.programmeCode} already exists under another school, but ${row.schoolCode} is a new school.` });
      continue;
    }
    if (row.durationYears === null) { if (!existing || existing.years.size === 0) withoutDuration++; }
    else for (let year = 1; year <= row.durationYears; year++) if (!existing?.years.has(year)) yearsToCreate++;
    if (existing) { programmesUpdated++; if (existing.name !== row.programmeName) renames.push({ kind: "Programme", code: row.programmeCode, from: existing.name, to: row.programmeName }); } else programmesCreated++;
    if (sample.length < 12) sample.push({ line: row.line, school: row.schoolCode, programme: row.programmeName, status: existing ? "update" : "new" });
  }

  const usedSchools = new Set(rows.map((row) => row.schoolCode));
  for (const row of rows) {
    const before = schoolNameByCode.get(row.schoolCode);
    if (before !== undefined && before !== row.schoolName && !renames.some((item) => item.kind === "School" && item.code === row.schoolCode)) renames.push({ kind: "School", code: row.schoolCode, from: before, to: row.schoolName });
  }
  const schoolsCreated = [...usedSchools].filter((code) => !schoolId.has(code)).length;
  return {
    problems,
    renames,
    sample,
    summary: {
      schools: { created: schoolsCreated, updated: usedSchools.size - schoolsCreated },
      departments: { created: departmentsCreated, updated: departmentsUpdated },
      programmes: { created: programmesCreated, updated: programmesUpdated },
      yearsToCreate,
      withoutDuration,
    } satisfies ImportSummary,
  };
}

/**
 * Previews or applies an academic structure import for one university. Upserts only: nothing is ever
 * deleted, existing programmes are never moved to another school, and programme years are only added.
 * The whole file is applied in one transaction, so a failure leaves the database as it was.
 */
export async function importAcademicStructure(
  admin: AdminContext,
  input: { universityId: string; csv: string; dryRun: boolean; defaultDuration?: number | null; context: RequestContext },
): Promise<ImportOutcome> {
  const parsed = validateImport(input.csv);
  const fallback = input.defaultDuration && Number.isInteger(input.defaultDuration) && input.defaultDuration >= 1 && input.defaultDuration <= 8 ? input.defaultDuration : null;
  if (fallback !== null) parsed.rows = parsed.rows.map((row) => ({ ...row, durationYears: row.durationYears ?? fallback }));
  if (parsed.fatal) return { ok: false, status: 400, error: parsed.fatal };
  if (parsed.problems.length > 0) return { ok: false, status: 400, error: `${parsed.problems.length} row${parsed.problems.length === 1 ? " has" : "s have"} problems. Fix them and try again.`, problems: parsed.problems.slice(0, 50) };
  if (parsed.rows.length === 0) return { ok: false, status: 400, error: "The file has no programme rows." };

  const university = await prisma.university.findUnique({ where: { id: input.universityId }, select: { id: true, name: true } });
  if (!university) return { ok: false, status: 404, error: "University not found." };

  if (input.dryRun) {
    const result = await analyse(prisma, university.id, parsed.rows);
    if (result.problems.length > 0) return { ok: false, status: 409, error: "Some rows conflict with existing data.", problems: result.problems.slice(0, 50) };
    return { ok: true, dryRun: true, summary: result.summary, renames: result.renames.slice(0, 100), problems: [], sample: result.sample };
  }

  return prisma.$transaction(
    async (tx): Promise<ImportOutcome> => {
      const result = await analyse(tx, university.id, parsed.rows);
      if (result.problems.length > 0) return { ok: false, status: 409, error: "Some rows conflict with existing data.", problems: result.problems.slice(0, 50) };

      const schoolIds = new Map<string, string>();
      for (const row of parsed.rows) {
        if (schoolIds.has(row.schoolCode)) continue;
        const school = await tx.school.upsert({
          where: { universityId_code: { universityId: university.id, code: row.schoolCode } },
          update: { name: row.schoolName },
          create: { universityId: university.id, code: row.schoolCode, name: row.schoolName },
          select: { id: true },
        });
        schoolIds.set(row.schoolCode, school.id);
      }

      const departmentIds = new Map<string, string>();
      for (const row of parsed.rows) {
        if (!row.departmentCode || !row.departmentName) continue;
        const key = `${row.schoolCode}/${row.departmentCode}`;
        if (departmentIds.has(key)) continue;
        const schoolId = schoolIds.get(row.schoolCode)!;
        const department = await tx.department.upsert({
          where: { schoolId_code: { schoolId, code: row.departmentCode } },
          update: { name: row.departmentName },
          create: { schoolId, code: row.departmentCode, name: row.departmentName },
          select: { id: true },
        });
        departmentIds.set(key, department.id);
      }

      const yearRows: Array<{ programmeId: string; yearNumber: number }> = [];
      for (const row of parsed.rows) {
        const schoolId = schoolIds.get(row.schoolCode)!;
        const departmentId = row.departmentCode ? departmentIds.get(`${row.schoolCode}/${row.departmentCode}`) : undefined;
        const programme = await tx.programme.upsert({
          where: { universityId_code: { universityId: university.id, code: row.programmeCode } },
          // A blank department in the file leaves the stored department alone.
          update: { name: row.programmeName, level: row.level, ...(row.durationYears !== null ? { durationYears: row.durationYears } : {}), ...(departmentId ? { departmentId } : {}) },
          create: { universityId: university.id, schoolId, code: row.programmeCode, name: row.programmeName, level: row.level, durationYears: row.durationYears, ...(departmentId ? { departmentId } : {}) },
          select: { id: true },
        });
        if (row.durationYears !== null) for (let year = 1; year <= row.durationYears; year++) yearRows.push({ programmeId: programme.id, yearNumber: year });
      }
      await tx.programmeYear.createMany({ data: yearRows, skipDuplicates: true });

      await recordAudit(tx, {
        actor: admin,
        action: "ACADEMIC_STRUCTURE_IMPORTED",
        targetType: "UNIVERSITY",
        targetId: university.id,
        universityId: university.id,
        summary: `Imported academic structure for ${university.name}: ${result.summary.programmes.created} new and ${result.summary.programmes.updated} updated programmes`,
        metadata: { rows: parsed.rows.length, withoutDuration: result.summary.withoutDuration, renamed: result.renames.length, schoolsNew: result.summary.schools.created, programmesNew: result.summary.programmes.created, programmesUpdated: result.summary.programmes.updated },
        context: input.context,
      });
      return { ok: true, dryRun: false, summary: result.summary, renames: result.renames.slice(0, 100), problems: [], sample: result.sample };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
