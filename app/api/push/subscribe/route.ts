import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 100 && value.length <= 4096;
}

export async function GET(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return NextResponse.json({ enabled: false });
    if (!validToken(token)) return NextResponse.json({ error: "Invalid push token." }, { status: 400 });
    const subscription = await prisma.pushSubscription.findFirst({ where: { userId, fid: token }, select: { id: true } });
    return NextResponse.json({ enabled: Boolean(subscription) });
  } catch (error) {
    console.error("[push/subscribe] Status check failed:", error);
    return NextResponse.json({ error: "Unable to check notification settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const body = await request.json().catch(() => null) as { token?: unknown } | null;
    if (!validToken(body?.token)) return NextResponse.json({ error: "A valid FCM registration token is required." }, { status: 400 });
    const userAgent = (await headers()).get("user-agent")?.slice(0, 512) ?? null;
    await prisma.pushSubscription.upsert({
      where: { fid: body.token },
      create: { userId, fid: body.token, userAgent, lastSeenAt: new Date() },
      update: { userId, userAgent, lastSeenAt: new Date() },
    });
    try {
      const existing = await prisma.pushSubscription.findMany({ where: { userId }, select: { id: true, fid: true } });
      const legacyIds = existing.filter(({ fid }) => !validToken(fid)).map(({ id }) => id);
      if (legacyIds.length) await prisma.pushSubscription.deleteMany({ where: { userId, id: { in: legacyIds } } });
    } catch (error) {
      console.error("[push/subscribe] Could not clean legacy registration records:", error);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[push/subscribe] Registration failed:", error);
    return NextResponse.json({ error: "Failed to register this browser for notifications." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const body = await request.json().catch(() => null) as { token?: unknown } | null;
    if (!validToken(body?.token)) return NextResponse.json({ error: "A valid FCM registration token is required." }, { status: 400 });
    await prisma.pushSubscription.deleteMany({ where: { userId, fid: body.token } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[push/subscribe] Unregistration failed:", error);
    return NextResponse.json({ error: "Failed to disable notifications for this browser." }, { status: 500 });
  }
}
