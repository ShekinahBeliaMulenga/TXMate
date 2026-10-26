import type { prisma as PrismaInstance } from "@/lib/prisma";
import type { AdminRoleName } from "./permissions";
import type { RequestContext } from "./request-context";

/** Works with the shared client or a transaction handle, so an audit row commits with the change it describes. */
type Db = Pick<typeof PrismaInstance, "adminAuditLog">;

/** Every audited action. Add new ones here so the trail stays a closed, searchable vocabulary. */
export const AUDIT_ACTIONS = [
  "ADMIN_LOGIN",
  "VERIFICATION_APPROVED",
  "VERIFICATION_REJECTED",
  "DISPUTE_RESOLVED",
  "STUDENT_SUSPENDED",
  "STUDENT_REACTIVATED",
  "MATE_SUSPENDED",
  "MATE_REACTIVATED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGETS = ["ADMIN_SESSION", "ACADEMIC_MATE", "TUTORING_SESSION", "STUDENT"] as const;
export type AuditTarget = (typeof AUDIT_TARGETS)[number];

export type AuditActor = { adminId: string; userId: string; name: string; role: AdminRoleName };

export type AuditInput = {
  actor: AuditActor;
  action: AuditAction;
  targetType: AuditTarget;
  targetId?: string | null;
  universityId?: string | null;
  /** One human-readable line, shown in the activity feed. */
  summary?: string | null;
  /** Small structured facts (before/after values, outcome). Never put secrets or full records here. */
  metadata?: Record<string, string | number | boolean | null>;
  context?: RequestContext;
};

/**
 * Appends one audit entry. Entries are never updated or deleted by the application.
 * Call it with the transaction handle (`tx`) for state changes so an unaudited change cannot commit.
 */
export async function recordAudit(db: Db, input: AuditInput): Promise<void> {
  await db.adminAuditLog.create({
    data: {
      adminProfileId: input.actor.adminId,
      actorUserId: input.actor.userId,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      universityId: input.universityId ?? null,
      summary: input.summary ? input.summary.slice(0, 300) : null,
      metadata: input.metadata,
      ipAddress: input.context?.ipAddress ?? null,
      userAgent: input.context?.userAgent ?? null,
    },
  });
}
