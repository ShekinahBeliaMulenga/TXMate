
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getR2ImageUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

function getImagePath(userId: string): string {
  return `/api/profile-images/${encodeURIComponent(userId)}`;
}

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    // Require a signed-in TXMate user.
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 },
      );
    }

    const { userId } = await params;

    if (!userId || userId.length > 100) {
      return NextResponse.json(
        { error: "Invalid user ID." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        image: true,
        studentProfile: {
          select: {
            profileVisibility: true,
          },
        },
        academicMate: {
          select: {
            status: true,
            verificationStatus: true,
            profileVisibility: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Profile image not found." },
        { status: 404 },
      );
    }

    // Only serve images managed by this R2 integration.
    // Legacy Base64 images and external image URLs are unaffected.
    const expectedPath = getImagePath(userId);

    const isR2Image =
      user.image === expectedPath ||
      user.image?.startsWith(`${expectedPath}?`) === true;

    if (!isR2Image) {
      return NextResponse.json(
        { error: "Profile image not found." },
        { status: 404 },
      );
    }

    // Owners may access their own images.
    // Other signed-in members must be permitted to view the profile.
    const isOwner = session.user.id === userId;

    const canViewStudentProfile =
      user.studentProfile !== null &&
      user.studentProfile.profileVisibility !== "PRIVATE";

    const canViewAcademicMateProfile =
      user.academicMate !== null &&
      user.academicMate.status === "ACTIVE" &&
      user.academicMate.verificationStatus === "VERIFIED" &&
      user.academicMate.profileVisibility !== "PRIVATE";

    if (
      !isOwner &&
      !canViewStudentProfile &&
      !canViewAcademicMateProfile
    ) {
      return NextResponse.json(
        { error: "Profile image not found." },
        { status: 404 },
      );
    }

    // Generate a temporary URL to the private R2 object.
    const signedUrl = await getR2ImageUrl(
      `profile-images/${userId}/profile`,
    );

    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error("GET /api/profile-images/[userId] failed:", error);

    return NextResponse.json(
      { error: "Unable to retrieve the profile image." },
      { status: 500 },
    );
  }
}
