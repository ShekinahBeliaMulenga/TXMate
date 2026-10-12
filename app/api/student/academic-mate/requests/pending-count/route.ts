import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { MateRequestStatus } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Lightweight endpoint for the sidebar badge.
 * One indexed COUNT query, scoped to the signed-in user's own offerings.
 * Students who are not Academic Mates simply get { count: 0 }.
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401, headers: NO_STORE }
      );
    }

    const count = await prisma.mateRequest.count({
      where: {
        status: MateRequestStatus.REQUESTED,
        offering: {
          is: {
            academicMateProfile: {
              is: { userId: session.user.id },
            },
          },
        },
      },
    });

    return NextResponse.json({ count }, { headers: NO_STORE });
  } catch (error) {
    console.error("Failed to load pending request count:", error);

    return NextResponse.json(
      { error: "Unable to load pending requests." },
      { status: 500, headers: NO_STORE }
    );
  }
}