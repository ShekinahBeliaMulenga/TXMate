import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Called when the student opens My Requests: marks their accepted requests as seen.
export async function POST() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await prisma.mateRequest.updateMany({
      where: {
        status: "ACCEPTED",
        studentSeenAt: null,
        studentProfile: { userId: session.user.id },
      },
      data: { studentSeenAt: new Date() },
    });

    return NextResponse.json({ marked: result.count });
  } catch (error) {
    console.error("Failed to mark accepted requests as seen:", error);
    return NextResponse.json({ error: "Unable to update." }, { status: 500 });
  }
}