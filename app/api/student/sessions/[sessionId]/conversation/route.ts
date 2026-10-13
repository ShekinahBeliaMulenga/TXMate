import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
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

async function getAuthenticatedUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}

async function getSessionConversation(sessionId: string) {
  return prisma.tutoringSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      status: true,
      request: {
        select: {
          id: true,
          status: true,
          studentProfile: {
            select: {
              userId: true,
              user: {
                select: { name: true, image: true },
              },
            },
          },
          offering: {
            select: {
              academicMateProfile: {
                select: {
                  userId: true,
                  user: {
                    select: { name: true, image: true },
                  },
                },
              },
              course: { select: { name: true } },
            },
          },
          conversation: {
            select: {
              id: true,
              studentMessagingEnabled: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });
}

function isParticipant(
  userId: string,
  booking: NonNullable<
    Awaited<ReturnType<typeof getSessionConversation>>
  >,
) {
  return (
    booking.request.studentProfile.userId === userId ||
    booking.request.offering.academicMateProfile.userId === userId
  );
}

/* A cancelled request means the session is cancelled, even if the session row keeps its old status. */
function getEffectiveSessionStatus(
  booking: NonNullable<
    Awaited<ReturnType<typeof getSessionConversation>>
  >,
) {
  const requestCancelled = String(booking.request.status)
    .toUpperCase()
    .includes("CANCEL");

  return requestCancelled ? "CANCELLED" : booking.status;
}

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be signed in to view this conversation." },
        { status: 401 },
      );
    }

    const { sessionId } = await params;

    if (!sessionId?.trim() || sessionId.length > 100) {
      return NextResponse.json(
        { error: "A valid session ID is required." },
        { status: 400 },
      );
    }

    const booking = await getSessionConversation(sessionId);

    if (!booking) {
      return NextResponse.json(
        { error: "Session not found." },
        { status: 404 },
      );
    }

    if (!isParticipant(user.id, booking)) {
      return NextResponse.json(
        { error: "You are not authorised to access this conversation." },
        { status: 403 },
      );
    }

    if (!booking.request.conversation) {
      return NextResponse.json(
        { error: "The conversation for this session has not been created." },
        { status: 404 },
      );
    }

    const isStudent = booking.request.studentProfile.userId === user.id;
    const otherUser = isStudent
      ? booking.request.offering.academicMateProfile.user
      : booking.request.studentProfile.user;
    const sessionStatus = getEffectiveSessionStatus(booking);

    return NextResponse.json({
      session: {
        id: booking.id,
        scheduledStart: booking.scheduledStart.toISOString(),
        scheduledEnd: booking.scheduledEnd.toISOString(),
        status: sessionStatus,
      },
      conversation: {
        id: booking.request.conversation.id,
        courseName: booking.request.offering.course.name,
        studentMessagingEnabled: booking.request.conversation.studentMessagingEnabled,
        createdAt: booking.request.conversation.createdAt.toISOString(),
        updatedAt: booking.request.conversation.updatedAt.toISOString(),
        otherUserName: otherUser.name,
        otherUserImage: otherUser.image,
        session: {
          id: booking.id,
          scheduledStart: booking.scheduledStart.toISOString(),
          scheduledEnd: booking.scheduledEnd.toISOString(),
          status: sessionStatus,
        },
      },
      participantRole: isStudent ? "STUDENT" : "ACADEMIC_MATE",
    });
  } catch (error) {
    console.error(
      "GET /api/student/sessions/[sessionId]/conversation failed:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to load the session conversation." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be signed in to manage messaging." },
        { status: 401 },
      );
    }

    const { sessionId } = await params;

    if (!sessionId?.trim() || sessionId.length > 100) {
      return NextResponse.json(
        { error: "A valid session ID is required." },
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
      typeof body.studentMessagingEnabled !== "boolean"
    ) {
      return NextResponse.json(
        {
          error:
            'Provide only "studentMessagingEnabled" as a boolean.',
        },
        { status: 400 },
      );
    }

    const booking = await getSessionConversation(sessionId);

    if (!booking) {
      return NextResponse.json(
        { error: "Session not found." },
        { status: 404 },
      );
    }

    if (
      booking.request.offering.academicMateProfile.userId !== user.id
    ) {
      return NextResponse.json(
        {
          error:
            "Only the Academic Mate for this session can change student messaging.",
        },
        { status: 403 },
      );
    }

    if (!booking.request.conversation) {
      return NextResponse.json(
        { error: "The conversation for this session has not been created." },
        { status: 404 },
      );
    }

    const conversation = await prisma.conversation.update({
      where: {
        id: booking.request.conversation.id,
      },
      data: {
        studentMessagingEnabled: body.studentMessagingEnabled,
      },
      select: {
        id: true,
        studentMessagingEnabled: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: conversation.studentMessagingEnabled
        ? "Student messaging has been reopened."
        : "Student messaging has been paused.",
      conversation: {
        ...conversation,
        updatedAt: conversation.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error(
      "PATCH /api/student/sessions/[sessionId]/conversation failed:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to update messaging settings." },
      { status: 500 },
    );
  }
}