import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ universityId: string }> },
) {
  try {
    const { universityId } = await params;

    const schools = await prisma.school.findMany({
      where: { universityId },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    return Response.json({ schools });
  } catch (error) {
    console.error("GET /api/universities/[universityId]/schools failed", error);
    return Response.json(
      { error: "Unable to load schools." },
      { status: 500 },
    );
  }
}
