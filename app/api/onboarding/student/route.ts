import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uniqueViolationTarget } from "@/lib/db-errors";
import { PHONE_FORMAT_MESSAGE, PHONE_TAKEN_MESSAGE, normalizeZambianMobile, zambianPhoneVariants } from "@/lib/zambia-phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StudentOnboardingInput = {
  universityId?: unknown; schoolId?: unknown; departmentId?: unknown; programmeId?: unknown;
  programmeYearId?: unknown; studentId?: unknown; gender?: unknown; phoneNumber?: unknown;
  informationConfirmed?: unknown; selectedElectiveCourseIds?: unknown;
};

const MAX_BODY_SIZE = 10_000;
const STUDENT_ID_TAKEN = "That student ID is already registered at this university.";
const HAS_PROFILE = "This account already has a student profile.";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const courses = (n: number) => `${n} course${n === 1 ? "" : "s"}`;

function validateStudentId(
  studentId: string,
  s: { studentIdMinLength: number; studentIdMaxLength: number; studentIdPrefix: string | null; studentIdPattern: string | null }
): string | null {
  if (studentId.length < s.studentIdMinLength || studentId.length > s.studentIdMaxLength) {
    return s.studentIdMinLength === s.studentIdMaxLength
      ? `Student ID must be exactly ${s.studentIdMinLength} characters.`
      : `Student ID must be between ${s.studentIdMinLength} and ${s.studentIdMaxLength} characters.`;
  }
  if (s.studentIdPrefix && !studentId.startsWith(s.studentIdPrefix)) return `Student ID must start with ${s.studentIdPrefix}.`;
  if (s.studentIdPattern) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(s.studentIdPattern);
    } catch {
      return "The university student ID validation pattern is invalid. Contact an administrator.";
    }
    if (!pattern.test(studentId)) return "Student ID format is not valid for this university.";
  }
  return null;
}

function normalizeIdArray(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return ids.length === value.length ? [...new Set(ids.map((id) => id.trim()))] : null;
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return fail("You must be signed in to complete onboarding.", 401);

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE) return fail("Request body is too large.", 413);

    let body: StudentOnboardingInput;
    try {
      body = (await request.json()) as StudentOnboardingInput;
    } catch {
      return fail("Request body must contain valid JSON.", 400);
    }
    if (!body || typeof body !== "object") return fail("Request body must contain valid JSON.", 400);

    if (body.informationConfirmed !== true) {
      return fail("You must confirm that the information you provided is accurate before completing onboarding.", 400);
    }

    const requiredFields: Array<[string, unknown]> = [
      ["universityId", body.universityId], ["schoolId", body.schoolId], ["departmentId", body.departmentId],
      ["programmeId", body.programmeId], ["programmeYearId", body.programmeYearId],
      ["studentId", body.studentId], ["gender", body.gender],
    ];
    for (const [field, value] of requiredFields) {
      if (!isNonEmptyString(value)) return fail(`${field} is required.`, 400);
    }

    const universityId = (body.universityId as string).trim();
    const schoolId = (body.schoolId as string).trim();
    const departmentId = (body.departmentId as string).trim();
    const programmeId = (body.programmeId as string).trim();
    const programmeYearId = (body.programmeYearId as string).trim();
    const studentId = (body.studentId as string).trim();
    const gender = (body.gender as string).trim();

    if (gender !== "MALE" && gender !== "FEMALE") return fail("Gender must be either MALE or FEMALE.", 400);

    let phoneNumber: string | null = null;
    if (body.phoneNumber !== undefined && body.phoneNumber !== null) {
      if (!isNonEmptyString(body.phoneNumber)) return fail("Phone number must be a non-empty string when provided.", 400);
      if (body.phoneNumber.trim().length > 30) return fail("Phone number is too long.", 400);
      phoneNumber = normalizeZambianMobile(body.phoneNumber);
      if (!phoneNumber) return fail(PHONE_FORMAT_MESSAGE, 400);
    }

    const selectedElectiveCourseIds = normalizeIdArray(body.selectedElectiveCourseIds);
    if (selectedElectiveCourseIds === null) return fail("selectedElectiveCourseIds must be an array of course IDs.", 400);

    // Prevent a user from creating more than one student profile.
    const existingProfile = await prisma.studentProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } });
    if (existingProfile) return fail(HAS_PROFILE, 409);

    const university = await prisma.university.findUnique({
      where: { id: universityId },
      select: {
        id: true, name: true, status: true,
        settings: { select: { studentIdMinLength: true, studentIdMaxLength: true, studentIdPrefix: true, studentIdPattern: true } },
      },
    });
    if (!university || university.status !== "ACTIVE") return fail("Selected university does not exist or is inactive.", 400);
    if (!university.settings) return fail("University onboarding settings are not configured.", 409);

    const studentIdError = validateStudentId(studentId, university.settings);
    if (studentIdError) return fail(studentIdError, 400);

    const duplicateStudentId = await prisma.studentProfile.findUnique({
      where: { universityId_studentId: { universityId: university.id, studentId } },
      select: { id: true },
    });
    if (duplicateStudentId) return fail(STUDENT_ID_TAKEN, 409);

    // The phone number must not already belong to another account.
    if (phoneNumber) {
      const duplicatePhone = await prisma.studentProfile.findFirst({
        where: { phoneNumber: { in: zambianPhoneVariants(phoneNumber) } },
        select: { id: true },
      });
      if (duplicatePhone) return fail(PHONE_TAKEN_MESSAGE, 409);
    }

    // Validate school -> department -> programme -> university.
    const school = await prisma.school.findFirst({
      where: { id: schoolId, universityId: university.id },
      select: { id: true, name: true },
    });
    if (!school) return fail("Selected school does not belong to this university.", 400);

    const department = await prisma.department.findFirst({
      where: { id: departmentId, schoolId: school.id },
      select: { id: true, name: true },
    });
    if (!department) return fail("Selected department does not belong to this school.", 400);

    const programme = await prisma.programme.findFirst({
      where: { id: programmeId, universityId: university.id, schoolId: school.id, departmentId: department.id },
      select: { id: true, code: true, name: true },
    });
    if (!programme) return fail("Selected programme does not belong to this department, school, and university.", 400);

    // Load the programme year and its complete curriculum.
    const programmeYear = await prisma.programmeYear.findFirst({
      where: { id: programmeYearId, programmeId: programme.id },
      select: {
        id: true,
        yearNumber: true,
        programmeCourses: {
          orderBy: [{ isCompulsory: "desc" }, { course: { code: "asc" } }],
          select: {
            id: true, courseId: true, semester: true, isCompulsory: true, electiveGroupId: true,
            electiveGroup: { select: { id: true, name: true, minSelections: true, maxSelections: true } },
            course: { select: { id: true, code: true, name: true, description: true, credits: true, isActive: true } },
          },
        },
      },
    });
    if (!programmeYear) return fail("Selected programme year does not belong to this programme.", 400);
    if (programmeYear.programmeCourses.length === 0) return fail("The selected programme year has no configured courses.", 409);
    if (programmeYear.programmeCourses.some((pc) => !pc.course.isActive)) {
      return fail("The programme curriculum contains an inactive course.", 409);
    }

    const programmeCourseByCourseId = new Map(programmeYear.programmeCourses.map((pc) => [pc.courseId, pc]));

    // Validate elective selections and group them.
    const selectedByGroup = new Map<string, number>();
    for (const courseId of selectedElectiveCourseIds) {
      const pc = programmeCourseByCourseId.get(courseId);
      if (!pc) return fail("One or more selected elective courses do not belong to the selected programme year.", 400);
      if (pc.isCompulsory) return fail("A compulsory course cannot be submitted as an elective selection.", 400);
      if (!pc.electiveGroup) return fail("One or more selected elective courses are not assigned to an elective group.", 409);
      selectedByGroup.set(pc.electiveGroup.id, (selectedByGroup.get(pc.electiveGroup.id) ?? 0) + 1);
    }

    // Collect every elective group in the curriculum.
    const electiveGroups = new Map<string, { id: string; name: string; minSelections: number; maxSelections: number }>();
    for (const pc of programmeYear.programmeCourses) {
      if (pc.electiveGroup) electiveGroups.set(pc.electiveGroup.id, pc.electiveGroup);
      else if (!pc.isCompulsory) return fail("The curriculum contains a non-compulsory course without an elective group.", 409);
    }

    // Enforce the selection rules for every group.
    for (const group of electiveGroups.values()) {
      const count = selectedByGroup.get(group.id) ?? 0;
      if (count < group.minSelections) return fail(`${group.name}: select at least ${courses(group.minSelections)}.`, 400);
      if (count > group.maxSelections) return fail(`${group.name}: select no more than ${courses(group.maxSelections)}.`, 400);
    }

    // All compulsory courses plus the selected electives.
    const selected = new Set(selectedElectiveCourseIds);
    const enrolledProgrammeCourses = programmeYear.programmeCourses.filter((pc) => pc.isCompulsory || selected.has(pc.courseId));

    // The university's current academic year (there must be exactly one).
    const currentAcademicYears = await prisma.academicYear.findMany({
      where: { universityId: university.id, isCurrent: true },
      orderBy: { startDate: "desc" },
      take: 2,
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (currentAcademicYears.length === 0) return fail("This university does not have a current academic year configured.", 409);
    if (currentAcademicYears.length > 1) {
      return fail("This university has more than one current academic year. An administrator must resolve the configuration.", 409);
    }
    const academicYear = currentAcademicYears[0];

    // Create the profile and enrolled courses atomically.
    const result = await prisma.$transaction(
      async (tx) => {
        const profile = await tx.studentProfile.create({
          data: {
            userId: session.user.id,
            universityId: university.id,
            studentId,
            gender: gender as "MALE" | "FEMALE",
            programmeId: programme.id,
            programmeYearId: programmeYear.id,
            phoneNumber,
          },
          select: {
            id: true, studentId: true, gender: true, status: true,
            programme: { select: { id: true, code: true, name: true } },
            programmeYear: { select: { id: true, yearNumber: true } },
          },
        });
        await tx.studentCourse.createMany({
          data: enrolledProgrammeCourses.map((pc) => ({
            studentProfileId: profile.id,
            courseId: pc.courseId,
            academicYearId: academicYear.id,
            semester: pc.semester,
          })),
        });
        return profile;
      },
      { timeout: 15000, maxWait: 10000 }
    );

    // The structure expected by the onboarding form.
    return NextResponse.json(
      {
        message: "Student onboarding completed successfully.",
        studentProfile: result,
        academicYear: { id: academicYear.id, name: academicYear.name },
        courses: enrolledProgrammeCourses.map((pc) => ({
          id: pc.id,
          semester: pc.semester,
          isCompulsory: pc.isCompulsory,
          electiveGroup: pc.electiveGroup,
          course: { id: pc.course.id, code: pc.course.code, name: pc.course.name, description: pc.course.description, credits: pc.course.credits },
        })),
      },
      { status: 201 }
    );
  } catch (error) {
    // A concurrent request can pass the checks above and hit a database unique constraint.
    const target = uniqueViolationTarget(error);
    if (target !== null) {
      if (target.includes("phone")) return fail(PHONE_TAKEN_MESSAGE, 409);
      if (/student_?id/.test(target)) return fail(STUDENT_ID_TAKEN, 409);
      if (/user_?id/.test(target)) return fail(HAS_PROFILE, 409);
      return fail("Some of the details you entered are already registered to another account.", 409);
    }
    console.error("Student onboarding failed:", error);
    return fail("An unexpected error occurred while completing onboarding.", 500);
  }
}