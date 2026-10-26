
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type NotificationItem = { id: string; type: string; title: string; body: string; url: string; read: boolean; createdAt: string };
type NoticeKind = "attendance" | "session" | "message" | "completion" | "review" | "request" | "general";

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ago(value: string) {
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

function dayLabel(value: string) {
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

function noticeKind(item: NotificationItem): NoticeKind {
  const value = `${item.type} ${item.title} ${item.body}`.toLowerCase();
  if (/attend|present|absence|no.show/.test(value)) return "attendance";
  if (/complet|finished|session.confirm|confirm.session/.test(value)) return "completion";
  if (/review|rating|rated/.test(value)) return "review";
  if (/message|chat|reply/.test(value)) return "message";
  if (/request|accept|declin|mate/.test(value)) return "request";
  if (/session|schedule|reschedul|cancel|remind/.test(value)) return "session";
  return "general";
}

const KIND_STYLES: Record<NoticeKind, { label: string; icon: string; color: string }> = {
  attendance: { label: "Attendance", icon: "check", color: "bg-amber-50 text-amber-800 ring-amber-100" },
  completion: { label: "Completion", icon: "complete", color: "bg-emerald-50 text-emerald-800 ring-emerald-100" },
  review: { label: "Review", icon: "star", color: "bg-violet-50 text-violet-800 ring-violet-100" },
  message: { label: "Message", icon: "message", color: "bg-sky-50 text-sky-800 ring-sky-100" },
  request: { label: "Request", icon: "request", color: "bg-rose-50 text-rose-800 ring-rose-100" },
  session: { label: "Session", icon: "calendar", color: "bg-[#f7f0ed] text-[#7d1f2a] ring-[#eee0db]" },
  general: { label: "Update", icon: "bell", color: "bg-stone-100 text-stone-700 ring-stone-200" },
};

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const props = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      {name === "bell" && <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></>}
      {name === "check" && <><path d="M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="m8.5 12 2.3 2.3 4.7-5" /></>}
      {name === "complete" && <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>}
      {name === "star" && <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />}
      {name === "message" && <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11h8M8 14h5" /></>}
      {name === "request" && <><circle cx="9" cy="8" r="4" /><path d="M2 20v-2a7 7 0 0 1 10-6.3M17 13v8M13 17h8" /></>}
      {name === "calendar" && <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>}
      {name === "trash" && <><path d="M4 7h16M10 11v6M14 11v6" /><path d="m6 7 1 12h10l1-12M9 7V4h6v3" /></>}
      {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
      {name === "double-check" && <><path d="m2 12 4 4L16 6M9 14l3 3L22 7" /></>}
      {name === "arrow" && <path d="M5 12h14m-6-6 6 6-6 6" />}
    </svg>
  );
}

export default function NotificationBell({ className = "", align = "right" }: { className?: string; align?: "left" | "right" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const response = await fetch("/api/student/notifications?countOnly=1", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as { unreadCount?: number };
      if (typeof body.unreadCount === "number") setUnread(body.unreadCount);
    } catch { /* The next poll will retry. */ }
  }, []);

  const post = useCallback(async (payload: Record<string, unknown>, method: "POST" | "DELETE" = "POST") => {
    try {
      const response = await fetch("/api/student/notifications", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) return;
      const body = await response.json() as { unreadCount?: number };
      if (typeof body.unreadCount === "number") setUnread(body.unreadCount);
    } catch { /* Keep navigation independent of notification updates. */ }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/student/notifications?limit=20", { cache: "no-store" });
      const body = await response.json() as { notifications?: NotificationItem[]; unreadCount?: number; error?: string };
      if (!response.ok || !Array.isArray(body.notifications)) throw new Error(body.error || "Unable to load notifications.");
      setItems(body.notifications);
      if ((body.unreadCount ?? 0) > 0) void post({ action: "READ_ALL" });
      setUnread(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [post]);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === "visible") {
        void refreshCount();
      }
    };
  
    poll();
  
    const timer = window.setInterval(poll, 30_000);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("focus", poll);
  
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("focus", poll);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setConfirmClear(false); } };
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) { setOpen(false); setConfirmClear(false); }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, loadList]);

  function openItem(item: NotificationItem) {
    setItems(current => current.map(entry => entry.id === item.id ? { ...entry, read: true } : entry));
    if (!item.read) setUnread(count => Math.max(0, count - 1));
    setOpen(false);
    void post({ action: "READ", ids: [item.id] });
    router.push(item.url);
  }

  function markAll() {
    setItems(current => current.map(entry => ({ ...entry, read: true })));
    setUnread(0);
    void post({ action: "READ_ALL" });
  }

  function remove(item: NotificationItem) {
    setItems(current => current.filter(entry => entry.id !== item.id));
    if (!item.read) setUnread(count => Math.max(0, count - 1));
    void post({ ids: [item.id] }, "DELETE");
  }

  function clearAll() {
    setItems([]);
    setUnread(0);
    setConfirmClear(false);
    void post({ all: true }, "DELETE");
  }

  const grouped = items.reduce<{ label: string; items: NotificationItem[] }[]>((groups, item) => {
    const label = dayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
    return groups;
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(value => !value)} aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} aria-haspopup="dialog" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#625954] transition-colors hover:bg-[#f5f0eb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">
        <Icon name="bell" className="h-[22px] w-[22px]" />
        {unread > 0 && <span aria-hidden="true" className="absolute right-0.5 top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#7d1f2a] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className={`fixed inset-x-2 top-[4.25rem] bottom-20 z-50 flex flex-col overflow-hidden rounded-2xl border border-[#e9e1db] bg-white shadow-[0_12px_40px_rgba(40,25,20,0.16)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-12 sm:max-h-[min(75vh,620px)] sm:w-[400px] sm:rounded-xl ${align === "left" ? "sm:left-0" : "sm:right-0"}`}>
          <header className="flex shrink-0 items-center justify-between border-b border-[#eee8e2] px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-[#282321]">Notifications</h2>
                {unread > 0 && <span className="rounded-full bg-[#f7eeeb] px-2 py-0.5 text-[10px] font-semibold text-[#7d1f2a]">{unread} new</span>}
              </div>
              <p className="mt-0.5 text-xs text-[#81766f]">Your tutoring activity and updates</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={markAll} disabled={!items.some(item => !item.read)} aria-label="Mark all as read" title="Mark all as read" className="flex h-9 w-9 items-center justify-center rounded-full text-[#7d1f2a] hover:bg-[#f8efed] disabled:cursor-not-allowed disabled:text-[#c5bbb5] disabled:hover:bg-transparent"><Icon name="double-check" className="h-5 w-5" /></button>
              <button type="button" onClick={() => setConfirmClear(value => !value)} disabled={items.length === 0} aria-label="Delete all notifications" title="Delete all notifications" className="flex h-9 w-9 items-center justify-center rounded-full text-[#81766f] hover:bg-[#f5f0eb] hover:text-[#7d1f2a] disabled:cursor-not-allowed disabled:text-[#c5bbb5] disabled:hover:bg-transparent"><Icon name="trash" className="h-[17px] w-[17px]" /></button>
            </div>
          </header>

          {confirmClear && <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#eee2dc] bg-[#fcf7f4] px-4 py-3"><div><p className="text-xs font-semibold text-[#342d29]">Delete all notifications?</p><p className="mt-0.5 text-[11px] text-[#81766f]">This cannot be undone.</p></div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => setConfirmClear(false)} className="rounded-lg px-2.5 py-2 text-xs font-medium text-[#625954] hover:bg-[#f2e9e4]">Cancel</button><button type="button" onClick={clearAll} className="rounded-lg bg-[#7d1f2a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#681923]">Delete all</button></div></div>}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-busy={loading}>
            {error && <div role="alert" className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-800">{error}<button type="button" onClick={() => void loadList()} className="ml-2 font-semibold underline underline-offset-2">Retry</button></div>}
            {loading && items.length === 0 && !error && <p className="px-5 py-10 text-center text-sm text-[#81766f]">Loading notifications…</p>}
            {!loading && !error && items.length === 0 && <div className="px-6 py-12 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#f7f1ed] text-[#7d1f2a]"><Icon name="check" className="h-5 w-5" /></span><p className="mt-3 text-sm font-semibold text-[#342d29]">You&apos;re all caught up</p><p className="mx-auto mt-1 max-w-[230px] text-xs leading-5 text-[#81766f]">Important updates about your tutoring activity will appear here.</p></div>}

            {grouped.map(group => (
              <section key={group.label} aria-label={group.label}>
                <h3 className="sticky top-0 z-[1] border-b border-[#f1ece8] bg-[#faf8f6] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8b7e76]">{group.label}</h3>
                <ul>
                  {group.items.map(item => {
                    const kind = KIND_STYLES[noticeKind(item)];
                    return (
                      <li key={item.id} className={`group flex items-stretch border-b border-[#f0ebe7] last:border-0 ${item.read ? "bg-white" : "bg-[#fdf9f7]"}`}>
                        <button type="button" onClick={() => openItem(item)} className="flex min-w-0 flex-1 items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#f8f4f1] focus:outline-none focus-visible:bg-[#f8f4f1] sm:px-4">
                          <span className={`relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${kind.color}`}>
                            <Icon name={kind.icon} className="h-[18px] w-[18px]" />
                            {!item.read && <span aria-hidden="true" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#7d1f2a]" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className={`min-w-0 break-words text-[13px] leading-[1.45] text-[#282321] ${item.read ? "font-medium" : "font-semibold"}`}>{item.title}</span>
                              <span className="shrink-0 pt-0.5 text-[10px] text-[#9a8e86]">{ago(item.createdAt)}</span>
                            </span>
                            {item.body && <span className="mt-1 line-clamp-2 break-words text-xs leading-[1.55] text-[#756b65]">{item.body}</span>}
                            <span className="mt-2 flex items-center gap-1.5">
                              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${kind.color}`}>{kind.label}</span>
                              {!item.read && <span className="text-[10px] font-medium text-[#7d1f2a]">New</span>}
                              <Icon name="arrow" className="ml-auto h-3.5 w-3.5 text-[#b3a7a1] transition-transform group-hover:translate-x-0.5 group-hover:text-[#7d1f2a]" />
                            </span>
                          </span>
                        </button>
                        <button type="button" onClick={() => remove(item)} aria-label={`Delete notification: ${item.title}`} title="Delete notification" className="mr-1 mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#a79b94] hover:bg-[#f3e9e6] hover:text-[#7d1f2a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"><Icon name="close" className="h-4 w-4" /></button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
