import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { firebaseAdminMessaging } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 100 && value.length <= 4096;
}

function isUnregisteredTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "messaging/registration-token-not-registered" || error.code === "messaging/invalid-registration-token";
}

export async function POST() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const userId = session.user.id;
    const allSubscriptions = await prisma.pushSubscription.findMany({ where: { userId }, select: { id: true, fid: true } });
    const subscriptions = allSubscriptions.filter(({ fid }) => validToken(fid));
    const malformedIds = allSubscriptions.filter(({ fid }) => !validToken(fid)).map(({ id }) => id);
    if (malformedIds.length) {
      await prisma.pushSubscription.deleteMany({ where: { userId, id: { in: malformedIds } } });
    }
    if (!subscriptions.length) return NextResponse.json({ error: "No valid push registration found. Enable notifications again to register this browser." }, { status: 404 });

    const results = await Promise.allSettled(subscriptions.map(({ fid }) => firebaseAdminMessaging.send({
      token: fid,
      notification: { title: "TXMate test notification", body: "Your browser is connected to TXMate notifications." },
      data: { title: "TXMate test notification", body: "Your browser is connected to TXMate notifications.", url: "/" },
      webpush: { headers: { Urgency: "high" } },
    })));
    const sent = results.filter((result) => result.status === "fulfilled").length;
    const invalidTokens = results.flatMap((result, index) => {
      if (result.status === "rejected") {
        console.error("[push/test] Firebase delivery failed:", result.reason);
        return isUnregisteredTokenError(result.reason) ? [subscriptions[index].fid] : [];
      }
      return [];
    });
    if (invalidTokens.length) await prisma.pushSubscription.deleteMany({ where: { userId, fid: { in: invalidTokens } } });
    const failed = results.length - sent;
    if (!sent) return NextResponse.json({ error: "Firebase could not send to any registered browser. Invalid tokens were removed where possible; enable notifications again to register a fresh token.", sent: 0, failed, removedInvalidRegistrations: invalidTokens.length + malformedIds.length }, { status: 502 });
    return NextResponse.json({ success: true, sent, failed, removedInvalidRegistrations: invalidTokens.length + malformedIds.length });
  } catch (error) {
    console.error("[push/test] Request failed:", error);
    return NextResponse.json({ error: "Failed to send the test notification." }, { status: 500 });
  }
}
