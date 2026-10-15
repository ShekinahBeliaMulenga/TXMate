
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMINDER_WINDOW_MS = 5 * 60 * 1000;
const MAX_LATE_MS = 2 * 60 * 1000;
const MAX_SESSIONS_PER_RUN = 100;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("CRON_SECRET is not configured.");
    return NextResponse.json(
      { error: "Scheduler is not configured." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const reminderDeadline = new Date(now.getTime() + REMINDER_WINDOW_MS);
  const earliestStart = new Date(now.getTime() - MAX_LATE_MS);

  try {
    const sessions = await prisma.tutoringSession.findMany({
      where: {
        status: "SCHEDULED",
        reminderSentAt: null,
        scheduledStart: {
          gte: earliestStart,
          lte: reminderDeadline,
        },
        scheduledEnd: { gt: now },
      },
      orderBy: { scheduledStart: "asc" },
      take: MAX_SESSIONS_PER_RUN,
      select: {
        id: true,
        scheduledStart: true,
        scheduledEnd: true,
        request: {
          select: {
            status: true,
            studentProfile: {
              select: {
                userId: true,
                user: { select: { name: true } },
              },
            },
            offering: {
              select: {
                course: { select: { code: true, name: true } },
                academicMateProfile: { select: { userId: true } },
              },
            },
          },
        },
      },
    });

    let remindersSent = 0;
    let skipped = 0;
    let failed = 0;

    for (const session of sessions) {
      if (session.request.status !== "ACCEPTED") {
        skipped++;
        continue;
      }

      const studentId = session.request.studentProfile.userId;
      const studentName = session.request.studentProfile.user.name;
      const mateId = session.request.offering.academicMateProfile.userId;
      const course = session.request.offering.course;
      const courseName = `${course.code} · ${course.name}`;

      try {
        const sent = await prisma.$transaction(async (tx) => {
          const claimNow = new Date();
          const claimDeadline = new Date(
            claimNow.getTime() + REMINDER_WINDOW_MS,
          );
          const claimEarliestStart = new Date(
            claimNow.getTime() - MAX_LATE_MS,
          );

          const claim = await tx.tutoringSession.updateMany({
            where: {
              id: session.id,
              status: "SCHEDULED",
              reminderSentAt: null,
              scheduledStart: {
                gte: claimEarliestStart,
                lte: claimDeadline,
              },
              scheduledEnd: { gt: claimNow },
            },
            data: { reminderSentAt: claimNow },
          });

          if (claim.count !== 1) return false;

          const minutesUntilStart = Math.ceil(
            (session.scheduledStart.getTime() - claimNow.getTime()) / 60_000,
          );

          const timingMessage =
            minutesUntilStart <= 0
              ? "Your session is starting now or has just started."
              : `Your session starts in about ${minutesUntilStart} minute${minutesUntilStart === 1 ? "" : "s"}.`;

          const notificationData = {
            sessionId: session.id,
            scheduledStart: session.scheduledStart.toISOString(),
            conversationUrl: `/student/sessions/${encodeURIComponent(session.id)}/conversation`,
          };

          await tx.notification.createMany({
            data: [
              {
                userId: studentId,
                type: "SESSION_REMINDER",
                title: "Tutoring session reminder",
                body: `${timingMessage} Course: ${courseName}. Open TXMate to review the details.`,
                data: notificationData,
              },
              {
                userId: mateId,
                type: "SESSION_REMINDER",
                title: "Tutoring session reminder",
                body: `${timingMessage} Course: ${courseName}. Student: ${studentName}. Open TXMate to review the details.`,
                data: notificationData,
              },
            ],
          });

          return true;
        });

        if (sent) remindersSent++;
        else skipped++;
      } catch (error) {
        failed++;
        console.error(
          `Failed to create reminder for session ${session.id}:`,
          error,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      checked: sessions.length,
      remindersSent,
      skipped,
      failed,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Session reminder scheduler failed:", error);

    return NextResponse.json(
      { error: "Unable to process session reminders." },
      { status: 500 },
    );
  }
}
