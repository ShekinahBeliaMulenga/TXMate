import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";

function isProfileVisibility(value: unknown): value is ProfileVisibility {
  return value === "PUBLIC" || value === "MEMBERS_ONLY" || value === "PRIVATE";
}

function isValidOptionalString(
  value: unknown,
  maxLength: number
): value is string | null {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    return false;
  }

  if (/\p{Cc}/u.test(trimmed)) {
    return false;
  }

  return true;
}

function isValidYearsExperience(value: unknown): value is number | null {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return false;
  }

  return value >= 0 && value <= 100;
}

async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

async function getAcademicMateProfile(userId: string) {
  return prisma.academicMateProfile.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
      userId: true,
      universityId: true,
      studentProfileId: true,
      status: true,
      verificationStatus: true,
      headline: true,
      bio: true,
      teachingExperience: true,
      yearsExperience: true,
      profileVisibility: true,
      verifiedAt: true,
      verifiedByAdminId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * GET /api/student/academic-mate
 *
 * Returns the authenticated student's Academic Mate profile.
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          error: "You must be signed in to view your Academic Mate profile.",
        },
        { status: 401 }
      );
    }

    const academicMate = await getAcademicMateProfile(session.user.id);

    if (!academicMate) {
      return NextResponse.json(
        {
          error:
            "Academic Mate profile not found. Become an Academic Mate first.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      academicMate,
    });
  } catch (error) {
    console.error("Academic Mate GET failed:", error);

    return NextResponse.json(
      {
        error: "Unable to load your Academic Mate profile.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/student/academic-mate
 *
 * Creates an Academic Mate profile for the
 * authenticated student's existing StudentProfile.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          error: "You must be signed in to become an Academic Mate.",
        },
        { status: 401 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "Invalid request body.",
        },
        { status: 400 }
      );
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
        },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    const allowedFields = new Set([
      "headline",
      "bio",
      "teachingExperience",
      "yearsExperience",
      "profileVisibility",
    ]);

    const unknownField = Object.keys(data).find(
      (key) => !allowedFields.has(key)
    );

    if (unknownField) {
      return NextResponse.json(
        {
          error: `Unsupported field: ${unknownField}.`,
        },
        { status: 400 }
      );
    }

    const headline =
      typeof data.headline === "string"
        ? data.headline.trim()
        : data.headline === null || data.headline === undefined
        ? null
        : undefined;

    const bio =
      typeof data.bio === "string"
        ? data.bio.trim()
        : data.bio === null || data.bio === undefined
        ? null
        : undefined;

    const teachingExperience =
      typeof data.teachingExperience === "string"
        ? data.teachingExperience.trim()
        : data.teachingExperience === null ||
          data.teachingExperience === undefined
        ? null
        : undefined;

    const yearsExperience =
      data.yearsExperience === null || data.yearsExperience === undefined
        ? null
        : data.yearsExperience;

    const profileVisibility =
      data.profileVisibility === undefined ? "PUBLIC" : data.profileVisibility;

    if (headline === undefined || !isValidOptionalString(headline, 120)) {
      return NextResponse.json(
        {
          error: "Headline must be 120 characters or fewer.",
        },
        { status: 400 }
      );
    }

    if (bio === undefined || !isValidOptionalString(bio, 1000)) {
      return NextResponse.json(
        {
          error: "Bio must be 1,000 characters or fewer.",
        },
        { status: 400 }
      );
    }

    if (
      teachingExperience === undefined ||
      !isValidOptionalString(teachingExperience, 1000)
    ) {
      return NextResponse.json(
        {
          error: "Teaching experience must be 1,000 characters or fewer.",
        },
        { status: 400 }
      );
    }

    if (!isValidYearsExperience(yearsExperience)) {
      return NextResponse.json(
        {
          error:
            "Years of experience must be a whole number between 0 and 100.",
        },
        { status: 400 }
      );
    }

    if (!isProfileVisibility(profileVisibility)) {
      return NextResponse.json(
        {
          error: "Select a valid profile visibility setting.",
        },
        { status: 400 }
      );
    }

    const studentProfile = await prisma.studentProfile.findUnique({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        universityId: true,
        status: true,
        academicMate: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!studentProfile) {
      return NextResponse.json(
        {
          error:
            "Student profile not found. Complete student onboarding first.",
        },
        { status: 404 }
      );
    }

    if (studentProfile.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error: "Only active students can become Academic Mates.",
        },
        { status: 403 }
      );
    }

    if (studentProfile.academicMate) {
      return NextResponse.json(
        {
          error: "You already have an Academic Mate profile.",
          academicMate: studentProfile.academicMate,
        },
        { status: 409 }
      );
    }

    const academicMate = await prisma.academicMateProfile.create({
      data: {
        userId: session.user.id,
        universityId: studentProfile.universityId,
        studentProfileId: studentProfile.id,
        status: "ACTIVE",
        verificationStatus: "UNVERIFIED",
        headline: headline || null,
        bio: bio || null,
        teachingExperience: teachingExperience || null,
        yearsExperience,
        profileVisibility,
      },
      select: {
        id: true,
        userId: true,
        universityId: true,
        studentProfileId: true,
        status: true,
        verificationStatus: true,
        headline: true,
        bio: true,
        teachingExperience: true,
        yearsExperience: true,
        profileVisibility: true,
        verifiedAt: true,
        verifiedByAdminId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        message: "Academic Mate profile created successfully.",
        academicMate,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Academic Mate POST failed:", error);

    return NextResponse.json(
      {
        error: "Unable to create your Academic Mate profile.",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/student/academic-mate
 *
 * Updates the authenticated student's Academic Mate profile.
 */
export async function PATCH(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          error: "You must be signed in to update your Academic Mate profile.",
        },
        { status: 401 }
      );
    }

    const existing = await getAcademicMateProfile(session.user.id);

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Academic Mate profile not found. Become an Academic Mate first.",
        },
        { status: 404 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "Invalid request body.",
        },
        { status: 400 }
      );
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
        },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    const allowedFields = new Set([
      "headline",
      "bio",
      "teachingExperience",
      "yearsExperience",
      "profileVisibility",
    ]);

    const unknownField = Object.keys(data).find(
      (key) => !allowedFields.has(key)
    );

    if (unknownField) {
      return NextResponse.json(
        {
          error: `Unsupported field: ${unknownField}.`,
        },
        { status: 400 }
      );
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        {
          error: "Provide at least one field to update.",
        },
        { status: 400 }
      );
    }

    const updateData: {
      headline?: string | null;
      bio?: string | null;
      teachingExperience?: string | null;
      yearsExperience?: number | null;
      profileVisibility?: ProfileVisibility;
    } = {};

    if ("headline" in data) {
      if (data.headline !== null && typeof data.headline !== "string") {
        return NextResponse.json(
          {
            error: "Headline must be a string or null.",
          },
          { status: 400 }
        );
      }

      const headline =
        typeof data.headline === "string" ? data.headline.trim() : null;

      if (!isValidOptionalString(headline, 120)) {
        return NextResponse.json(
          {
            error: "Headline must be 120 characters or fewer.",
          },
          { status: 400 }
        );
      }

      updateData.headline = headline || null;
    }

    if ("bio" in data) {
      if (data.bio !== null && typeof data.bio !== "string") {
        return NextResponse.json(
          {
            error: "Bio must be a string or null.",
          },
          { status: 400 }
        );
      }

      const bio = typeof data.bio === "string" ? data.bio.trim() : null;

      if (!isValidOptionalString(bio, 1000)) {
        return NextResponse.json(
          {
            error: "Bio must be 1,000 characters or fewer.",
          },
          { status: 400 }
        );
      }

      updateData.bio = bio || null;
    }

    if ("teachingExperience" in data) {
      if (
        data.teachingExperience !== null &&
        typeof data.teachingExperience !== "string"
      ) {
        return NextResponse.json(
          {
            error: "Teaching experience must be a string or null.",
          },
          { status: 400 }
        );
      }

      const teachingExperience =
        typeof data.teachingExperience === "string"
          ? data.teachingExperience.trim()
          : null;

      if (!isValidOptionalString(teachingExperience, 1000)) {
        return NextResponse.json(
          {
            error: "Teaching experience must be 1,000 characters or fewer.",
          },
          { status: 400 }
        );
      }

      updateData.teachingExperience = teachingExperience || null;
    }

    if ("yearsExperience" in data) {
      if (!isValidYearsExperience(data.yearsExperience)) {
        return NextResponse.json(
          {
            error:
              "Years of experience must be a whole number between 0 and 100.",
          },
          { status: 400 }
        );
      }

      updateData.yearsExperience = data.yearsExperience ?? null;
    }

    if ("profileVisibility" in data) {
      if (!isProfileVisibility(data.profileVisibility)) {
        return NextResponse.json(
          {
            error: "Select a valid profile visibility setting.",
          },
          { status: 400 }
        );
      }

      updateData.profileVisibility = data.profileVisibility;
    }

    const academicMate = await prisma.academicMateProfile.update({
      where: {
        id: existing.id,
      },
      data: updateData,
      select: {
        id: true,
        userId: true,
        universityId: true,
        studentProfileId: true,
        status: true,
        verificationStatus: true,
        headline: true,
        bio: true,
        teachingExperience: true,
        yearsExperience: true,
        profileVisibility: true,
        verifiedAt: true,
        verifiedByAdminId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: "Academic Mate profile updated successfully.",
      academicMate,
    });
  } catch (error) {
    console.error("Academic Mate PATCH failed:", error);

    return NextResponse.json(
      {
        error: "Unable to update your Academic Mate profile.",
      },
      { status: 500 }
    );
  }
}
