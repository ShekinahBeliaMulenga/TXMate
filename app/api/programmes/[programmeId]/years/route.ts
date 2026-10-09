import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ programmeId: string }> },
) {
  try {
    const { programmeId } = await params;

    const years = await prisma.programmeYear.findMany({
      where: { programmeId },
      select: {
        id: true,
        yearNumber: true,
      },
      orderBy: { yearNumber: "asc" },
    });

    return Response.json({ years });
  } catch (error) {
    console.error("GET /api/programmes/[programmeId]/years failed", error);
    return Response.json(
      { error: "Unable to load programme years." },
      { status: 500 },
    );
  }
}
