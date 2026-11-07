import { prisma } from "@/lib/prisma";
import { CLEANUP_BATCH_SIZE, unverifiedCutoff } from "./account-cleanup-rules";

/**
 * Removes accounts that were never verified and never used: the email was mistyped, or the person gave up.
 * An account is only removed when it is older than the limit AND has no profile of any kind (student, Academic Mate,
 * admin, including pending admin invitations) and nothing it has written or paid. Sign-in records go with it.
 */
export async function removeStaleUnverifiedAccounts(now = new Date()): Promise<{ deleted: number; failed: number }> {
  const stale = await prisma.user.findMany({
    where: {
      emailVerified: false,
      anonymisedAt: null,
      createdAt: { lt: unverifiedCutoff(now) },
      studentProfile: { is: null },
      academicMate: { is: null },
      adminProfile: { is: null },
      sentMessages: { none: {} },
      reviewsWritten: { none: {} },
      paymentsMade: { none: {} },
      subscriptions: { none: {} },
      rescheduleRequestsProposed: { none: {} },
      rescheduleRequestsReceived: { none: {} },
      tutoringArrangementsCancelled: { none: {} },
      tutoringSessionsCancelled: { none: {} },
      disputedSessionCompletions: { none: {} },
      supportCasesAbout: { none: {} },
    },
    orderBy: { createdAt: "asc" },
    take: CLEANUP_BATCH_SIZE,
    select: { id: true, email: true },
  });

  let deleted = 0;
  let failed = 0;
  for (const account of stale) {
    try {
      // Re-check inside the delete so an account that verified a moment ago is never removed.
      const result = await prisma.user.deleteMany({ where: { id: account.id, emailVerified: false } });
      if (result.count === 1) {
        deleted++;
        await prisma.verification.deleteMany({ where: { identifier: account.email } }).catch(() => undefined);
      }
    } catch (error) {
      failed++;
      console.error(`Could not remove stale unverified account ${account.id}:`, error);
    }
  }
  if (deleted > 0) console.info(`Removed ${deleted} stale unverified ${deleted === 1 ? "account" : "accounts"}.`);
  return { deleted, failed };
}
