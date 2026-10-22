import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in to view your requests." },
        { status: 401 },
      );
    }

    const student = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Student profile not found. Complete onboarding first." },
        { status: 404 },
      );
    }

    const requests = await prisma.mateRequest.findMany({
      where: { studentProfileId: student.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
        respondedAt: true,
        requestedStart: true,
        requestedEnd: true,
        arrangementType: true,
        arrangementStatus: true,
        recurrenceEveryWeeks: true,
        recurrenceWeekday: true,
        recurrenceLocalStartMinute: true,
        recurrenceTimezone: true,
        recurrenceEndsAt: true,
        offering: {
          select: {
            id: true,
            title: true,
            description: true,
            rate: true,
            currency: true,
            rateType: true,
            sessionDurationMinutes: true,
            course: {
              select: { id: true, code: true, name: true },
            },
            academicMateProfile: {
              select: {
                user: {
                  select: { name: true, image: true },
                },
              },
            },
          },
        },
        tutoringSession: {
          select: {
            id: true,
            status: true,
            scheduledStart: true,
            scheduledEnd: true,
            meetingLocation: true,
          },
        },
        sessions: {
          orderBy: { scheduledStart: "asc" },
          select: {
            id: true,
            status: true,
            scheduledStart: true,
            scheduledEnd: true,
            meetingLocation: true,
          },
        },
      },
    });

    return NextResponse.json({
      requests: requests.map((request) => ({
        id: request.id,
        status: request.status,
        message: request.message,
        createdAt: request.createdAt.toISOString(),
        respondedAt: request.respondedAt?.toISOString() ?? null,
        requestedStart: request.requestedStart?.toISOString() ?? null,
        requestedEnd: request.requestedEnd?.toISOString() ?? null,
        arrangementType: request.arrangementType,
        arrangementStatus: request.arrangementStatus,
        recurrenceEveryWeeks: request.recurrenceEveryWeeks,
        recurrenceWeekday: request.recurrenceWeekday,
        recurrenceLocalStartMinute: request.recurrenceLocalStartMinute,
        recurrenceTimezone: request.recurrenceTimezone,
        recurrenceEndsAt: request.recurrenceEndsAt?.toISOString() ?? null,
        offering: {
          id: request.offering.id,
          title: request.offering.title,
          description: request.offering.description,
          rate: request.offering.rate.toString(),
          currency: request.offering.currency,
          rateType: request.offering.rateType,
          sessionDurationMinutes:
            request.offering.sessionDurationMinutes,
          course: request.offering.course,
          academicMate: request.offering.academicMateProfile.user,
        },
        tutoringSession: request.tutoringSession
          ? {
              ...request.tutoringSession,
              scheduledStart:
                request.tutoringSession.scheduledStart.toISOString(),
              scheduledEnd:
                request.tutoringSession.scheduledEnd.toISOString(),
            }
          : null,
        sessions: request.sessions.map((item) => ({
          ...item,
          scheduledStart: item.scheduledStart.toISOString(),
          scheduledEnd: item.scheduledEnd.toISOString(),
        })),
      })),
    });
  } catch (error) {
    console.error("GET /api/student/my-requests failed:", error);

    return NextResponse.json(
      { error: "Unable to load your requests." },
      { status: 500 },
    );
  }
}