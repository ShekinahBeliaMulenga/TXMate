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