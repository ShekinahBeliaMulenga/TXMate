
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureRecurringSessions } from "@/lib/recurring-session-generator";
import { expirePendingRescheduleProposals } from "@/lib/reschedule-proposal-expiry";

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
  let rescheduleProposalExpiry = {
    checked: 0,
    expired: 0,
    failed: 0,
    hasMore: false,
  };
  try {
    rescheduleProposalExpiry = await expirePendingRescheduleProposals(now);
  } catch (error) {
    rescheduleProposalExpiry.failed++;
    console.error("Rescheduling-proposal expiry failed:", error);
  }

  let recurringGeneration = {
    arrangementsChecked: 0,
    sessionsCreated: 0,
    conflicts: 0,
    failed: 0,
  };
  try {
    recurringGeneration = await ensureRecurringSessions(now);
  } catch (error) {
    recurringGeneration.failed++;
    console.error("Recurring-session generation failed:", error);
  }

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
            arrangementStatus: true,
            studentProfile: {
              select: {
                userId: true,
                user: { select: { name: true } },
              },
            },
            recurrenceTimezone: true,
            offering: {
              select: {
                course: { select: { code: true, name: true } },
                academicMateProfile: { select: { userId: true, user: { select: { name: true } } } },
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
      if (session.request.status !== "ACCEPTED" || session.request.arrangementStatus !== "ACTIVE") {
        skipped++;
        continue;
      }

      const studentId = session.request.studentProfile.userId;
      const studentName = session.request.studentProfile.user.name || "the student";
      const mateId = session.request.offering.academicMateProfile.userId;
      const mateName = session.request.offering.academicMateProfile.user.name || "the Academic Mate";
      const course = session.request.offering.course;
      const courseName = `${course.code} · ${course.name}`;
      const timezone = session.request.recurrenceTimezone || "Africa/Lusaka";
      let scheduledTimeLabel: string;
      try {
        scheduledTimeLabel = new Intl.DateTimeFormat("en-ZM", {
          timeZone: timezone, weekday: "short", day: "numeric", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        }).format(session.scheduledStart);
      } catch {
        scheduledTimeLabel = session.scheduledStart.toISOString();
      }

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
              request: {
                is: {
                  status: "ACCEPTED",
                  arrangementStatus: "ACTIVE",
                },
              },
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

          const conversationUrl = `/student/sessions/${encodeURIComponent(session.id)}/conversation`;
          const notificationData = {
            sessionId: session.id,
            scheduledStart: session.scheduledStart.toISOString(),
            scheduledEnd: session.scheduledEnd.toISOString(),
            courseCode: course.code,
            courseName: course.name,
            studentName,
            academicMateName: mateName,
            timezone,
            conversationUrl,
            url: conversationUrl,
          };
          await tx.notification.createMany({
            data: [
              {
                userId: studentId,
                type: "SESSION_REMINDER",
                title: `Session with ${mateName} starts soon`,
                body: `${timingMessage} Your ${courseName} session with ${mateName} is scheduled for ${scheduledTimeLabel} (${timezone}).`,
                data: notificationData,
              },
              {
                userId: mateId,
                type: "SESSION_REMINDER",
                title: `Session with ${studentName} starts soon`,
                body: `${timingMessage} Your ${courseName} session with ${studentName} is scheduled for ${scheduledTimeLabel} (${timezone}).`,
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
      recurringGeneration,
      rescheduleProposalExpiry,
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
