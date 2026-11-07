export const CASE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export const CASE_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export const CASE_CATEGORIES = ["ACCOUNT", "TUTORING", "CONDUCT", "TECHNICAL", "OTHER"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CasePriority = (typeof CASE_PRIORITIES)[number];
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export const CASE_TITLE_MAX = 150;
export const CASE_TEXT_MAX = 4000;
export const CASE_PAGE_SIZE = 25;

export type CaseRow = {
  id: string;
  title: string;
  description: string;
  category: CaseCategory;
  priority: CasePriority;
  status: CaseStatus;
  university: string | null;
  subject: { name: string; email: string } | null;
  assignedTo: string | null;
  assignedToMe: boolean;
  resolution: string | null;
  createdByName: string;
  createdAt: string;
  resolvedAt: string | null;
  notes: Array<{ id: string; authorName: string; body: string; createdAt: string }>;
};

export type CasePage = { items: CaseRow[]; page: number; pageCount: number; total: number };

/** A case can only be resolved or closed with a written outcome. */
export const needsResolution = (status: CaseStatus) => status === "RESOLVED" || status === "CLOSED";
