/** Wording, grouping and icons shared by the notification bell and the notifications page. */
import type { IconName } from "@/components/ui/icon";

export type NotificationItem = { id: string; type: string; title: string; body: string; url: string; read: boolean; createdAt: string };
export type NoticeKind = "attendance" | "session" | "message" | "completion" | "review" | "request" | "general";

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function ago(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return RELATIVE.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return RELATIVE.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 7) return RELATIVE.format(-days, "day");
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) }).format(date);
}

export function dayLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Earlier";
  const today = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(today) - start(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return "This week";
  return "Earlier";
}

export function noticeKind(item: NotificationItem): NoticeKind {
  const value = `${item.type} ${item.title} ${item.body}`.toLowerCase();
  if (/attend|present|absence|no.show/.test(value)) return "attendance";
  if (/complet|finished|session.confirm|confirm.session/.test(value)) return "completion";
  if (/review|rating|rated/.test(value)) return "review";
  if (/message|chat|reply/.test(value)) return "message";
  if (/request|accept|declin|mate/.test(value)) return "request";
  if (/session|schedule|reschedul|cancel|remind/.test(value)) return "session";
  return "general";
}

export const KIND_STYLES: Record<NoticeKind, { label: string; icon: IconName; color: string }> = {
  attendance: { label: "Attendance", icon: "check", color: "bg-amber-50 text-amber-800 ring-amber-100" },
  completion: { label: "Completion", icon: "complete", color: "bg-emerald-50 text-emerald-800 ring-emerald-100" },
  review: { label: "Review", icon: "star", color: "bg-violet-50 text-violet-800 ring-violet-100" },
  message: { label: "Message", icon: "message", color: "bg-sky-50 text-sky-800 ring-sky-100" },
  request: { label: "Request", icon: "request", color: "bg-rose-50 text-rose-800 ring-rose-100" },
  session: { label: "Session", icon: "calendar", color: "bg-[#f7f0ed] text-[#7d1f2a] ring-[#eee0db]" },
  general: { label: "Update", icon: "bell", color: "bg-stone-100 text-stone-700 ring-stone-200" },
};

/** Sent on `window` by the notifications page so the bell refreshes its unread count straight away. */
export const NOTIFICATIONS_CHANGED_EVENT = "txmate:notifications-changed";
