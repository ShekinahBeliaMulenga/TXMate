import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PHONE_FORMAT_MESSAGE, normalizePhone, phoneVariants } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/student/phone-check?phone=+260971234567
 *
 * Tells a signed-in student whether a phone number is free to use. The student's own number counts as available.
 * The save endpoints check again, so this is only a convenience for the form.
 */
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: "You must be signed in." }, { status: 401, headers: NO_STORE });

    const phone = normalizePhone(new URL(request.url).searchParams.get("phone"));
    if (!phone) return NextResponse.json({ error: PHONE_FORMAT_MESSAGE }, { status: 400, headers: NO_STORE });

    const owner = await prisma.studentProfile.findFirst({
      where: { phoneNumber: { in: phoneVariants(phone) } },
      select: { userId: true },
    });
    return NextResponse.json({ available: !owner || owner.userId === session.user.id }, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/student/phone-check failed:", error);
    return NextResponse.json({ error: "Unable to check this phone number." }, { status: 500, headers: NO_STORE });
  }
}
