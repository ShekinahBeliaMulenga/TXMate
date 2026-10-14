import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { conversationId } = await context.params;

    if (!conversationId || conversationId.length > 100) {
      return NextResponse.json({ error: "A valid conversation ID is required." }, { status: 400 });
    }

    // Only participants can mark a conversation as read.
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        request: {
          OR: [
            { studentProfile: { userId } },
            { offering: { academicMateProfile: { userId } } },
          ],
        },
      },
      select: { id: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    await prisma.conversationRead.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId },
      update: { lastReadAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/student/messages/[conversationId]/read failed:", error);
    return NextResponse.json({ error: "Unable to mark conversation as read." }, { status: 500 });
  }
}