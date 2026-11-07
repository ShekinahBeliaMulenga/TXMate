import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSetPassword } from "@/lib/password-policy";

export const runtime = "nodejs";

/** Lets a person who signed up with Google add a password. Someone who already has one uses "change password". */
export async function POST(request: Request) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!session.user.emailVerified) return NextResponse.json({ error: "Verify your email address first." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { newPassword?: unknown; confirmPassword?: unknown } | null;
  const next = typeof body?.newPassword === "string" ? body.newPassword : "";
  const confirm = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
  const errors = validateSetPassword({ next, confirm });
  const first = errors.next ?? errors.confirm;
  if (first) return NextResponse.json({ error: first }, { status: 400 });

  const existing = await prisma.account.findFirst({ where: { userId: session.user.id, providerId: "credential" }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "This account already has a password. Use change password instead." }, { status: 409 });

  try {
    await auth.api.setPassword({ body: { newPassword: next }, headers: requestHeaders });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/account/password/set failed:", error);
    return NextResponse.json({ error: "We couldn’t set your password. Please try again." }, { status: 500 });
  }
}
