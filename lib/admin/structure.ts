import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit";
import type { AdminContext } from "./guard";
import type { RequestContext } from "./request-context";
import { DURATION_MAX, DURATION_MIN, type StructureSchool } from "./structure-types";
import { normalizeCode } from "./university-rules";

type Fail = { ok: false; status: 400 | 404 | 409; error: string };
const fail = (status: 400 | 404 | 409, error: string): Fail => ({ ok: false, status, error });

/** Everything a university teaches, grouped school by school, with the counts needed to see what is unusable. */
export async function getStructure(universityId: string): Promise<StructureSchool[]> {
  const schools = await prisma.school.findMany({
    where: { universityId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      departments: { orderBy: { name: "asc" }, select: { id: true, code: true, name: true } },
      programmes: {
        orderBy: { name: "asc" },
        select: { id: true, code: true, name: true, level: true, durationYears: true, departmentId: true, _count: { select: { years: true, studentProfiles: true } }, years: { select: { _count: { select: { programmeCourses: true } } } } },
      },
    },
  });
  return schools.map((school) => ({
    id: school.id,
    code: school.code,
    name: school.name,
    departments: school.departments,
    programmes: school.programmes.map((programme) => ({
      id: programme.id,
      code: programme.code,
      name: programme.name,
      level: programme.level,
      durationYears: programme.durationYears,
      departmentId: programme.departmentId,
      years: programme._count.years,
      students: programme._count.studentProfiles,
      courses: programme.years.reduce((sum, year) => sum + year._count.programmeCourses, 0),
    })),
  }));
}

/**
 * Sets a programme's department and/or length. Lengthening adds years 1..n; shortening below years that
 * already exist is refused (students may be placed in them). Nothing is ever deleted.
 */
export async function updateProgramme(
  admin: AdminContext,
  input: { programmeId: string; departmentId?: string; durationYears?: number; context: RequestContext },
): Promise<{ ok: true; message: string } | Fail> {
  if (input.departmentId === undefined && input.durationYears === undefined) return fail(400, "Nothing to change.");
  if (input.durationYears !== undefined && (!Number.isInteger(input.durationYears) || input.durationYears < DURATION_MIN || input.durationYears > DURATION_MAX)) {
    return fail(400, `Length must be a whole number of years from ${DURATION_MIN} to ${DURATION_MAX}.`);
  }
  return prisma.$transaction(async (tx) => {
    const programme = await tx.programme.findUnique({
      where: { id: input.programmeId },
      select: { id: true, name: true, code: true, schoolId: true, universityId: true, years: { select: { yearNumber: true } } },
    });
    if (!programme) return fail(404, "Programme not found.");
    const changes: string[] = [];
    const data: { departmentId?: string; durationYears?: number } = {};

    if (input.departmentId !== undefined) {
      const department = await tx.department.findFirst({ where: { id: input.departmentId, schoolId: programme.schoolId }, select: { id: true, name: true } });
      if (!department) return fail(400, "Pick a department from the same school as the programme.");
      data.departmentId = department.id;
      changes.push(`department ${department.name}`);
    }
    if (input.durationYears !== undefined) {
      const highest = programme.years.reduce((max, year) => Math.max(max, year.yearNumber), 0);
      if (input.durationYears < highest) return fail(409, `This programme already has ${highest} years, so it cannot be shortened to ${input.durationYears}.`);
      data.durationYears = input.durationYears;
      const missing = Array.from({ length: input.durationYears }, (_, index) => index + 1).filter((year) => !programme.years.some((existing) => existing.yearNumber === year));
      if (missing.length > 0) await tx.programmeYear.createMany({ data: missing.map((yearNumber) => ({ programmeId: programme.id, yearNumber })), skipDuplicates: true });
      changes.push(`${input.durationYears} years`);
    }
    await tx.programme.update({ where: { id: programme.id }, data });

    await recordAudit(tx, {
      actor: admin,
      action: "ACADEMIC_STRUCTURE_UPDATED",
      targetType: "UNIVERSITY",
      targetId: programme.universityId,
      universityId: programme.universityId,
      summary: `Set ${programme.name}: ${changes.join(", ")}`,
      metadata: { programme: programme.code, ...(data.departmentId ? { departmentId: data.departmentId } : {}), ...(data.durationYears ? { durationYears: data.durationYears } : {}) },
      context: input.context,
    });
    return { ok: true as const, message: "Saved." };
  });
}

export async function createDepartment(
  admin: AdminContext,
  input: { schoolId: string; code: string; name: string; context: RequestContext },
): Promise<{ ok: true; message: string } | Fail> {
  const code = normalizeCode(input.code);
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!/^[A-Z0-9-]{1,12}$/.test(code)) return fail(400, "Code must be 1 to 12 letters, numbers or dashes.");
  if (name.length < 3 || name.length > 150) return fail(400, "Name must be 3 to 150 characters.");
  return prisma.$transaction(async (tx) => {
    const school = await tx.school.findUnique({ where: { id: input.schoolId }, select: { id: true, name: true, universityId: true } });
    if (!school) return fail(404, "School not found.");
    const taken = await tx.department.findUnique({ where: { schoolId_code: { schoolId: school.id, code } }, select: { id: true } });
    if (taken) return fail(409, `${school.name} already has a department with code ${code}.`);
    await tx.department.create({ data: { schoolId: school.id, code, name } });
    await recordAudit(tx, {
      actor: admin,
      action: "ACADEMIC_STRUCTURE_UPDATED",
      targetType: "UNIVERSITY",
      targetId: school.universityId,
      universityId: school.universityId,
      summary: `Added department ${name} to ${school.name}`,
      metadata: { code },
      context: input.context,
    });
    return { ok: true as const, message: "Department added." };
  });
}
