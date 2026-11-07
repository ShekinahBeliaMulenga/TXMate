/** Client-safe shapes for the dashboard, tutoring directories and health page. */

export type CountMap = Record<string, number>;

export type DashboardMetrics = {
  users: { total: number; students: number; mates: number; admins: number | null; newStudents7d: number; newMates7d: number };
  studentStatus: CountMap;
  mateStatus: CountMap;
  verification: CountMap;
  offerings: CountMap;
  requests: CountMap;
  sessions: CountMap;
  arrangementsActive: number;
  outstanding: { attendance: number; completion: number; disputes: number };
  adminActions24h: number | null;
  failedDeliveries: number | null;
  integrityIssues: number;
};

export type DirectoryKind = "requests" | "sessions";
export const DIRECTORY_PAGE_SIZE = 25;

export type DirectoryRow = {
  id: string;
  /** Short readable line, e.g. "MAT101 Calculus". */
  title: string;
  student: string;
  mate: string;
  university: string;
  status: string;
  /** Arrangement type for requests, venue for sessions. */
  detail: string;
  when: string | null;
  /** Extra facts shown when the row is opened. */
  facts: Array<{ label: string; value: string }>;
};

export type DirectoryPage = { items: DirectoryRow[]; page: number; pageCount: number; total: number };

export const REQUEST_STATUSES = ["REQUESTED", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"] as const;
export const SESSION_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW", "DISPUTED"] as const;
export const ARRANGEMENT_STATUSES = ["PENDING", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED", "EXPIRED"] as const;

export type IntegrityCheck = {
  id: string;
  title: string;
  /** What the problem is and why it matters. */
  explanation: string;
  count: number;
  /** What an admin should do about it. */
  action: string;
  href?: string;
  /** Up to a few examples (human readable, no internal IDs). */
  examples: string[];
};

export type HealthReport = {
  database: { ok: boolean; latencyMs: number | null };
  checks: IntegrityCheck[];
  deliveries: null | { channel: string; failed: number; pending: number; examples: Array<{ when: string; reason: string }> }[];
  generatedAt: string;
};

export function statusLabel(value: string): string {
  const text = value.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
