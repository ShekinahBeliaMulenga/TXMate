import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthenticatedUser() {
  const session = await auth.api.getSession({
    headers: await import("next/headers").then(({ headers }) => headers()),
  });
  return session?.user ?? null;
}

/**
 * GET /api/student/academic-mate/profile
 * Returns the authenticated Academic Mate profile, including the linked StudentProfile.
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const academicMate = await prisma.academicMateProfile.findUnique({
      where: { userId: user.id },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
        university: {
          select: { id: true, code: true, name: true, slug: true },
        },
        studentProfile: {
          select: {
            id: true,
            studentId: true,
            gender: true,
            status: true,
            phoneNumber: true,
            bio: true,
            profileVisibility: true,
            showStudentId: true,
            showPhoneNumber: true,
            programme: {
              select: {
                id: true,
                code: true,
                name: true,
                level: true,
                durationYears: true,
                school: {
                  select: { id: true, code: true, name: true },
                },
                department: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
            programmeYear: {
              select: { id: true, yearNumber: true },
            },
            courses: {
              orderBy: [{ course: { code: "asc" } }],
              select: {
                id: true,
                semester: true,
                status: true,
                academicYear: {
                  select: { id: true, name: true, isCurrent: true },
                },
                course: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    description: true,
                    credits: true,
                  },
                },
              },
            },
          },
        },
        offerings: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            courseId: true,
            title: true,
            description: true,
            rate: true,
            currency: true,
            sessionDurationMinutes: true,
            status: true,
            verificationStatus: true,
            rateType: true,
            rateDetails: true,
            createdAt: true,
            updatedAt: true,
            course: {
              select: {
                id: true,
                code: true,
                name: true,
                description: true,
              },
            },
            topics: {
              select: {
                topic: {
                  select: { id: true, name: true, description: true },
                },
              },
            },
          },
        },
        availabilities: {
          where: { isActive: true },
          orderBy: [{ day: "asc" }, { startMinute: "asc" }],
          select: {
            id: true,
            mateOfferingId: true,
            day: true,
            startMinute: true,
            endMinute: true,
            timezone: true,
            isActive: true,
          },
        },
        experiences: {
          orderBy: [{ startYear: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            title: true,
            organisation: true,
            description: true,
            startYear: true,
            endYear: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        qualifications: {
          orderBy: [{ year: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            issuer: true,
            year: true,
            credentialUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        reviews: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            reviewerUser: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
    });

    if (!academicMate) {
      return NextResponse.json(
        {
          error:
            "Academic Mate profile not found. Become an Academic Mate first.",
        },
        { status: 404 },
      );
    }

    const currentProgrammeYearId =
      academicMate.studentProfile?.programmeYear?.id ?? null;

    const currentCurriculumCourses = currentProgrammeYearId
      ? await prisma.programmeCourse.findMany({
          where: { programmeYearId: currentProgrammeYearId },
          select: { courseId: true },
        })
      : [];

    const currentCurriculumCourseIds = new Set(
      currentCurriculumCourses.map(
        (programmeCourse) => programmeCourse.courseId,
      ),
    );

    const offerings = academicMate.offerings.map((offering) => ({
      id: offering.id,
      course: offering.course,
      title: offering.title,
      description: offering.description,
      rate: offering.rate.toString(),
      currency: offering.currency,
      sessionDurationMinutes: offering.sessionDurationMinutes,
      rateType: offering.rateType,
      rateDetails: offering.rateDetails,
      status: offering.status,
      verificationStatus: offering.verificationStatus,
      topics: offering.topics.map(({ topic }) => topic),
      isOutsideCurrentCurriculum: !currentCurriculumCourseIds.has(
        offering.courseId,
      ),
      createdAt: offering.createdAt,
      updatedAt: offering.updatedAt,
    }));

    const totalReviews = academicMate.reviews.length;
    const averageRating =
      totalReviews > 0
        ? Number(
            (
              academicMate.reviews.reduce(
                (total, review) => total + review.rating,
                0,
              ) / totalReviews
            ).toFixed(2),
          )
        : null;

    return NextResponse.json({
      profile: {
        id: academicMate.id,
        status: academicMate.status,
        verificationStatus: academicMate.verificationStatus,
        headline: academicMate.headline,
        bio: academicMate.bio,
        teachingExperience: academicMate.teachingExperience,
        yearsExperience: academicMate.yearsExperience,
        profileVisibility: academicMate.profileVisibility,
        verifiedAt: academicMate.verifiedAt,
        createdAt: academicMate.createdAt,
        updatedAt: academicMate.updatedAt,
      },
      user: academicMate.user,
      student: academicMate.studentProfile
        ? {
            id: academicMate.studentProfile.id,
            studentId: academicMate.studentProfile.showStudentId
              ? academicMate.studentProfile.studentId
              : null,
            gender: academicMate.studentProfile.gender,
            status: academicMate.studentProfile.status,
            phoneNumber: academicMate.studentProfile.showPhoneNumber
              ? academicMate.studentProfile.phoneNumber
              : null,
            bio: academicMate.studentProfile.bio,
            profileVisibility: academicMate.studentProfile.profileVisibility,
            university: academicMate.university,
            school: academicMate.studentProfile.programme.school,
            department: academicMate.studentProfile.programme.department,
            programme: {
              id: academicMate.studentProfile.programme.id,
              code: academicMate.studentProfile.programme.code,
              name: academicMate.studentProfile.programme.name,
              level: academicMate.studentProfile.programme.level,
              durationYears:
                academicMate.studentProfile.programme.durationYears,
            },
            programmeYear: academicMate.studentProfile.programmeYear,
            courses: academicMate.studentProfile.courses,
          }
        : null,
      offerings,
      availability: academicMate.availabilities,
      experiences: academicMate.experiences,
      qualifications: academicMate.qualifications,
      reviews: academicMate.reviews,
      statistics: {
        totalOfferings: offerings.length,
        totalAvailabilitySlots: academicMate.availabilities.length,
        totalExperiences: academicMate.experiences.length,
        totalQualifications: academicMate.qualifications.length,
        totalReviews,
        averageRating,
      },
    });
  } catch (error) {
    console.error("GET /api/student/academic-mate/profile failed:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}