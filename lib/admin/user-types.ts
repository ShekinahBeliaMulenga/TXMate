/** Shapes and limits shared by the users API and admin UI. No server-only imports here. */

export type UserRoleFilter = "all" | "students" | "mates";
export type UserStatusFilter = "all" | "suspended";
export type AccountScope = "STUDENT" | "MATE";
export type AccountAction = "SUSPEND" | "REACTIVATE";

export const USER_PAGE_SIZE = 25;
export const REASON_MIN = 5;
export const REASON_MAX = 500;
export const SEARCH_MAX = 100;

export type UserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  university: string;
  student: { studentId: string; status: string } | null;
  mate: { status: string; verification: string } | null;
};

export type UserPage = { items: UserRow[]; nextCursor: string | null };

export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  GRADUATED: "Graduated",
  WITHDRAWN: "Withdrawn",
  INACTIVE: "Inactive",
};
