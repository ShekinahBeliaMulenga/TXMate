import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ schoolId: string }> },
) {
  try {
    const { schoolId } = await params;

    const programmes = await prisma.programme.findMany({
      where: { schoolId },
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        durationYears: true,
      },
      orderBy: { name: "asc" },
    });

    return Response.json({ programmes });
  } catch (error) {
    console.error("GET /api/schools/[schoolId]/programmes failed", error);
    return Response.json(
      { error: "Unable to load programmes." },
      { status: 500 },
    );
  }
}
