import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit";
import type { AdminContext } from "./guard";
import { decryptSecret, encryptSecret, hashBackupCode } from "./mfa-crypto";
import { LOCK_MS, lockMessage, lockRemainingMs, shouldLock } from "./mfa-policy";
import type { RequestContext } from "./request-context";
import { BACKUP_CODE_COUNT, classifyCode, formatBackupCode, formatSecret, generateBackupCodes, generateSecret, normalizeBackupCode, otpauthUri, verifyTotp } from "./totp";

/**
 * Admin two-step sign-in: authenticator app (TOTP) plus one-time backup codes.
 *
 * The password alone never opens the admin portal. The guard treats a session as an admin session only
 * once a row in AdminSessionMfa exists for it, and these functions are the only place that writes one.
 */

export type MfaResult<T = object> = ({ ok: true } & T) | { ok: false; status: 400 | 409 | 429; error: string };
const fail = (status: 400 | 409 | 429, error: string): { ok: false; status: 400 | 409 | 429; error: string } => ({ ok: false, status, error });

/** One message for every wrong code, so it does not say which kind of code was tried. */
const WRONG_CODE = "That code isn’t right. Check the code in your authenticator app and try again.";

async function auditSafely(input: Parameters<typeof recordAudit>[1]): Promise<void> {
  // The trail matters, but a logging problem must not decide whether someone can sign in.
  try {
    await recordAudit(prisma, input);
  } catch (error) {
    console.error("Two-step audit write failed:", error);
  }
}

/** Counts one wrong code; the fifth in a row locks two-step attempts for 15 minutes. */
async function recordFailure(admin: AdminContext, twoFactorId: string, kind: string, context: RequestContext | undefined, now: number) {
  const row = await prisma.adminTwoFactor.update({ where: { id: twoFactorId }, data: { failedAttempts: { increment: 1 } }, select: { failedAttempts: true } });
  const locked = shouldLock(row.failedAttempts);
  if (locked) await prisma.adminTwoFactor.update({ where: { id: twoFactorId }, data: { failedAttempts: 0, lockedUntil: new Date(now + LOCK_MS) } });
  await auditSafely({
    actor: admin,
    action: locked ? "ADMIN_TWO_STEP_LOCKED" : "ADMIN_TWO_STEP_FAILED",
    targetType: "ADMIN",
    targetId: admin.adminId,
    summary: locked ? "Two-step sign-in locked after too many wrong codes" : "Wrong two-step code entered",
    metadata: { kind },
    context,
  });
  return locked ? fail(429, lockMessage(LOCK_MS)) : fail(400, WRONG_CODE);
}

/** Starts (or restarts) setup. Returns the key once; it is stored encrypted and is useless until a code from it is confirmed. */
export async function beginEnrollment(admin: AdminContext): Promise<MfaResult<{ secret: string; uri: string }>> {
  const secret = generateSecret();
  const secretEncrypted = encryptSecret(secret, admin.adminId);
  const existing = await prisma.adminTwoFactor.findUnique({ where: { adminProfileId: admin.adminId }, select: { confirmedAt: true } });
  if (existing?.confirmedAt) return fail(409, "Two-step sign-in is already set up for this account.");
  if (existing) {
    // Only an unconfirmed setup may be replaced, so a finished one can never be overwritten by a race.
    const replaced = await prisma.adminTwoFactor.updateMany({ where: { adminProfileId: admin.adminId, confirmedAt: null }, data: { secretEncrypted, lastUsedStep: null, failedAttempts: 0, lockedUntil: null } });
    if (replaced.count !== 1) return fail(409, "Two-step sign-in is already set up for this account.");
  } else {
    try {
      await prisma.adminTwoFactor.create({ data: { adminProfileId: admin.adminId, secretEncrypted } });
    } catch {
      return fail(409, "Setup was started somewhere else. Reload this page and try again.");
    }
  }
  return { ok: true, secret: formatSecret(secret), uri: otpauthUri(secret, admin.email) };
}

/** Finishes setup with the first code. Returns the backup codes, shown once and never stored in readable form. */
export async function confirmEnrollment(admin: AdminContext, input: { code: string; context?: RequestContext; now?: number }): Promise<MfaResult<{ backupCodes: string[] }>> {
  const now = input.now ?? Date.now();
  const row = await prisma.adminTwoFactor.findUnique({ where: { adminProfileId: admin.adminId }, select: { id: true, secretEncrypted: true, confirmedAt: true, lockedUntil: true } });
  if (!row || row.confirmedAt) return fail(409, "Start two-step setup first.");
  const locked = lockRemainingMs(row.lockedUntil, now);
  if (locked > 0) return fail(429, lockMessage(locked));
  const secret = decryptSecret(row.secretEncrypted, admin.adminId);
  if (!secret) return fail(409, "This setup can’t be read any more. Start again.");

  const check = verifyTotp(secret, input.code, now, null);
  if (!check.ok) return recordFailure(admin, row.id, "setup", input.context, now);

  const plain = generateBackupCodes(BACKUP_CODE_COUNT);
  const done = await prisma.$transaction(async (tx) => {
    const claimed = await tx.adminTwoFactor.updateMany({ where: { id: row.id, confirmedAt: null }, data: { confirmedAt: new Date(now), lastUsedStep: check.step, failedAttempts: 0, lockedUntil: null } });
    if (claimed.count !== 1) return false;
    await tx.adminBackupCode.deleteMany({ where: { twoFactorId: row.id } });
    await tx.adminBackupCode.createMany({ data: plain.map((code) => ({ twoFactorId: row.id, codeHash: hashBackupCode(code) })) });
    await tx.adminSessionMfa.upsert({ where: { sessionId: admin.sessionId }, create: { sessionId: admin.sessionId, method: "TOTP" }, update: { verifiedAt: new Date(now), method: "TOTP" } });
    await recordAudit(tx, { actor: admin, action: "ADMIN_TWO_STEP_ENROLLED", targetType: "ADMIN", targetId: admin.adminId, summary: "Set up two-step sign-in", context: input.context });
    return true;
  });
  if (!done) return fail(409, "Setup was already finished. Reload this page.");
  return { ok: true, backupCodes: plain.map(formatBackupCode) };
}

/** Second step of a sign-in: an authenticator code, or one backup code (which is then used up). */
export async function verifySignIn(admin: AdminContext, input: { code: string; context?: RequestContext; now?: number }): Promise<MfaResult<{ usedBackupCode: boolean; backupCodesLeft: number | null }>> {
  const now = input.now ?? Date.now();
  const row = await prisma.adminTwoFactor.findUnique({ where: { adminProfileId: admin.adminId }, select: { id: true, secretEncrypted: true, confirmedAt: true, lastUsedStep: true, lockedUntil: true } });
  if (!row?.confirmedAt) return fail(409, "Two-step sign-in isn’t set up for this account yet.");
  const locked = lockRemainingMs(row.lockedUntil, now);
  if (locked > 0) return fail(429, lockMessage(locked));

  const kind = classifyCode(input.code);
  // Not shaped like either kind of code: nothing to check, so it is not counted as a guess.
  if (!kind) return fail(400, "Enter the 6-digit code from your authenticator app, or a backup code.");

  let method: "TOTP" | "BACKUP";
  if (kind === "totp") {
    const secret = decryptSecret(row.secretEncrypted, admin.adminId);
    if (!secret) return fail(409, "Your two-step setup can’t be read. Ask a platform admin to reset it.");
    const check = verifyTotp(secret, input.code, now, row.lastUsedStep);
    if (!check.ok) return recordFailure(admin, row.id, "totp", input.context, now);
    // Claimed in the database so two requests carrying the same code cannot both pass.
    const claimed = await prisma.adminTwoFactor.updateMany({
      where: { id: row.id, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: check.step } }] },
      data: { lastUsedStep: check.step, failedAttempts: 0, lockedUntil: null },
    });
    if (claimed.count !== 1) return recordFailure(admin, row.id, "totp", input.context, now);
    method = "TOTP";
  } else {
    const normalized = normalizeBackupCode(input.code);
    if (!normalized) return fail(400, WRONG_CODE);
    const claimed = await prisma.adminBackupCode.updateMany({ where: { twoFactorId: row.id, codeHash: hashBackupCode(normalized), usedAt: null }, data: { usedAt: new Date(now) } });
    if (claimed.count !== 1) return recordFailure(admin, row.id, "backup", input.context, now);
    await prisma.adminTwoFactor.update({ where: { id: row.id }, data: { failedAttempts: 0, lockedUntil: null } });
    method = "BACKUP";
  }

  await prisma.adminSessionMfa.upsert({ where: { sessionId: admin.sessionId }, create: { sessionId: admin.sessionId, method }, update: { verifiedAt: new Date(now), method } });

  if (method === "BACKUP") {
    const left = await prisma.adminBackupCode.count({ where: { twoFactorId: row.id, usedAt: null } });
    await auditSafely({ actor: admin, action: "ADMIN_TWO_STEP_BACKUP_USED", targetType: "ADMIN", targetId: admin.adminId, summary: `Signed in with a backup code (${left} left)`, metadata: { left }, context: input.context });
    return { ok: true, usedBackupCode: true, backupCodesLeft: left };
  }
  return { ok: true, usedBackupCode: false, backupCodesLeft: null };
}
