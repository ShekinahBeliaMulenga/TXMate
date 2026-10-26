/** Client-safe audit shapes and labels. */
export const AUDIT_PAGE_SIZE = 30;

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  ADMIN_LOGIN: "Signed in",
  VERIFICATION_APPROVED: "Approved verification",
  VERIFICATION_REJECTED: "Rejected verification",
  DISPUTE_RESOLVED: "Resolved session review",
  STUDENT_SUSPENDED: "Suspended student",
  STUDENT_REACTIVATED: "Reactivated student",
  MATE_SUSPENDED: "Suspended Academic Mate",
  MATE_REACTIVATED: "Reactivated Academic Mate",
};

export type AuditEntry = {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  summary: string | null;
  createdAt: string;
};

export type AuditPage = { items: AuditEntry[]; nextCursor: string | null };
