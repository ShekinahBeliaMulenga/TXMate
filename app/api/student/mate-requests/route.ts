import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 1000;

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "You must be signed in to request academic support." },
        { status: 401 },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 },
      );
    }

    if (!isPlainObject(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object." },
        { status: 400 },
      );
    }

    const allowedFields = new Set(["offeringId", "message"]);

    if (!Object.keys(body).every((key) => allowedFields.has(key))) {
      return NextResponse.json(
        { error: "Request contains unsupported fields." },
        { status: 400 },
      );
    }

    const offeringId =
      typeof body.offeringId === "string"
        ? body.offeringId.trim()
        : "";

    if (!offeringId || offeringId.length > 100) {
      return NextResponse.json(
        { error: "A valid offeringId is required." },
        { status: 400 },
      );
    }

    if (
      body.message !== undefined &&
      body.message !== null &&
      typeof body.message !== "string"
    ) {
      return NextResponse.json(
        { error: "Message must be a string or null." },
        { status: 400 },
      );
    }

    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
        },
        { status: 400 },
      );
    }

    const student = await prisma.studentProfile.findUnique({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        universityId: true,
        status: true,
        courses: {
          where: {
            status: {
              in: ["ENROLLED", "REPEATING"],
            },
          },
          select: {
            courseId: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        {
          error: "Student profile not found. Complete onboarding first.",
        },
        { status: 404 },
      );
    }

    if (student.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Your student account is not active." },
        { status: 403 },
      );
    }

    const courseIds = student.courses.map(
      (studentCourse) => studentCourse.courseId,
    );

    if (courseIds.length === 0) {
      return NextResponse.json(
        {
          error: "You need an enrolled course before requesting academic support.",
        },
        { status: 400 },
      );
    }

    const offering = await prisma.mateOffering.findFirst({
      where: {
        id: offeringId,
        universityId: student.universityId,
        courseId: {
          in: courseIds,
        },
        status: "ACTIVE",
        academicMateProfile: {
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
          profileVisibility: {
            in: ["PUBLIC", "MEMBERS_ONLY"],
          },
        },
      },
      select: {
        id: true,
        universityId: true,
        title: true,
        rate: true,
        currency: true,
        rateType: true,
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        academicMateProfile: {
          select: {
            userId: true,
            user: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });

    if (!offering) {
      return NextResponse.json(
        {
          error:
            "This offering is unavailable or does not match your university and enrolled courses.",
        },
        { status: 404 },
      );
    }

    if (offering.academicMateProfile.userId === session.user.id) {
      return NextResponse.json(
        { error: "You cannot request academic support from yourself." },
        { status: 400 },
      );
    }

    const existingRequest = await prisma.mateRequest.findFirst({
      where: {
        studentProfileId: student.id,
        offeringId: offering.id,
        status: {
          in: ["REQUESTED", "ACCEPTED"],
        },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
    });

    if (existingRequest) {
      return NextResponse.json(
        {
          error:
            "You already have a pending or accepted request for this offering.",
          existingRequest,
        },
        { status: 409 },
      );
    }

    const createdRequest = await prisma.mateRequest.create({
      data: {
        studentProfileId: student.id,
        offeringId: offering.id,
        universityId: student.universityId,
        message: message || null,
      },
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message: "Your academic support request has been submitted.",
        request: {
          ...createdRequest,
          offering: {
            title: offering.title,
            rate: offering.rate.toString(),
            currency: offering.currency,
            rateType: offering.rateType,
            course: offering.course,
            academicMate: offering.academicMateProfile.user,
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/student/mate-requests failed:", error);

    return NextResponse.json(
      { error: "Unable to submit your academic support request." },
      { status: 500 },
    );
  }
}