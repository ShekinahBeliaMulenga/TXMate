import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() });
    if (!authSession?.user) return NextResponse.json({ count: 0 }, { status: 401 });

    const academicMate = await prisma.academicMateProfile.findUnique({
      where: { userId: authSession.user.id },
      select: { id: true },
    });
    if (!academicMate) return NextResponse.json({ count: 0 });

    const now = new Date();
    const count = await prisma.sessionRescheduleRequest.count({
      where: {
        respondingUserId: authSession.user.id,
        status: "PENDING",
        proposedStart: { gt: now },
        session: {
          is: {
            scheduledStart: { gt: now },
            status: { in: ["SCHEDULED", "CANCELLED"] },
            request: {
              is: {
                AND: [
                  {
                    offering: {
                      is: { academicMateProfileId: academicMate.id },
                    },
                  },
                  {
                    OR: [
                      { arrangementStatus: "ACTIVE" },
                      {
                        arrangementType: "ONE_TIME",
                        arrangementStatus: "CANCELLED",
                        status: "CANCELLED",
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("GET rescheduling proposal count failed:", error);
    return NextResponse.json({ error: "Unable to load proposal count." }, { status: 500 });
  }
}
