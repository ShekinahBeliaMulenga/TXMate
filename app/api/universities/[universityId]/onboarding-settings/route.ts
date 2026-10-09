import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ universityId: string }> },
) {
  try {
    const { universityId } = await params;

    if (!universityId) {
      return NextResponse.json(
        { error: "University ID is required." },
        { status: 400 },
      );
    }

    const university = await prisma.university.findUnique({
      where: { id: universityId },
      select: {
        id: true,
        status: true,
        settings: {
          select: {
            studentIdMinLength: true,
            studentIdMaxLength: true,
            studentIdPrefix: true,
            studentIdPattern: true,
            requireUniversityEmail: true,
            universityEmailDomain: true,
          },
        },
      },
    });

    if (!university) {
      return NextResponse.json(
        { error: "University not found." },
        { status: 404 },
      );
    }

    if (university.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "University is inactive." },
        { status: 400 },
      );
    }

    if (!university.settings) {
      return NextResponse.json(
        { error: "University onboarding settings are not configured." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { settings: university.settings },
      { status: 200 },
    );
  } catch (error) {
    console.error("University onboarding settings error:", error);

    return NextResponse.json(
      { error: "Unable to load university onboarding settings." },
      { status: 500 },
    );
  }
}
