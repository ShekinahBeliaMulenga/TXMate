import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return NextResponse.json({ error: "You must be signed in to mark messages as read." }, { status: 401 });
    const { conversationId } = await context.params;
    if (!conversationId?.trim() || conversationId.length > 100) return NextResponse.json({ error: "A valid conversation ID is required." }, { status: 400 });
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        request: { OR: [{ studentProfile: { userId: session.user.id } }, { offering: { academicMateProfile: { userId: session.user.id } } }] },
      },
      select: { id: true },
    });
    if (!conversation) return NextResponse.json({ error: "Conversation not found or you are not authorised to access it." }, { status: 404 });
    const readAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.conversationRead.upsert({
        where: { conversationId_userId: { conversationId, userId: session.user.id } },
        create: { conversationId, userId: session.user.id, lastReadAt: readAt },
        update: { lastReadAt: readAt },
      });
      await tx.message.updateMany({ where: { conversationId, senderUserId: { not: session.user.id }, readAt: null }, data: { readAt } });
    });
    return NextResponse.json({ success: true, readAt: readAt.toISOString() });
  } catch (error) {
    console.error("POST /api/student/messages/[conversationId]/read failed:", error);
    return NextResponse.json({ error: "Unable to mark messages as read." }, { status: 500 });
  }
}
