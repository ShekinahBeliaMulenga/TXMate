import "dotenv/config";
import { prisma } from "../lib/prisma";

/**
 * Emergency reset of an admin's two-step sign-in, for when the only platform admin has lost their phone and
 * backup codes and no one else can reset it from the portal.
 *
 * Usage: npx tsx scripts/reset-admin-two-step.ts admin@example.com
 *
 * It needs access to the database, which is why it is safe to keep outside the portal: whoever can run it can
 * already change anything. It removes the authenticator and backup codes, signs the admin out everywhere, and
 * writes an audit entry. The admin sets two-step up again at their next sign-in.
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Give the admin's email: npx tsx scripts/reset-admin-two-step.ts admin@example.com");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, adminProfile: { select: { id: true, role: true } } } });
  if (!user?.adminProfile) {
    console.error(`No admin account has the email ${email}.`);
    process.exit(1);
  }
  const profile = user.adminProfile;
  await prisma.$transaction(async (tx) => {
    const removed = await tx.adminTwoFactor.deleteMany({ where: { adminProfileId: profile.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.adminAuditLog.create({
      data: {
        adminProfileId: profile.id,
        actorUserId: user.id,
        actorName: "Command line",
        actorRole: profile.role,
        action: "ADMIN_TWO_STEP_RESET",
        targetType: "ADMIN",
        targetId: profile.id,
        summary: `Two-step sign-in reset from the command line for ${user.name}`,
        metadata: { hadSetup: removed.count > 0, source: "script" },
      },
    });
    console.log(removed.count > 0 ? `Two-step sign-in removed for ${user.name}.` : `${user.name} had no two-step sign-in set up.`);
  });
  console.log("They were signed out everywhere and will set it up again at their next sign-in.");
}

main()
  .catch((error) => {
    console.error("Reset failed:", error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
