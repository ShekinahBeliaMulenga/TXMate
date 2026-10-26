import { NO_RESPONSE_AFTER_MS } from "@/lib/session-lifecycle-rules";

/**
 * One plain-language state for a session, judged by the clock as well as the stored status.
 * Used by the Messages list and the chat header so they always agree: a session whose time
 * has passed but isn't closed yet is "Awaiting confirmation", never "Next".
 */
export type BadgeTone = "quiet" | "live" | "warn" | "bad";
export type SessionBadge = { label: string; tone: BadgeTone };

export function sessionBadge(
  session: { status: string; scheduledStart: string | Date; scheduledEnd: string | Date },
  nowMs: number,
  recurring = false,
): SessionBadge {
  switch (session.status) {
    case "COMPLETED": return { label: "Completed", tone: "quiet" };
    case "CANCELLED": return { label: "Cancelled", tone: "quiet" };
    case "NO_SHOW": return { label: "No-show", tone: "quiet" };
    case "DISPUTED": return { label: "Needs review", tone: "bad" };
  }
  const start = new Date(session.scheduledStart).getTime();
  const end = new Date(session.scheduledEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { label: "Session", tone: "quiet" };
  if (nowMs < start) return { label: recurring ? "Next session" : "Upcoming", tone: "quiet" };
  if (nowMs < end) return { label: "In progress", tone: "live" };
  if (nowMs >= end + NO_RESPONSE_AFTER_MS) return { label: "No response", tone: "warn" };
  return { label: "Awaiting confirmation", tone: "warn" };
}

export const BADGE_TEXT: Record<BadgeTone, string> = {
  quiet: "text-[#8a7f7a]",
  live: "text-emerald-700",
  warn: "font-semibold text-amber-800",
  bad: "text-red-700",
};
export const BADGE_CHIP: Record<BadgeTone, string> = {
  quiet: "bg-stone-200 text-stone-600",
  live: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-900",
  bad: "bg-red-100 text-red-800",
};
