import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      programmeYearId: string;
    }>;
  },
) {
  try {
    const { programmeYearId } = await context.params;

    if (!programmeYearId) {
      return NextResponse.json(
        {
          error: "Programme year ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const programmeYear = await prisma.programmeYear.findUnique({
      where: {
        id: programmeYearId,
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
            semester: true,
            isCompulsory: true,
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
          error: "Programme year not found.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json(
      {
        programmeYear: {
          id: programmeYear.id,
          yearNumber: programmeYear.yearNumber,
        },
        programmeCourses: programmeYear.programmeCourses,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error("Failed to load programme-year courses:", error);

    return NextResponse.json(
      {
        error: "Unable to load programme courses.",
      },
      {
        status: 500,
      },
    );
  }
}