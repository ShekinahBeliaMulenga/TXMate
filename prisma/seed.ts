import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

type CourseSeed = {
  code: string;
  name: string;
  electiveGroup?: {
    name: string;
    minSelections: number;
    maxSelections: number;
  };
};

type YearSeed = {
  year: number;
  courses: CourseSeed[];
};

const computerScienceCourses: YearSeed[] = [
  {
    year: 1,
    courses: [
      {
        code: "CS120",
        name: "Introduction to Computer Systems",
      },
      {
        code: "CS130",
        name: "Software Development",
      },
      {
        code: "CS150",
        name: "Introduction to Programming Fundamentals",
      },
      {
        code: "LA111",
        name: "Communication Skills",
      },
      {
        code: "MA110",
        name: "Mathematics I",
      },
      {
        code: "PH110",
        name: "Physics I",
      },
    ],
  },
  {
    year: 2,
    courses: [
      {
        code: "CS220",
        name: "Computer Architecture and Organisation",
      },
      {
        code: "CS225",
        name: "Introduction to Operating Systems",
      },
      {
        code: "CS230",
        name: "Software Engineering",
      },
      {
        code: "CS235",
        name: "Database Systems",
      },
      {
        code: "CS250",
        name: "Data Structures Algorithms and Programming",
      },
      {
        code: "CS270",
        name: "Digital Design",
      },
      {
        code: "MA210",
        name: "Engineering Mathematics",
      },
      {
        code: "PH212",
        name: "Physics II",
      },
    ],
  },
  {
    year: 3,
    courses: [
      {
        code: "CS301",
        name: "Project Management",
      },
      {
        code: "CS320",
        name: "Computer Communication and Parallel Processing",
      },
      {
        code: "CS345",
        name: "Compiler Construction and Theory of Automata",
      },
      {
        code: "CS350",
        name: "Object Oriented Programming",
      },
      {
        code: "CS351",
        name: "Numerical Analysis",
      },
      {
        code: "CS361",
        name: "Introduction to Web Programming",
      },
      {
        code: "MA320",
        name: "Statistics",
      },
    ],
  },
  {
    year: 4,
    courses: [
      {
        code: "CS400",
        name: "Project Seminars",
      },
      {
        code: "CS432",
        name: "Object-Oriented Software Engineering",
        electiveGroup: {
          name: "Computer Science Elective",
          minSelections: 1,
          maxSelections: 1,
        },
      },
      {
        code: "CS445",
        name: "Computer Security",
      },
      {
        code: "CS455",
        name: "Mobile Programming",
        electiveGroup: {
          name: "Computer Science Elective",
          minSelections: 1,
          maxSelections: 1,
        },
      },
      {
        code: "CS460",
        name: "Internet Technologies",
      },
      {
        code: "CS471",
        name: "Introduction to Artificial Intelligence",
      },
      {
        code: "CS480",
        name: "Mobile Networks",
      },
      {
        code: "MG411",
        name: "Management Skills and Entrepreneurship",
      },
    ],
  },
];

async function main() {
  console.log("Starting TXMate academic seed...");

  const university = await prisma.university.upsert({
    where: {
      code: "CBU",
    },
    update: {
      name: "The Copperbelt University",
      slug: "copperbelt-university",
      status: "ACTIVE",
    },
    create: {
      code: "CBU",
      name: "The Copperbelt University",
      slug: "copperbelt-university",
      status: "ACTIVE",
    },
  });

  /*
   * CBU student IDs:
   * - exactly 8 characters
   * - numeric only
   * - no prefix
   *
   * The API validates these settings server-side.
   */
  await prisma.universitySettings.upsert({
    where: {
      universityId: university.id,
    },
    update: {
      studentIdMinLength: 8,
      studentIdMaxLength: 8,
      studentIdPrefix: null,
      studentIdPattern: "^\\d{8}$",
      requireUniversityEmail: false,
      universityEmailDomain: null,
      timezone: "Africa/Lusaka",
    },
    create: {
      universityId: university.id,
      studentIdMinLength: 8,
      studentIdMaxLength: 8,
      studentIdPrefix: null,
      studentIdPattern: "^\\d{8}$",
      requireUniversityEmail: false,
      universityEmailDomain: null,
      timezone: "Africa/Lusaka",
    },
  });

  const school = await prisma.school.upsert({
    where: {
      universityId_code: {
        universityId: university.id,
        code: "SICT",
      },
    },
    update: {
      name: "School of Information and Communication Technology",
    },
    create: {
      universityId: university.id,
      code: "SICT",
      name: "School of Information and Communication Technology",
    },
  });

  const programme = await prisma.programme.upsert({
    where: {
      universityId_code: {
        universityId: university.id,
        code: "BSC-CS",
      },
    },
    update: {
      schoolId: school.id,
      name: "Bachelor of Science in Computer Science",
      level: "BACHELOR",
      durationYears: 4,
    },
    create: {
      universityId: university.id,
      schoolId: school.id,
      code: "BSC-CS",
      name: "Bachelor of Science in Computer Science",
      level: "BACHELOR",
      durationYears: 4,
    },
  });

  for (const yearData of computerScienceCourses) {
    const programmeYear = await prisma.programmeYear.upsert({
      where: {
        programmeId_yearNumber: {
          programmeId: programme.id,
          yearNumber: yearData.year,
        },
      },
      update: {},
      create: {
        programmeId: programme.id,
        yearNumber: yearData.year,
      },
    });

    const electiveGroups = new Map<
      string,
      {
        id: string;
        minSelections: number;
        maxSelections: number;
      }
    >();

    for (const courseData of yearData.courses) {
      if (!courseData.electiveGroup) {
        continue;
      }

      const groupConfig = courseData.electiveGroup;

      const existingGroup =
        await prisma.programmeElectiveGroup.upsert({
          where: {
            programmeYearId_name: {
              programmeYearId: programmeYear.id,
              name: groupConfig.name,
            },
          },
          update: {
            minSelections: groupConfig.minSelections,
            maxSelections: groupConfig.maxSelections,
          },
          create: {
            programmeYearId: programmeYear.id,
            name: groupConfig.name,
            minSelections: groupConfig.minSelections,
            maxSelections: groupConfig.maxSelections,
          },
          select: {
            id: true,
            minSelections: true,
            maxSelections: true,
          },
        });

      electiveGroups.set(groupConfig.name, existingGroup);
    }

    for (const courseData of yearData.courses) {
      const course = await prisma.course.upsert({
        where: {
          universityId_code: {
            universityId: university.id,
            code: courseData.code,
          },
        },
        update: {
          name: courseData.name,
          isActive: true,
        },
        create: {
          universityId: university.id,
          code: courseData.code,
          name: courseData.name,
          isActive: true,
        },
      });

      const electiveGroup = courseData.electiveGroup
        ? electiveGroups.get(courseData.electiveGroup.name)
        : null;

      await prisma.programmeCourse.upsert({
        where: {
          programmeYearId_courseId: {
            programmeYearId: programmeYear.id,
            courseId: course.id,
          },
        },
        update: {
          isCompulsory: !courseData.electiveGroup,
          electiveGroupId: electiveGroup?.id ?? null,
        },
        create: {
          programmeYearId: programmeYear.id,
          courseId: course.id,
          isCompulsory: !courseData.electiveGroup,
          electiveGroupId: electiveGroup?.id ?? null,
        },
      });
    }
  }

  const courseCount = await prisma.course.count({
    where: {
      universityId: university.id,
    },
  });

  const programmeYearCount = await prisma.programmeYear.count({
    where: {
      programmeId: programme.id,
    },
  });

  const programmeCourseCount =
    await prisma.programmeCourse.count({
      where: {
        programmeYear: {
          programmeId: programme.id,
        },
      },
    });

  const electiveGroupCount =
    await prisma.programmeElectiveGroup.count({
      where: {
        programmeYear: {
          programmeId: programme.id,
        },
      },
    });

  console.log("");
  console.log("TXMate academic seed completed.");
  console.log(`University: ${university.name}`);
  console.log(`School: ${school.name}`);
  console.log(`Programme: ${programme.name}`);
  console.log(`Programme years: ${programmeYearCount}`);
  console.log(`Courses: ${courseCount}`);
  console.log(`Programme-course mappings: ${programmeCourseCount}`);
  console.log(`Elective groups: ${electiveGroupCount}`);
  console.log("");
  console.log(
    "No student, tutor, booking, payment, or authentication records were created.",
  );
}

main()
  .catch(async (error) => {
    console.error("TXMate academic seed failed.");
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });