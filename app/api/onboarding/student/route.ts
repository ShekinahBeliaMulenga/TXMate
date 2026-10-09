import { headers } from "next/headers";



import { NextResponse } from "next/server";



import { auth } from "@/lib/auth";

import { prisma } from "@/lib/prisma";



export const runtime = "nodejs";

export const dynamic = "force-dynamic";



type StudentOnboardingInput = {

  universityId?: unknown;

  schoolId?: unknown;

  programmeId?: unknown;

  programmeYearId?: unknown;

  studentId?: unknown;

  gender?: unknown;

  phoneNumber?: unknown;
  informationConfirmed?: unknown;

  selectedElectiveCourseIds?: unknown;

};



const MAX_BODY_SIZE = 10_000;



function isNonEmptyString(value: unknown): value is string {

  return typeof value === "string" && value.trim().length > 0;

}



function normalizeString(value: string): string {

  return value.trim();

}



function validateStudentId(

  studentId: string,

  settings: {

    studentIdMinLength: number;

    studentIdMaxLength: number;

    studentIdPrefix: string | null;

    studentIdPattern: string | null;

  },

): string | null {

  if (

    studentId.length < settings.studentIdMinLength ||

    studentId.length > settings.studentIdMaxLength

  ) {

    if (

      settings.studentIdMinLength ===

      settings.studentIdMaxLength

    ) {

      return `Student ID must be exactly ${settings.studentIdMinLength} characters.`;

    }



    return `Student ID must be between ${settings.studentIdMinLength} and ${settings.studentIdMaxLength} characters.`;

  }



  if (

    settings.studentIdPrefix &&

    !studentId.startsWith(settings.studentIdPrefix)

  ) {

    return `Student ID must start with ${settings.studentIdPrefix}.`;

  }



  if (settings.studentIdPattern) {

    let pattern: RegExp;



    try {

      pattern = new RegExp(settings.studentIdPattern);

    } catch {

      return "The university student ID validation pattern is invalid. Contact an administrator.";

    }



    if (!pattern.test(studentId)) {

      return "Student ID format is not valid for this university.";

    }

  }



  return null;

}



function normalizeIdArray(value: unknown): string[] | null {

  if (value === undefined || value === null) {

    return [];

  }



  if (!Array.isArray(value)) {

    return null;

  }



  const ids = value.filter(

    (item): item is string =>

      typeof item === "string" && item.trim().length > 0,

  );



  if (ids.length !== value.length) {

    return null;

  }



  return [...new Set(ids.map((id) => id.trim()))];

}



export async function POST(request: Request) {

  try {

    const session = await auth.api.getSession({

      headers: await headers(),

    });



    if (!session) {

      return NextResponse.json(

        {

          error: "You must be signed in to complete onboarding.",

        },

        { status: 401 },

      );

    }



    const contentLength = request.headers.get("content-length");



    if (contentLength) {

      const parsedContentLength = Number(contentLength);



      if (

        Number.isFinite(parsedContentLength) &&

        parsedContentLength > MAX_BODY_SIZE

      ) {

        return NextResponse.json(

          {

            error: "Request body is too large.",

          },

          { status: 413 },

        );

      }

    }



    let body: StudentOnboardingInput;



    try {

      body = (await request.json()) as StudentOnboardingInput;

    } catch {

      return NextResponse.json(

        {

          error: "Request body must contain valid JSON.",

        },

        { status: 400 },

      );

    }



    if (body.informationConfirmed !== true) {
      return NextResponse.json(
        {
          error:
            "You must confirm that the information you provided is accurate before completing onboarding.",
        },
        { status: 400 },
      );
    }

    const requiredFields: Array<[string, unknown]> = [

      ["universityId", body.universityId],

      ["schoolId", body.schoolId],

      ["programmeId", body.programmeId],

      ["programmeYearId", body.programmeYearId],

      ["studentId", body.studentId],

      ["gender", body.gender],

    ];



    for (const [field, value] of requiredFields) {

      if (!isNonEmptyString(value)) {

        return NextResponse.json(

          {

            error: `${field} is required.`,

          },

          { status: 400 },

        );

      }

    }



    const universityId = normalizeString(

      body.universityId as string,

    );



    const schoolId = normalizeString(

      body.schoolId as string,

    );



    const programmeId = normalizeString(

      body.programmeId as string,

    );



    const programmeYearId = normalizeString(

      body.programmeYearId as string,

    );



    const studentId = normalizeString(

      body.studentId as string,

    );



    const gender = normalizeString(

      body.gender as string,

    );



    if (gender !== "MALE" && gender !== "FEMALE") {

      return NextResponse.json(

        {

          error: "Gender must be either MALE or FEMALE.",

        },

        { status: 400 },

      );

    }



    let phoneNumber: string | null = null;



    if (

      body.phoneNumber !== undefined &&

      body.phoneNumber !== null

    ) {

      if (!isNonEmptyString(body.phoneNumber)) {

        return NextResponse.json(

          {

            error:

              "Phone number must be a non-empty string when provided.",

          },

          { status: 400 },

        );

      }



      phoneNumber = normalizeString(

        body.phoneNumber as string,

      );



      if (phoneNumber.length > 30) {

        return NextResponse.json(

          {

            error: "Phone number is too long.",

          },

          { status: 400 },

        );

      }

    }



    const selectedElectiveCourseIds =

      normalizeIdArray(body.selectedElectiveCourseIds);



    if (selectedElectiveCourseIds === null) {

      return NextResponse.json(

        {

          error:

            "selectedElectiveCourseIds must be an array of course IDs.",

        },

        { status: 400 },

      );

    }



    /*

     * Prevent a user from creating more than one

     * student profile.

     */

    const existingProfile =

      await prisma.studentProfile.findUnique({

        where: {

          userId: session.user.id,

        },

        select: {

          id: true,

        },

      });



    if (existingProfile) {

      return NextResponse.json(

        {

          error: "This account already has a student profile.",

        },

        { status: 409 },

      );

    }



    /*

     * Load university configuration.

     */

    const university = await prisma.university.findUnique({

      where: {

        id: universityId,

      },

      select: {

        id: true,

        name: true,

        status: true,

        settings: {

          select: {

            studentIdMinLength: true,

            studentIdMaxLength: true,

            studentIdPrefix: true,

            studentIdPattern: true,

          },

        },

      },

    });



    if (

      !university ||

      university.status !== "ACTIVE"

    ) {

      return NextResponse.json(

        {

          error:

            "Selected university does not exist or is inactive.",

        },

        { status: 400 },

      );

    }



    if (!university.settings) {

      return NextResponse.json(

        {

          error:

            "University onboarding settings are not configured.",

        },

        { status: 409 },

      );

    }



    /*

     * Validate the student ID against the university

     * configuration on the server.

     */

    const studentIdError = validateStudentId(

      studentId,

      university.settings,

    );



    if (studentIdError) {

      return NextResponse.json(

        {

          error: studentIdError,

        },

        { status: 400 },

      );

    }



    /*

     * Make sure the student ID is unique within

     * the university.

     */

    const duplicateStudentId =

      await prisma.studentProfile.findUnique({

        where: {

          universityId_studentId: {

            universityId: university.id,

            studentId,

          },

        },

        select: {

          id: true,

        },

      });



    if (duplicateStudentId) {

      return NextResponse.json(

        {

          error:

            "That student ID is already registered at this university.",

        },

        { status: 409 },

      );

    }



    /*

     * Validate school -> university relationship.

     */

    const school = await prisma.school.findFirst({

      where: {

        id: schoolId,

        universityId: university.id,

      },

      select: {

        id: true,

        name: true,

      },

    });



    if (!school) {

      return NextResponse.json(

        {

          error:

            "Selected school does not belong to this university.",

        },

        { status: 400 },

      );

    }



    /*

     * Validate programme -> school -> university.

     */

    const programme = await prisma.programme.findFirst({

      where: {

        id: programmeId,

        universityId: university.id,

        schoolId: school.id,

      },

      select: {

        id: true,

        code: true,

        name: true,

      },

    });



    if (!programme) {

      return NextResponse.json(

        {

          error:

            "Selected programme does not belong to this school and university.",

        },

        { status: 400 },

      );

    }



    /*

     * Load the programme year and its complete curriculum.

     */

    const programmeYear =

      await prisma.programmeYear.findFirst({

        where: {

          id: programmeYearId,

          programmeId: programme.id,

        },

        select: {

          id: true,

          yearNumber: true,

          programmeCourses: {

            orderBy: [

              {

                isCompulsory: "desc",

              },

              {

                course: {

                  code: "asc",

                },

              },

            ],

            select: {

              id: true,

              courseId: true,

              semester: true,

              isCompulsory: true,

              electiveGroupId: true,

              electiveGroup: {

                select: {

                  id: true,

                  name: true,

                  minSelections: true,

                  maxSelections: true,

                },

              },

              course: {

                select: {

                  id: true,

                  code: true,

                  name: true,

                  description: true,

                  credits: true,

                  isActive: true,

                },

              },

            },

          },

        },

      });



    if (!programmeYear) {

      return NextResponse.json(

        {

          error:

            "Selected programme year does not belong to this programme.",

        },

        { status: 400 },

      );

    }



    if (

      programmeYear.programmeCourses.length === 0

    ) {

      return NextResponse.json(

        {

          error:

            "The selected programme year has no configured courses.",

        },

        { status: 409 },

      );

    }



    /*

     * Make sure every curriculum course is active.

     */

    const inactiveCourse = programmeYear.programmeCourses.find(

      (programmeCourse) =>

        !programmeCourse.course.isActive,

    );



    if (inactiveCourse) {

      return NextResponse.json(

        {

          error:

            "The programme curriculum contains an inactive course.",

        },

        { status: 409 },

      );

    }



    /*

     * Map course IDs to ProgrammeCourse records.

     */

    const programmeCourseByCourseId = new Map(

      programmeYear.programmeCourses.map(

        (programmeCourse) => [

          programmeCourse.courseId,

          programmeCourse,

        ],

      ),

    );



    /*

     * Validate elective selections.

     */

    for (const courseId of selectedElectiveCourseIds) {

      const programmeCourse =

        programmeCourseByCourseId.get(courseId);



      if (!programmeCourse) {

        return NextResponse.json(

          {

            error:

              "One or more selected elective courses do not belong to the selected programme year.",

          },

          { status: 400 },

        );

      }



      if (programmeCourse.isCompulsory) {

        return NextResponse.json(

          {

            error:

              "A compulsory course cannot be submitted as an elective selection.",

          },

          { status: 400 },

        );

      }



      if (!programmeCourse.electiveGroup) {

        return NextResponse.json(

          {

            error:

              "One or more selected elective courses are not assigned to an elective group.",

          },

          { status: 409 },

        );

      }

    }



    /*

     * Group selected electives.

     */

    const selectedByGroup = new Map<

      string,

      string[]

    >();



    for (const courseId of selectedElectiveCourseIds) {

      const programmeCourse =

        programmeCourseByCourseId.get(courseId);



      if (!programmeCourse?.electiveGroup) {

        continue;

      }



      const groupId =

        programmeCourse.electiveGroup.id;



      const current =

        selectedByGroup.get(groupId) ?? [];



      current.push(courseId);



      selectedByGroup.set(groupId, current);

    }



    /*

     * Collect all elective groups in the curriculum.

     */

    const electiveGroups = new Map<

      string,

      {

        id: string;

        name: string;

        minSelections: number;

        maxSelections: number;

      }

    >();



    for (const programmeCourse of

      programmeYear.programmeCourses) {

      if (!programmeCourse.electiveGroup) {

        if (!programmeCourse.isCompulsory) {

          return NextResponse.json(

            {

              error:

                "The curriculum contains a non-compulsory course without an elective group.",

            },

            { status: 409 },

          );

        }



        continue;

      }



      electiveGroups.set(

        programmeCourse.electiveGroup.id,

        programmeCourse.electiveGroup,

      );

    }



    /*

     * Enforce the selection rules for every group.

     */

    for (const group of electiveGroups.values()) {

      const selectedCount =

        selectedByGroup.get(group.id)?.length ?? 0;



      if (

        selectedCount < group.minSelections

      ) {

        return NextResponse.json(

          {

            error: `${group.name}: select at least ${group.minSelections} course${

              group.minSelections === 1

                ? ""

                : "s"

            }.`,

          },

          { status: 400 },

        );

      }



      if (

        selectedCount > group.maxSelections

      ) {

        return NextResponse.json(

          {

            error: `${group.name}: select no more than ${group.maxSelections} course${

              group.maxSelections === 1

                ? ""

                : "s"

            }.`,

          },

          { status: 400 },

        );

      }

    }



    /*

     * Determine the courses the student actually takes:

     *

     * - all compulsory courses

     * - selected elective courses

     */

    const enrolledProgrammeCourses =

      programmeYear.programmeCourses.filter(

        (programmeCourse) =>

          programmeCourse.isCompulsory ||

          selectedElectiveCourseIds.includes(

            programmeCourse.courseId,

          ),

      );



    /*

     * Find the university's current academic year.

     */

    const currentAcademicYears =

      await prisma.academicYear.findMany({

        where: {

          universityId: university.id,

          isCurrent: true,

        },

        orderBy: {

          startDate: "desc",

        },

        take: 2,

        select: {

          id: true,

          name: true,

          startDate: true,

          endDate: true,

        },

      });



    if (currentAcademicYears.length === 0) {

      return NextResponse.json(

        {

          error:

            "This university does not have a current academic year configured.",

        },

        { status: 409 },

      );

    }



    if (currentAcademicYears.length > 1) {

      return NextResponse.json(

        {

          error:

            "This university has more than one current academic year. An administrator must resolve the configuration.",

        },

        { status: 409 },

      );

    }



    const academicYear = currentAcademicYears[0];



    /*

     * Create the profile and enrolled courses atomically.

     */

    const result = await prisma.$transaction(

      async (tx) => {

        const profile =

          await tx.studentProfile.create({

            data: {

              userId: session.user.id,

              universityId: university.id,

              studentId,

              gender:

                gender as "MALE" | "FEMALE",

              programmeId: programme.id,

              programmeYearId:

                programmeYear.id,

              phoneNumber,

            },

            select: {

              id: true,

              studentId: true,

              gender: true,

              status: true,

              programme: {

                select: {

                  id: true,

                  code: true,

                  name: true,

                },

              },

              programmeYear: {

                select: {

                  id: true,

                  yearNumber: true,

                },

              },

            },

          });



        await tx.studentCourse.createMany({

          data: enrolledProgrammeCourses.map(

            (programmeCourse) => ({

              studentProfileId:

                profile.id,

              courseId:

                programmeCourse.courseId,

              academicYearId:

                academicYear.id,

              semester:

                programmeCourse.semester,

            }),

          ),

        });



        return profile;

      },

      {

        timeout: 15000,

        maxWait: 10000,

      },

    );



    /*

     * Return the exact structure expected by the

     * onboarding form.

     */

    const courses = enrolledProgrammeCourses.map(

      (programmeCourse) => ({

        id: programmeCourse.id,

        semester: programmeCourse.semester,

        isCompulsory:

          programmeCourse.isCompulsory,

        electiveGroup:

          programmeCourse.electiveGroup,

        course: {

          id: programmeCourse.course.id,

          code: programmeCourse.course.code,

          name: programmeCourse.course.name,

          description:

            programmeCourse.course.description,

          credits: programmeCourse.course.credits,

        },

      }),

    );



    return NextResponse.json(

      {

        message:

          "Student onboarding completed successfully.",



        studentProfile: result,



        academicYear: {

          id: academicYear.id,

          name: academicYear.name,

        },



        courses,

      },

      {

        status: 201,

      },

    );

  } catch (error) {

    console.error(

      "Student onboarding failed:",

      error,

    );



    return NextResponse.json(

      {

        error:

          "An unexpected error occurred while completing onboarding.",

      },

      {

        status: 500,

      },

    );

  }

}