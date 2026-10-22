
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const conversations = await prisma.conversation.findMany({
      where: {
        request: {
          OR: [
            { studentProfile: { userId } },
            { offering: { academicMateProfile: { userId } } },
          ],
          tutoringSession: { isNot: null },
        },
      },
      select: { id: true },
    });

    if (conversations.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    const readRows = await prisma.conversationRead.findMany({
      where: { userId, conversationId: { in: conversations.map((c) => c.id) } },
      select: { conversationId: true, lastReadAt: true },
    });

    const lastReadByConversation = new Map(
      readRows.map((row) => [row.conversationId, row.lastReadAt]),
    );

    const unreadConversations = await prisma.message.findMany({
      where: {
        senderUserId: { not: userId },
        OR: conversations.map((conversation) => {
          const lastReadAt = lastReadByConversation.get(conversation.id);
          return {
            conversationId: conversation.id,
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          };
        }),
      },
      distinct: ["conversationId"],
      select: { conversationId: true },
    });

    return NextResponse.json({ count: unreadConversations.length });
  } catch (error) {
    console.error("GET /api/student/messages/unread-count failed:", error);
    return NextResponse.json({ error: "Unable to load unread count." }, { status: 500 });
  }
}
