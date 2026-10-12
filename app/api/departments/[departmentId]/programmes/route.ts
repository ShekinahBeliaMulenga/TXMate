import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ departmentId: string }> },
) {
  try {
    const { departmentId } = await params;

    if (!departmentId || !departmentId.trim()) {
      return Response.json(
        { error: "Department ID is required." },
        { status: 400 },
      );
    }

    const department = await prisma.department.findUnique({
      where: {
        id: departmentId,
      },
      select: {
        id: true,
      },
    });

    if (!department) {
      return Response.json(
        { error: "Selected department does not exist." },
        { status: 404 },
      );
    }

    const programmes = await prisma.programme.findMany({
      where: {
        departmentId: department.id,
      },
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        durationYears: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return Response.json({ programmes });
  } catch (error) {
    console.error(
      "GET /api/departments/[departmentId]/programmes failed",
      error,
    );

    return Response.json(
      { error: "Unable to load programmes." },
      { status: 500 },
    );
  }
}