import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      select: {
        id: true,
        studentMessagingEnabled: true,
        updatedAt: true,
        request: {
          select: {
            status: true,
            studentProfile: {
              select: {
                userId: true,
                user: { select: { name: true, image: true } },
              },
            },
            offering: {
              select: {
                course: { select: { name: true } },
                academicMateProfile: {
                  select: {
                    userId: true,
                    user: { select: { name: true, image: true } },
                  },
                },
              },
            },
            tutoringSession: {
              select: {
                id: true,
                scheduledStart: true,
                scheduledEnd: true,
                status: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            body: true,
            createdAt: true,
            senderUserId: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Unread = messages sent by the other person after this user last opened the conversation.
    // If the user has never opened it (no read row), every message from the other person counts.
    const conversationIds = conversations.map((conversation) => conversation.id);

    const readRows = conversationIds.length
      ? await prisma.conversationRead.findMany({
          where: { userId, conversationId: { in: conversationIds } },
          select: { conversationId: true, lastReadAt: true },
        })
      : [];
    const lastReadByConversation = new Map(
      readRows.map((row) => [row.conversationId, row.lastReadAt]),
    );

    const unreadEntries = await Promise.all(
      conversations.map(async (conversation) => {
        const lastReadAt = lastReadByConversation.get(conversation.id);
        const count = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderUserId: { not: userId },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        });
        return [conversation.id, count] as const;
      }),
    );
    const unreadByConversation = new Map(unreadEntries);

    const items = conversations.map((conversation) => {
      const request = conversation.request;
      const isStudent = request.studentProfile.userId === userId;
      const otherUser = isStudent
        ? request.offering.academicMateProfile.user
        : request.studentProfile.user;
      const tutoringSession = request.tutoringSession;

      // A cancelled request means the session is cancelled, even if the session row still has its old status.
      const requestCancelled = String(request.status).toUpperCase().includes("CANCEL");

      return {
        id: conversation.id,
        otherUserName: otherUser.name || "TXMate member",
        otherUserImage: otherUser.image,
        courseName: request.offering.course.name,
        studentMessagingEnabled: conversation.studentMessagingEnabled,
        unreadCount: unreadByConversation.get(conversation.id) ?? 0,
        lastMessage: conversation.messages[0] ?? null,
        session: tutoringSession
          ? {
              ...tutoringSession,
              status: requestCancelled ? "CANCELLED" : tutoringSession.status,
            }
          : null,
        conversationUrl: tutoringSession
          ? `/student/sessions/${encodeURIComponent(tutoringSession.id)}/conversation`
          : null,
      };
    });

    return NextResponse.json({ conversations: items });
  } catch (error) {
    console.error("Failed to load messages inbox:", error);
    return NextResponse.json(
      { error: "Unable to load your conversations." },
      { status: 500 },
    );
  }
}