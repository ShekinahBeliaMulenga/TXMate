/** The groups notifications are sorted into on the notifications page. Plain data, safe to use in the browser and on the server. */
export const NOTIFICATION_CATEGORIES = {
  sessions: { label: "Sessions", types: ["SESSION_SCHEDULED", "SESSION_REMINDER", "SESSION_COMPLETED", "SESSION_CANCELLED"] },
  requests: { label: "Requests", types: ["MATE_REQUEST", "REQUEST_ACCEPTED", "REQUEST_DECLINED"] },
  messages: { label: "Messages", types: ["NEW_MESSAGE"] },
  reviews: { label: "Reviews", types: ["REVIEW_RECEIVED"] },
  account: { label: "Updates", types: ["SYSTEM", "VERIFICATION_UPDATED", "SUBSCRIPTION_UPDATED", "PAYMENT_SUCCESS", "PAYMENT_FAILED", "PAYOUT_COMPLETED"] },
} as const;
export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;
export const CATEGORY_KEYS = Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategory[];

export function isNotificationCategory(value: string): value is NotificationCategory {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_CATEGORIES, value);
}

export function categoryOfType(type: string): NotificationCategory {
  return CATEGORY_KEYS.find((key) => (NOTIFICATION_CATEGORIES[key].types as readonly string[]).includes(type)) ?? "account";
}

export type CategoryCounts = Record<NotificationCategory, number>;

/** Adds up per-type counts (from a database group-by) into one count per category. */
export function foldCategoryCounts(rows: { type: string; count: number }[]): CategoryCounts {
  const result: CategoryCounts = { sessions: 0, requests: 0, messages: 0, reviews: 0, account: 0 };
  for (const row of rows) result[categoryOfType(row.type)] += row.count;
  return result;
}
