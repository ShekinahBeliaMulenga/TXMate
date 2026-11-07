import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit";
import type { AdminContext } from "./guard";
import type { ImportProblem } from "./academic-import-rules";
import { validateCourseImport, type CourseRow } from "./course-import-rules";
import type { RequestContext } from "./request-context";

export type CourseImportSummary = {
  courses: { created: number; updated: number };
  placements: { created: number; updated: number };
  electiveGroups: { created: number };
};
export type CourseRename = { code: string; from: string; to: string };
export type CourseImportOutcome =
  | { ok: true; dryRun: boolean; summary: CourseImportSummary; renames: CourseRename[]; problems: ImportProblem[] }
  | { ok: false; status: 400 | 404 | 409; error: string; problems?: ImportProblem[] };

type Reader = Pick<typeof prisma, "programme" | "course" | "programmeCourse" | "programmeElectiveGroup">;

async function analyse(db: Reader, universityId: string, rows: CourseRow[]) {
  const programmes = await db.programme.findMany({
    where: { universityId, code: { in: [...new Set(rows.map((row) => row.programmeCode))] } },
    select: { id: true, code: true, years: { select: { id: true, yearNumber: true } } },
  });
  const programmeByCode = new Map<string, { id: string; years: Map<number, string> }>(
    programmes.map((programme: { id: string; code: string; years: Array<{ id: string; yearNumber: number }> }) => [programme.code, { id: programme.id, years: new Map(programme.years.map((year) => [year.yearNumber, year.id])) }]),
  );
  const existingCourses = await db.course.findMany({ where: { universityId, code: { in: [...new Set(rows.map((row) => row.courseCode))] } }, select: { id: true, code: true, name: true } });
  const courseByCode = new Map<string, { id: string; name: string }>(existingCourses.map((course: { id: string; code: string; name: string }) => [course.code, { id: course.id, name: course.name }]));

  const problems: ImportProblem[] = [];
  const reported = new Set<string>();
  const yearIds = new Map<string, string>();
  for (const row of rows) {
    const programme = programmeByCode.get(row.programmeCode);
    if (!programme) {
      if (!reported.has(row.programmeCode)) { reported.add(row.programmeCode); problems.push({ line: row.line, message: `Programme ${row.programmeCode} does not exist at this university. Import or create it first.` }); }
      continue;
    }
    const yearId = programme.years.get(row.yearNumber);
    if (!yearId) {
      const key = `${row.programmeCode}/${row.yearNumber}`;
      if (!reported.has(key)) { reported.add(key); problems.push({ line: row.line, message: `${row.programmeCode} has no year ${row.yearNumber}. Set the programme’s length on the Academic structure page first.` }); }
      continue;
    }
    yearIds.set(`${row.programmeCode}/${row.yearNumber}`, yearId);
  }

  const existingLinks = yearIds.size && courseByCode.size
    ? await db.programmeCourse.findMany({ where: { programmeYearId: { in: [...new Set(yearIds.values())] }, courseId: { in: [...courseByCode.values()].map((course) => course.id) } }, select: { programmeYearId: true, courseId: true } })
    : [];
  const linkSet = new Set<string>(existingLinks.map((link: { programmeYearId: string; courseId: string }) => `${link.programmeYearId}/${link.courseId}`));
  const existingGroups = yearIds.size
    ? await db.programmeElectiveGroup.findMany({ where: { programmeYearId: { in: [...new Set(yearIds.values())] } }, select: { programmeYearId: true, name: true } })
    : [];
  const groupSet = new Set<string>(existingGroups.map((group: { programmeYearId: string; name: string }) => `${group.programmeYearId}/${group.name}`));

  let coursesCreated = 0, coursesUpdated = 0, placementsCreated = 0, placementsUpdated = 0, groupsCreated = 0;
  const courseSeen = new Set<string>();
  const groupSeen = new Set<string>();
  const renames: CourseRename[] = [];
  for (const row of rows) {
    const yearId = yearIds.get(`${row.programmeCode}/${row.yearNumber}`);
    if (!yearId) continue;
    const course = courseByCode.get(row.courseCode);
    if (!courseSeen.has(row.courseCode)) {
      courseSeen.add(row.courseCode);
      if (course) { coursesUpdated++; if (course.name !== row.courseName) renames.push({ code: row.courseCode, from: course.name, to: row.courseName }); } else coursesCreated++;
    }
    if (row.group) {
      const key = `${yearId}/${row.group}`;
      if (!groupSeen.has(key) && !groupSet.has(key)) groupsCreated++;
      groupSeen.add(key);
    }
    if (course && linkSet.has(`${yearId}/${course.id}`)) placementsUpdated++; else placementsCreated++;
  }
  return { problems, yearIds, renames, summary: { courses: { created: coursesCreated, updated: coursesUpdated }, placements: { created: placementsCreated, updated: placementsUpdated }, electiveGroups: { created: groupsCreated } } satisfies CourseImportSummary };
}

/**
 * Previews or applies a course import for one university. Upserts only: courses are matched by code,
 * placements by programme year and course, elective groups by name. Nothing is ever deleted and
 * programmes or years are never created here. One transaction, so a failure leaves nothing half-done.
 */
export async function importCourses(admin: AdminContext, input: { universityId: string; csv: string; dryRun: boolean; context: RequestContext }): Promise<CourseImportOutcome> {
  const parsed = validateCourseImport(input.csv);
  if (parsed.fatal) return { ok: false, status: 400, error: parsed.fatal };
  if (parsed.problems.length > 0) return { ok: false, status: 400, error: `${parsed.problems.length} row${parsed.problems.length === 1 ? " has" : "s have"} problems. Fix them and try again.`, problems: parsed.problems.slice(0, 50) };
  if (parsed.rows.length === 0) return { ok: false, status: 400, error: "The file has no course rows." };

  const university = await prisma.university.findUnique({ where: { id: input.universityId }, select: { id: true, name: true } });
  if (!university) return { ok: false, status: 404, error: "University not found." };

  if (input.dryRun) {
    const result = await analyse(prisma, university.id, parsed.rows);
    if (result.problems.length > 0) return { ok: false, status: 409, error: "Some rows do not match this university’s programmes.", problems: result.problems.slice(0, 50) };
    return { ok: true, dryRun: true, summary: result.summary, renames: result.renames.slice(0, 100), problems: [] };
  }

  return prisma.$transaction(
    async (tx): Promise<CourseImportOutcome> => {
      const result = await analyse(tx, university.id, parsed.rows);
      if (result.problems.length > 0) return { ok: false, status: 409, error: "Some rows do not match this university’s programmes.", problems: result.problems.slice(0, 50) };

      const courseIds = new Map<string, string>();
      for (const row of parsed.rows) {
        if (courseIds.has(row.courseCode)) continue;
        const course = await tx.course.upsert({
          where: { universityId_code: { universityId: university.id, code: row.courseCode } },
          update: { name: row.courseName, ...(row.credits !== null ? { credits: row.credits } : {}) },
          create: { universityId: university.id, code: row.courseCode, name: row.courseName, ...(row.credits !== null ? { credits: row.credits } : {}) },
          select: { id: true },
        });
        courseIds.set(row.courseCode, course.id);
      }
      const groupIds = new Map<string, string>();
      for (const row of parsed.rows) {
        const programmeYearId = result.yearIds.get(`${row.programmeCode}/${row.yearNumber}`)!;
        let electiveGroupId: string | null = null;
        if (row.group) {
          const key = `${programmeYearId}/${row.group}`;
          let id = groupIds.get(key);
          if (!id) {
            const group = await tx.programmeElectiveGroup.upsert({
              where: { programmeYearId_name: { programmeYearId, name: row.group } },
              update: { minSelections: row.minSelections, maxSelections: row.maxSelections },
              create: { programmeYearId, name: row.group, minSelections: row.minSelections, maxSelections: row.maxSelections },
              select: { id: true },
            });
            id = group.id;
            groupIds.set(key, id);
          }
          electiveGroupId = id;
        }
        const courseId = courseIds.get(row.courseCode)!;
        await tx.programmeCourse.upsert({
          where: { programmeYearId_courseId: { programmeYearId, courseId } },
          update: { semester: row.semester, isCompulsory: row.compulsory, electiveGroupId },
          create: { programmeYearId, courseId, semester: row.semester, isCompulsory: row.compulsory, electiveGroupId },
        });
      }
      await recordAudit(tx, {
        actor: admin,
        action: "ACADEMIC_STRUCTURE_IMPORTED",
        targetType: "UNIVERSITY",
        targetId: university.id,
        universityId: university.id,
        summary: `Imported courses for ${university.name}: ${result.summary.courses.created} new and ${result.summary.courses.updated} updated courses, ${result.summary.placements.created} new placements`,
        metadata: { kind: "courses", rows: parsed.rows.length, renamed: result.renames.length, coursesNew: result.summary.courses.created, placementsNew: result.summary.placements.created },
        context: input.context,
      });
      return { ok: true, dryRun: false, summary: result.summary, renames: result.renames.slice(0, 100), problems: [] };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
