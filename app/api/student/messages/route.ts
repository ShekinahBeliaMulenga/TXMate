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
    const now = new Date();
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
            arrangementType: true,
            arrangementStatus: true,
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
            // One inbox row per arrangement, with the nearest live occurrence as its date/context.
            sessions: {
              where: {
                status: { in: ["SCHEDULED", "IN_PROGRESS"] },
                scheduledEnd: { gte: now },
              },
              orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
              take: 1,
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
            // Set when the other participant opens the chat; drives the sent/seen ticks in the inbox.
            readAt: true,
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
      const initialSession = request.tutoringSession;
      const nextSession =
        request.arrangementStatus === "COMPLETED" || request.arrangementStatus === "CANCELLED"
          ? null
          : request.sessions[0] ?? null;
      // The date shown in an active recurring arrangement is the next live occurrence,
      // not the first session forever. One-time arrangements retain their sole session
      // as context after it finishes or is cancelled.
      const displaySession = nextSession ?? (request.arrangementType === "ONE_TIME" ? initialSession : null);
      // The shared conversation is arrangement-level. The route's session ID only selects
      // which occurrence's controls/details are shown, and falls back to the initial one
      // so a completed/cancelled arrangement can still open its message history.
      const routeSession = nextSession ?? initialSession;

      return {
        id: conversation.id,
        updatedAt: conversation.updatedAt.toISOString(),
        arrangementStatus: request.arrangementStatus,
        arrangementType: request.arrangementType,
        otherUserName: otherUser.name || "TXMate member",
        otherUserImage: otherUser.image,
        courseName: request.offering.course.name,
        studentMessagingEnabled: conversation.studentMessagingEnabled,
        unreadCount: unreadByConversation.get(conversation.id) ?? 0,
        lastMessage: conversation.messages[0] ?? null,
        session: displaySession,
        sessionLabel: nextSession ? (nextSession.status === "IN_PROGRESS" ? "IN_PROGRESS" : "NEXT") : displaySession ? "SESSION" : null,
        conversationUrl: routeSession
          ? `/student/sessions/${encodeURIComponent(routeSession.id)}/conversation`
          : null,
      };
    });

    // currentUserId lets the inbox tell which last messages are the viewer's own (for sent/seen ticks).
    return NextResponse.json({ currentUserId: userId, conversations: items });
  } catch (error) {
    console.error("Failed to load messages inbox:", error);
    return NextResponse.json(
      { error: "Unable to load your conversations." },
      { status: 500 },
    );
  }
}