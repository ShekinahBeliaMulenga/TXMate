/**
 * Shapes and limits shared by the disputes API and the admin UI. Keep this file free of server-only
 * imports (no Prisma, no next/headers) so client components can import it.
 */

export type DisputeListKind = "open" | "resolved";
export type DisputeOutcome = "COMPLETED" | "NO_SHOW";

export const NOTE_MIN = 5;
export const NOTE_MAX = 1000;

export type DisputeItem = {
  id: string;
  groupId: string | null;
  course: { code: string; name: string };
  university: string;
  student: { name: string; studentId: string };
  mate: { name: string };
  scheduledStart: string;
  scheduledEnd: string;
  location: string;
  arrangementType: "ONE_TIME" | "RECURRING";
  /** Why it is here, in plain words. */
  reasons: string[];
  studentAnswer: string;
  mateAnswer: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

export type DisputePage = { items: DisputeItem[]; nextCursor: string | null };

export const DISPUTE_PAGE_SIZE = 25;

