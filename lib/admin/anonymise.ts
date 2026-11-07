import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit";
import type { AdminContext } from "./guard";
import { canAccessUniversity } from "./permissions";
import type { RequestContext } from "./request-context";
import { REASON_MAX, REASON_MIN } from "./moderation-types";

type Fail = { ok: false; status: 400 | 403 | 404 | 409; error: string };
const fail = (status: 400 | 403 | 404 | 409, error: string): Fail => ({ ok: false, status, error });

/**
 * Removes a person's personal details while keeping the records other people depend on (sessions,
 * ratings, requests). Irreversible. Refused for admins, for yourself, for someone already
 * anonymised, and while they still have sessions that have not finished.
 *
 * What goes: name, email, photo, username, sign-in methods and sessions, notifications, push devices,
 * phone number, bio, student ID, headline and experience text, qualifications, review comments and
 * the text of messages they sent. What stays: ratings, sessions, requests and the fact that they existed.
 */
export async function anonymiseUser(admin: AdminContext, input: { userId: string; confirmEmail: string; reason: string; context: RequestContext }): Promise<{ ok: true; message: string } | Fail> {
  const reason = input.reason.trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) return fail(400, `Give a reason of ${REASON_MIN} to ${REASON_MAX} characters.`);
  if (input.userId === admin.userId) return fail(403, "You can’t anonymise your own account.");

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true, email: true, anonymisedAt: true,
        adminProfile: { select: { id: true } },
        studentProfile: { select: { id: true, universityId: true } },
        academicMate: { select: { id: true, universityId: true } },
      },
    });
    const universityId = user?.studentProfile?.universityId ?? user?.academicMate?.universityId ?? null;
    if (!user || user.adminProfile || !universityId || !canAccessUniversity(admin.scope, universityId)) return fail(404, "Account not found.");
    if (user.anonymisedAt) return fail(409, "This account is already anonymised.");
    if (input.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) return fail(400, "The email you typed does not match this account.");

    const unfinished = await tx.tutoringSession.count({
      where: {
        status: { in: ["SCHEDULED", "IN_PROGRESS", "DISPUTED"] },
        request: {
          is: {
            OR: [
              ...(user.studentProfile ? [{ studentProfileId: user.studentProfile.id }] : []),
              ...(user.academicMate ? [{ offering: { is: { academicMateProfileId: user.academicMate.id } } }] : []),
            ],
          },
        },
      },
    });
    if (unfinished > 0) return fail(409, `This person still has ${unfinished} ${unfinished === 1 ? "session" : "sessions"} that ${unfinished === 1 ? "has" : "have"} not finished. Resolve or cancel ${unfinished === 1 ? "it" : "them"} first.`);

    await tx.user.update({ where: { id: user.id }, data: { name: "Deleted user", email: `deleted-${user.id}@anonymised.invalid`, image: null, username: null, emailVerified: false, anonymisedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.account.deleteMany({ where: { userId: user.id } });
    await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
    await tx.notification.deleteMany({ where: { userId: user.id } });
    await tx.message.updateMany({ where: { senderUserId: user.id }, data: { body: "[Message removed]" } });
    await tx.review.updateMany({ where: { reviewerUserId: user.id }, data: { comment: null } });
    if (user.studentProfile) {
      await tx.studentProfile.update({ where: { id: user.studentProfile.id }, data: { phoneNumber: null, bio: null, studentId: `deleted-${user.studentProfile.id}`, status: "WITHDRAWN", profileVisibility: "PRIVATE", showStudentId: false, showPhoneNumber: false } });
    }
    if (user.academicMate) {
      await tx.academicMateExperience.deleteMany({ where: { academicMateProfileId: user.academicMate.id } });
      await tx.academicMateQualification.deleteMany({ where: { academicMateProfileId: user.academicMate.id } });
      await tx.academicMateProfile.update({ where: { id: user.academicMate.id }, data: { headline: null, bio: null, teachingExperience: null, status: "INACTIVE", profileVisibility: "PRIVATE" } });
    }
    await recordAudit(tx, { actor: admin, action: "ACCOUNT_ANONYMISED", targetType: "USER", targetId: user.id, universityId, summary: "Anonymised an account", metadata: { reason }, context: input.context });
    return { ok: true as const, message: "Account anonymised." };
  }, { timeout: 30_000 });
}
