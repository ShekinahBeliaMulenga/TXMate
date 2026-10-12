import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ schoolId: string }> },
) {
  try {
    const { schoolId } = await params;

    if (!schoolId || !schoolId.trim()) {
      return Response.json(
        { error: "School ID is required." },
        { status: 400 },
      );
    }

    const school = await prisma.school.findUnique({
      where: {
        id: schoolId,
      },
      select: {
        id: true,
      },
    });

    if (!school) {
      return Response.json(
        { error: "Selected school does not exist." },
        { status: 404 },
      );
    }

    const departments = await prisma.department.findMany({
      where: {
        schoolId: school.id,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return Response.json({ departments });
  } catch (error) {
    console.error(
      "GET /api/schools/[schoolId]/departments failed",
      error,
    );

    return Response.json(
      { error: "Unable to load departments." },
      { status: 500 },
    );
  }
}