import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Number of this student's requests that were accepted but not yet opened on the My Requests page.
export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await prisma.mateRequest.count({
      where: {
        status: "ACCEPTED",
        studentSeenAt: null,
        studentProfile: { userId: session.user.id },
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("Failed to count unseen accepted requests:", error);
    return NextResponse.json({ error: "Unable to load count." }, { status: 500 });
  }
}