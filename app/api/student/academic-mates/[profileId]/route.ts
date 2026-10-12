import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ profileId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { profileId } = await context.params;
    if (!profileId || profileId.length > 100) {
      return NextResponse.json({ error: "A valid Academic Mate profile ID is required." }, { status: 400 });
    }

    const session = await auth.api.getSession({ headers: await headers() });
    const viewerUserId = session?.user?.id ?? null;

    const mate = await prisma.academicMateProfile.findUnique({
      where: { id: profileId },
      include: {
        user: { select: { id: true, name: true, image: true } },
        university: { select: { id: true, code: true, name: true, slug: true } },
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
                school: { select: { id: true, code: true, name: true } },
                department: { select: { id: true, code: true, name: true } },
              },
            },
            programmeYear: { select: { id: true, yearNumber: true } },
            courses: {
              orderBy: [{ course: { code: "asc" } }],
              select: {
                id: true,
                semester: true,
                status: true,
                academicYear: { select: { id: true, name: true, isCurrent: true } },
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
          where: { status: "ACTIVE", course: { isActive: true } },
          orderBy: [{ course: { code: "asc" } }],
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
                topic: { select: { id: true, name: true, description: true } },
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
            reviewerUser: { select: { id: true, name: true, image: true } },
          },
        },
      },
    });

    if (!mate) {
      return NextResponse.json({ error: "Academic Mate profile not found." }, { status: 404 });
    }

    const isOwner = viewerUserId === mate.userId;
    const viewerStudent = viewerUserId
      ? await prisma.studentProfile.findUnique({
          where: { userId: viewerUserId },
          select: { id: true, universityId: true, status: true },
        })
      : null;
    const isSameUniversityStudent =
      !!viewerStudent && viewerStudent.universityId === mate.universityId;

    if (!isOwner) {
      const visibleToViewer =
        mate.profileVisibility === "PUBLIC" ||
        (mate.profileVisibility === "MEMBERS_ONLY" && isSameUniversityStudent);

      if (!visibleToViewer || mate.status !== "ACTIVE" || mate.verificationStatus !== "VERIFIED") {
        return NextResponse.json({ error: "This Academic Mate profile is not available." }, { status: 404 });
      }
    }

    const activeOfferingIds = mate.offerings.map((offering) => offering.id);
    const availability = mate.availabilities.filter((slot) => activeOfferingIds.includes(slot.mateOfferingId));

    const currentProgrammeYearId = mate.studentProfile?.programmeYear?.id ?? null;
    const curriculumRows = currentProgrammeYearId
      ? await prisma.programmeCourse.findMany({
          where: { programmeYearId: currentProgrammeYearId },
          select: { courseId: true },
        })
      : [];
    const curriculumCourseIds = new Set(curriculumRows.map((row) => row.courseId));

    const offerings = mate.offerings.map((offering) => ({
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
      isOutsideCurrentCurriculum: !curriculumCourseIds.has(offering.courseId),
      createdAt: offering.createdAt,
      updatedAt: offering.updatedAt,
    }));

    const canRequest =
      !!viewerStudent &&
      viewerStudent.status === "ACTIVE" &&
      isSameUniversityStudent &&
      !isOwner;

    const activeRequests = canRequest && activeOfferingIds.length
      ? await prisma.mateRequest.findMany({
          where: {
            studentProfileId: viewerStudent!.id,
            offeringId: { in: activeOfferingIds },
            status: { in: ["REQUESTED", "ACCEPTED"] },
          },
          select: {
            id: true,
            offeringId: true,
            status: true,
            tutoringSession: { select: { id: true } },
          },
        })
      : [];

    const requestsByOffering = Object.fromEntries(
      activeRequests.map((request) => [
        request.offeringId,
        {
          id: request.id,
          status: request.status,
          hasSession: request.tutoringSession !== null,
        },
      ]),
    );

    const totalReviews = mate.reviews.length;
    const averageRating = totalReviews
      ? Number((mate.reviews.reduce((total, review) => total + review.rating, 0) / totalReviews).toFixed(2))
      : null;

    return NextResponse.json({
      profile: {
        id: mate.id,
        status: mate.status,
        verificationStatus: mate.verificationStatus,
        headline: mate.headline,
        bio: mate.bio,
        teachingExperience: mate.teachingExperience,
        yearsExperience: mate.yearsExperience,
        profileVisibility: mate.profileVisibility,
        verifiedAt: mate.verifiedAt,
        createdAt: mate.createdAt,
        updatedAt: mate.updatedAt,
      },
      // Deliberately excludes email and other account-private fields.
      user: mate.user,
      student: mate.studentProfile
        ? {
            id: mate.studentProfile.id,
            studentId: mate.studentProfile.showStudentId ? mate.studentProfile.studentId : null,
            gender: mate.studentProfile.gender,
            status: mate.studentProfile.status,
            phoneNumber: mate.studentProfile.showPhoneNumber ? mate.studentProfile.phoneNumber : null,
            bio: mate.studentProfile.bio,
            profileVisibility: mate.studentProfile.profileVisibility,
            university: mate.university,
            school: mate.studentProfile.programme.school,
            department: mate.studentProfile.programme.department,
            programme: {
              id: mate.studentProfile.programme.id,
              code: mate.studentProfile.programme.code,
              name: mate.studentProfile.programme.name,
              level: mate.studentProfile.programme.level,
              durationYears: mate.studentProfile.programme.durationYears,
            },
            programmeYear: mate.studentProfile.programmeYear,
            courses: mate.studentProfile.courses,
          }
        : null,
      offerings,
      availability,
      experiences: mate.experiences,
      qualifications: mate.qualifications,
      reviews: mate.reviews,
      statistics: {
        totalOfferings: offerings.length,
        totalAvailabilitySlots: availability.length,
        totalExperiences: mate.experiences.length,
        totalQualifications: mate.qualifications.length,
        totalReviews,
        averageRating,
      },
      viewer: {
        signedIn: !!viewerUserId,
        canRequest,
        isOwner,
      },
      requestsByOffering,
    });
  } catch (error) {
    console.error("GET /api/student/academic-mates/[profileId] failed:", error);
    return NextResponse.json({ error: "Unable to load this Academic Mate profile." }, { status: 500 });
  }
}
