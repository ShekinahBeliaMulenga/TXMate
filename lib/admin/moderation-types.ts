export const REASON_MIN = 5;
export const REASON_MAX = 500;
export const REVIEW_PAGE_SIZE = 25;

export type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer: string;
  mate: string;
  course: string;
  university: string;
  hidden: boolean;
  hiddenReason: string | null;
};
export type ReviewPage = { items: ReviewRow[]; page: number; pageCount: number; total: number };

export type ConversationView = {
  messagingEnabled: boolean;
  messages: Array<{ id: string; sender: string; body: string; createdAt: string }>;
  /** True when older messages exist beyond the 200 shown. */
  more: boolean;
};
