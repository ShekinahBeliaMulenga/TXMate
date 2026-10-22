import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emitConversationMessage } from "@/lib/realtime/socket-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 4000;

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/** Message shown when someone tries to send while the conversation is paused. */
function pausedMessage(isStudent: boolean) {
  return isStudent
    ? "Messaging is paused by the Academic Mate. You can still read the conversation."
    : "Messaging is paused. Reopen messaging to send messages.";
}

function isConversationCancelled(conversation: {
  request: {
    arrangementStatus: string;
  };
}) {
  return conversation.request.arrangementStatus === "CANCELLED";
}

const CANCELLED_MESSAGE =
  "This tutoring arrangement has been cancelled. Messaging is closed.";

async function getAuthenticatedUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}

async function getConversation(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      studentMessagingEnabled: true,
      request: {
        select: {
          status: true,
          arrangementStatus: true,
          studentProfile: {
            select: {
              userId: true,
              user: { select: { name: true } },
            },
          },
          offering: {
            select: {
              academicMateProfile: {
                select: {
                  userId: true,
                  user: { select: { name: true } },
                },
              },
              course: { select: { code: true, name: true } },
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
          sessions: {
            where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledEnd: { gte: new Date() } },
            orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
}

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be signed in to read messages." },
        { status: 401 },
      );
    }

    const { conversationId } = await params;

    if (!conversationId?.trim() || conversationId.length > 100) {
      return NextResponse.json(
        { error: "A valid conversation ID is required." },
        { status: 400 },
      );
    }

    const conversation = await getConversation(conversationId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    const studentUserId = conversation.request.studentProfile.userId;
    const academicMateUserId =
      conversation.request.offering.academicMateProfile.userId;

    if (
      user.id !== studentUserId &&
      user.id !== academicMateUserId
    ) {
      return NextResponse.json(
        { error: "You are not authorised to read these messages." },
        { status: 403 },
      );
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        senderUserId: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      currentUserId: user.id,
      conversation: {
        id: conversation.id,
        studentMessagingEnabled: conversation.studentMessagingEnabled,
        session: conversation.request.tutoringSession
          ? {
              id: conversation.request.tutoringSession.id,
              scheduledStart:
                conversation.request.tutoringSession.scheduledStart.toISOString(),
              scheduledEnd:
                conversation.request.tutoringSession.scheduledEnd.toISOString(),
            }
          : null,
      },
      participantRole:
        user.id === studentUserId ? "STUDENT" : "ACADEMIC_MATE",
      messages: messages.map((message) => ({
        ...message,
        conversationId,
        createdAt: message.createdAt.toISOString(),
        readAt: message.readAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error(
      "GET /api/student/conversations/[conversationId]/messages failed:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to load messages." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: RouteContext,
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be signed in to send messages." },
        { status: 401 },
      );
    }

    const { conversationId } = await params;

    if (!conversationId?.trim() || conversationId.length > 100) {
      return NextResponse.json(
        { error: "A valid conversation ID is required." },
        { status: 400 },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 },
      );
    }

    if (
      !isPlainObject(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.body !== "string"
    ) {
      return NextResponse.json(
        { error: 'Provide only "body" as a message string.' },
        { status: 400 },
      );
    }

    const messageBody = body.body.trim();

    if (!messageBody) {
      return NextResponse.json(
        { error: "A message cannot be empty." },
        { status: 400 },
      );
    }

    if (messageBody.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          error: `Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
        },
        { status: 400 },
      );
    }

    const conversation = await getConversation(conversationId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    const studentUserId = conversation.request.studentProfile.userId;
    const academicMateUserId =
      conversation.request.offering.academicMateProfile.userId;

    const isStudent = user.id === studentUserId;
    const isAcademicMate = user.id === academicMateUserId;

    if (!isStudent && !isAcademicMate) {
      return NextResponse.json(
        { error: "You are not authorised to send messages here." },
        { status: 403 },
      );
    }

    if (isConversationCancelled(conversation)) {
      return NextResponse.json(
        { error: CANCELLED_MESSAGE },
        { status: 403 },
      );
    }

    // A paused conversation blocks both participants. Either side can still read the history.
    if (!conversation.studentMessagingEnabled) {
      return NextResponse.json(
        { error: pausedMessage(isStudent) },
        { status: 403 },
      );
    }

    const recipientUserId = isStudent
      ? academicMateUserId
      : studentUserId;

    const result = await prisma.$transaction(async (tx) => {
      /*
       * Recheck the messaging setting inside the transaction so that
       * a pause applied after the initial read is not silently ignored.
       */
      const currentConversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          studentMessagingEnabled: true,
          request: {
            select: {
              status: true,
              arrangementStatus: true,
              tutoringSession: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      });
      
      if (!currentConversation) {
        return { kind: "not-found" as const };
      }
      
      if (isConversationCancelled(currentConversation)) {
        return { kind: "cancelled" as const };
      }
      
      if (!currentConversation.studentMessagingEnabled) {
        return { kind: "messaging-paused" as const };
      }

      const message = await tx.message.create({
        data: {
          conversationId,
          senderUserId: user.id,
          body: messageBody,
        },
        select: {
          id: true,
          conversationId: true,
          senderUserId: true,
          body: true,
          createdAt: true,
          readAt: true,
        },
      });

      return {
        kind: "created" as const,
        message,
      };
    });

    if (result.kind === "not-found") {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    if (result.kind === "cancelled") {
      return NextResponse.json(
        { error: CANCELLED_MESSAGE },
        { status: 403 },
      );
    }

    if (result.kind === "messaging-paused") {
      return NextResponse.json(
        { error: pausedMessage(isStudent) },
        { status: 403 },
      );
    }

    // Build the notification from the same trusted conversation record used to
    // authorize this send. Keep notification persistence outside the message
    // transaction so a notification failure cannot roll back a saved message.
    try {
      const senderName = (isStudent
        ? conversation.request.studentProfile.user.name
        : conversation.request.offering.academicMateProfile.user.name
      )?.trim() || user.name?.trim() || (isStudent ? "Student" : "Academic Mate");
      const course = conversation.request.offering.course;
      const courseLabel = `${course.code} · ${course.name}`;
      const compactMessage = messageBody.replace(/\s+/g, " ").trim();
      const preview = compactMessage.length > 120 ? `${compactMessage.slice(0, 117)}…` : compactMessage;
      const sessionId = conversation.request.sessions[0]?.id ?? conversation.request.tutoringSession?.id ?? null;
      const url = sessionId
        ? `/student/sessions/${encodeURIComponent(sessionId)}/conversation`
        : `/student/messages?conversationId=${encodeURIComponent(conversationId)}`;

      await prisma.notification.create({
        data: {
          userId: recipientUserId,
          type: "NEW_MESSAGE",
          title: `New message from ${senderName}`,
          body: `${courseLabel}: ${preview}`,
          data: {
            conversationId,
            messageId: result.message.id,
            senderUserId: user.id,
            senderName,
            courseCode: course.code,
            courseName: course.name,
            ...(sessionId ? { sessionId } : {}),
            url,
            conversationUrl: url,
          },
        },
      });
    } catch (error) {
      console.error("Unable to create new-message notification:", error instanceof Error ? error.message : "Unknown notification error");
    }

    const message = {
      ...result.message,
      createdAt: result.message.createdAt.toISOString(),
      readAt: result.message.readAt?.toISOString() ?? null,
    };

    // Database persistence is authoritative. Realtime delivery is best-effort:
    // a Socket.IO outage must not turn a successfully saved message into an API error.
    try {
      emitConversationMessage(message);
    } catch (error) {
      console.error("Unable to broadcast newly created message:", error);
    }

    return NextResponse.json(
      { message },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "POST /api/student/conversations/[conversationId]/messages failed:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to send this message." },
      { status: 500 },
    );
  }
}