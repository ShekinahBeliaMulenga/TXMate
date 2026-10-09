import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const universities = await prisma.university.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        code: true,
        name: true,
        slug: true,
      },
      orderBy: { name: "asc" },
    });

    return Response.json({ universities });
  } catch (error) {
    console.error("GET /api/universities failed", error);
    return Response.json(
      { error: "Unable to load universities." },
      { status: 500 },
    );
  }
}
