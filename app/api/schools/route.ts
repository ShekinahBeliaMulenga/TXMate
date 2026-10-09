import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const universityId = request.nextUrl.searchParams.get("universityId");

    if (!universityId) {
      return NextResponse.json(
        { error: "University ID is required." },
        { status: 400 }
      );
    }

    const schools = await prisma.school.findMany({
      where: {
        universityId,
      },
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(schools);
  } catch (error) {
    console.error("Failed to load schools:", error);

    return NextResponse.json(
      { error: "Failed to load schools." },
      { status: 500 }
    );
  }
}