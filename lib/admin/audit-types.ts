/** Client-safe audit shapes and labels. */
export const AUDIT_PAGE_SIZE = 30;

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  ADMIN_LOGIN: "Signed in",
  VERIFICATION_APPROVED: "Approved verification",
  VERIFICATION_REJECTED: "Rejected verification",
  VERIFICATION_EXCEPTION_APPROVED: "Approved verification as an exception",
  VERIFICATION_EVIDENCE_VIEWED: "Opened a verification document",
  VERIFICATION_EVIDENCE_REVIEWED: "Reviewed a verification document",
  DISPUTE_RESOLVED: "Resolved session review",
  STUDENT_SUSPENDED: "Suspended student",
  STUDENT_REACTIVATED: "Reactivated student",
  MATE_SUSPENDED: "Suspended Academic Mate",
  MATE_REACTIVATED: "Reactivated Academic Mate",
  UNIVERSITY_CREATED: "Added university",
  UNIVERSITY_UPDATED: "Updated university",
  ACADEMIC_STRUCTURE_IMPORTED: "Imported programmes",
  ACADEMIC_STRUCTURE_UPDATED: "Changed academic structure",
  SUPPORT_CASE_CREATED: "Opened support case",
  SUPPORT_CASE_UPDATED: "Updated support case",
  REVIEW_HIDDEN: "Hid a review",
  REVIEW_RESTORED: "Restored a review",
  MESSAGES_VIEWED: "Read a conversation",
  MESSAGING_DISABLED: "Turned off messaging",
  MESSAGING_ENABLED: "Turned on messaging",
  ACCOUNT_ANONYMISED: "Anonymised account",
  ADMIN_GRANTED: "Granted admin access",
  ADMIN_INVITED: "Invited an admin",
  ADMIN_UPDATED: "Changed admin access",
  ADMIN_REVOKED: "Removed admin access",
  ADMIN_TWO_STEP_ENROLLED: "Set up two-step sign-in",
  ADMIN_TWO_STEP_FAILED: "Wrong two-step code",
  ADMIN_TWO_STEP_LOCKED: "Two-step sign-in locked",
  ADMIN_TWO_STEP_BACKUP_USED: "Used a backup code",
  ADMIN_TWO_STEP_RESET: "Reset an admin’s two-step sign-in",
};

/** Colour cue for an action: red for restrictions, green for approvals, brand for access changes. */
export function auditTone(action: string): "neutral" | "brand" | "success" | "warning" | "danger" {
  if (action === "VERIFICATION_APPROVED" || action === "STUDENT_REACTIVATED" || action === "MATE_REACTIVATED") return "success";
  if (action === "VERIFICATION_REJECTED" || action === "VERIFICATION_EXCEPTION_APPROVED" || action === "STUDENT_SUSPENDED" || action === "ACCOUNT_ANONYMISED" || action === "REVIEW_HIDDEN" || action === "MESSAGING_DISABLED" || action === "MATE_SUSPENDED" || action === "ADMIN_REVOKED" || action === "ADMIN_TWO_STEP_FAILED" || action === "ADMIN_TWO_STEP_LOCKED") return "danger";
  if (action.startsWith("ADMIN_") && action !== "ADMIN_LOGIN") return "brand";
  if (action.startsWith("UNIVERSITY_") || action.startsWith("ACADEMIC_STRUCTURE_")) return "brand";
  if (action === "DISPUTE_RESOLVED" || action === "MESSAGES_VIEWED" || action === "VERIFICATION_EVIDENCE_VIEWED" || action === "ADMIN_TWO_STEP_BACKUP_USED" || action === "ADMIN_TWO_STEP_RESET") return "warning";
  if (action === "REVIEW_RESTORED" || action === "MESSAGING_ENABLED") return "success";
  return "neutral";
}

export type AuditEntry = {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  summary: string | null;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  /** Small structured facts recorded with the action (for example the reason). */
  details: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type AuditPage = { items: AuditEntry[]; nextCursor: string | null };
