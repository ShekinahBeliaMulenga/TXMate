"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { CATEGORY_KEYS, NOTIFICATION_CATEGORIES, categoryOfType, type CategoryCounts, type NotificationCategory } from "@/lib/notification-categories";
import { NOTIFICATIONS_CHANGED_EVENT, ago, dayLabel, noticeKind, type NoticeKind, type NotificationItem } from "./notification-format";

type Item = NotificationItem;
type Selected = "all" | NotificationCategory;
type Order = "newest" | "oldest";
type ListResponse = { notifications?: Item[]; unreadCount?: number; categoryUnread?: CategoryCounts; matchCount?: number | null; nextCursor?: string | null; error?: string };

const EMPTY_COUNTS: CategoryCounts = { sessions: 0, requests: 0, messages: 0, reviews: 0, account: 0 };
const TABS: { id: Selected; label: string }[] = [{ id: "all", label: "All" }, ...CATEGORY_KEYS.map(key => ({ id: key as Selected, label: NOTIFICATION_CATEGORIES[key].label }))];

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40";
const SELECT = `rounded-md border border-[#e4dbd3] bg-white py-1 pl-2 pr-6 text-xs font-medium text-[#625954] ${FOCUS}`;

function kindIcon(kind: NoticeKind): IconName {
  return ({ attendance: "check", completion: "complete", review: "star", message: "message", request: "request", session: "calendar", general: "info" } as Record<NoticeKind, IconName>)[kind];
}

function announceChange() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export default function NotificationsCenter() {
  const router = useRouter();
  const [selected, setSelected] = useState<Selected>("all");
  const [order, setOrder] = useState<Order>("newest");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [counts, setCounts] = useState<CategoryCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const latest = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const loadMoreRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const buildUrl = useCallback((cursor: string | null) => {
    const params = new URLSearchParams({ limit: "20", order });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (selected !== "all") params.set("type", selected);
    if (cursor) params.set("cursor", cursor);
    return `/api/student/notifications?${params.toString()}`;
  }, [debouncedSearch, selected, order]);

  const applyTotals = (body: ListResponse) => {
    if (typeof body.unreadCount === "number") setUnread(body.unreadCount);
    if (body.categoryUnread) setCounts(body.categoryUnread);
  };

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(buildUrl(null), { cache: "no-store" });
      const body = await response.json() as ListResponse;
      if (id !== latest.current) return;
      if (!response.ok || !Array.isArray(body.notifications)) throw new Error(body.error || "Unable to load notifications.");
      setItems(body.notifications);
      setNextCursor(body.nextCursor ?? null);
      applyTotals(body);
    } catch (err) {
      if (id === latest.current) setError(err instanceof Error ? err.message : "Unable to load notifications.");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function loadMore() {
    if (!nextCursor || loadingMoreRef.current) return;
    const id = latest.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError("");
    try {
      const response = await fetch(buildUrl(nextCursor), { cache: "no-store" });
      const body = await response.json() as ListResponse;
      if (id !== latest.current) return;
      if (!response.ok || !Array.isArray(body.notifications)) throw new Error(body.error || "Unable to load more notifications.");
      const more = body.notifications;
      setItems(current => [...current, ...more.filter(entry => !current.some(existing => existing.id === entry.id))]);
      setNextCursor(body.nextCursor ?? null);
      applyTotals(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load more notifications.");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  useEffect(() => { loadMoreRef.current = loadMore; });

  // Loads the next page shortly before the end of the list scrolls into view. Stops while an error is showing.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor || error) return;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void loadMoreRef.current(); }, { rootMargin: "300px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCursor, error, items.length]);

  async function send(payload: Record<string, unknown>, method: "POST" | "DELETE") {
    const response = await fetch("/api/student/notifications", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json() as { error?: string };
    if (!response.ok) throw new Error(body.error || "Unable to update notifications.");
    announceChange();
  }

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  /** Keeps the numbers on the tabs right without reloading the list. */
  function countAsRead(item: Item) {
    if (item.read) return;
    setUnread(value => Math.max(0, value - 1));
    const key = categoryOfType(item.type);
    setCounts(current => ({ ...current, [key]: Math.max(0, current[key] - 1) }));
  }

  function openItem(item: Item) {
    if (!item.read) {
      countAsRead(item);
      setItems(current => current.map(entry => entry.id === item.id ? { ...entry, read: true } : entry));
      void send({ action: "READ", ids: [item.id] }, "POST").catch(() => undefined);
    }
    router.push(item.url);
  }

  /** Marks one notification read without opening it. */
  function markRead(item: Item) {
    setMenuFor(null);
    if (item.read) return;
    countAsRead(item);
    setItems(current => current.map(entry => entry.id === item.id ? { ...entry, read: true } : entry));
    void send({ action: "READ", ids: [item.id] }, "POST").catch(() => undefined);
  }

  // Closes the open "more" menu on Escape or when anything outside it is pressed.
  useEffect(() => {
    if (!menuFor) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && (event.target as HTMLElement | null)?.closest("[data-notification-menu]")) return;
      setMenuFor(null);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("mousedown", close); };
  }, [menuFor]);

  const markAllRead = () => act(async () => {
    await send({ action: "READ_ALL" }, "POST");
    await load();
  });

  const remove = (item: Item) => act(async () => {
    setMenuFor(null);
    await send({ ids: [item.id] }, "DELETE");
    countAsRead(item);
    setItems(current => current.filter(entry => entry.id !== item.id));
  });

  const clearAll = () => act(async () => {
    await send({ all: true }, "DELETE");
    setConfirmClear(false);
    await load();
  });

  const filtered = debouncedSearch !== "" || selected !== "all";
  function clearFilters() {
    setSearch(""); setDebouncedSearch(""); setSelected("all");
  }

  const grouped = items.reduce<{ label: string; items: Item[] }[]>((groups, item) => {
    const label = dayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
    return groups;
  }, []);

  const tabCount = (id: Selected) => (id === "all" ? unread : counts[id]);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-x-clip px-4 py-4 sm:px-6 sm:py-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-[#282321]">Notifications</h1>
        <p className="mt-0.5 text-[13px] text-[#756b65]">Stay updated on your sessions, requests and account activity.</p>
      </header>

      {/* Search and mark-all sit on one row; the search field takes the free space. */}
      <div className="mt-3 flex items-center gap-2">
        <div role="search" className="min-w-0 flex-1">
          <label className="relative block">
            <span className="sr-only">Search notifications</span>
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9a8e86]" />
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} placeholder="Search notifications…" className="h-9 w-full rounded-md border border-[#ddd3cc] bg-white pl-8 pr-3 text-[13px] text-[#282321] placeholder:text-[#9a8e86] focus:border-[#7d1f2a] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/20" />
          </label>
        </div>
        <button type="button" onClick={() => void markAllRead()} disabled={busy || unread === 0} aria-label="Mark all as read" className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[#7d1f2a] hover:bg-[#f8efed] disabled:cursor-not-allowed disabled:text-[#c5bbb5] disabled:hover:bg-transparent ${FOCUS}`}>
          <Icon name="check" className="h-3.5 w-3.5" /><span className="hidden min-[420px]:inline">Mark all as read</span>
        </button>
      </div>

      {/* The type filters wrap onto more lines instead of scrolling sideways. */}
      <nav aria-label="Notification types" className="mt-3">
        <ul className="flex flex-wrap gap-1">
          {TABS.map(tab => {
            const active = selected === tab.id;
            const value = tabCount(tab.id);
            return (
              <li key={tab.id}>
                <button type="button" onClick={() => setSelected(tab.id)} aria-pressed={active} className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${FOCUS} ${active ? "bg-[#7d1f2a] text-white" : "text-[#625954] hover:bg-[#f5f0ed]"}`}>
                  {tab.label}
                  {value > 0 && <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums ${active ? "bg-white/20 text-white" : "bg-[#f4eceb] text-[#7d1f2a]"}`}>{value}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[#756b65]">
          {filtered ? (
            <>
              <span>{debouncedSearch ? `Results for “${debouncedSearch}”` : "Filtered"}</span>
              <button type="button" onClick={clearFilters} className={`rounded px-1.5 py-0.5 font-medium text-[#7d1f2a] hover:bg-[#f8efed] ${FOCUS}`}>Clear filters</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmClear(value => !value)} disabled={busy || items.length === 0} className={`rounded px-1.5 py-0.5 font-medium text-[#756b65] hover:bg-[#f3e9e6] hover:text-[#7d1f2a] disabled:opacity-40 ${FOCUS}`}>Delete all</button>
          )}
        </div>
        <div>
          <label htmlFor="notification-order" className="sr-only">Sort notifications</label>
          <select id="notification-order" value={order} onChange={event => setOrder(event.target.value as Order)} className={SELECT}>
            <option value="newest">Latest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>

      {confirmClear && (
        <div role="alertdialog" aria-label="Delete all notifications" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#eee2dc] bg-[#fcf7f4] px-3 py-2">
          <div>
            <p className="text-[13px] font-medium text-[#342d29]">Delete all your notifications?</p>
            <p className="text-[11px] text-[#81766f]">This cannot be undone.</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setConfirmClear(false)} className={`h-7 rounded-md px-3 text-xs font-medium text-[#625954] hover:bg-[#f2e9e4] ${FOCUS}`}>Cancel</button>
            <button type="button" onClick={() => void clearAll()} disabled={busy} className={`h-7 rounded-md bg-[#7d1f2a] px-3 text-xs font-medium text-white hover:bg-[#681923] disabled:opacity-50 ${FOCUS}`}>Delete all</button>
          </div>
        </div>
      )}

      <div className="mt-2" aria-busy={loading}>
        {error && (
          <div role="alert" className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            {error}
            <button type="button" onClick={() => void load()} className="ml-2 font-medium underline underline-offset-2">Try again</button>
          </div>
        )}

        {loading && items.length === 0 && <p className="border-t border-[#eee8e3] px-1 py-10 text-center text-[13px] text-[#81766f]">Loading notifications…</p>}
        {!loading && !error && items.length === 0 && (
          <div className="border-t border-[#eee8e3] px-4 py-10 text-center">
            <p className="text-[13px] font-medium text-[#342d29]">{filtered ? "No notifications match" : "You're all caught up"}</p>
            <p className="mx-auto mt-0.5 max-w-xs text-xs leading-5 text-[#81766f]">{filtered ? "Try another type or a different search." : "Updates about your sessions, requests and messages will appear here."}</p>
          </div>
        )}

        {grouped.map(group => (
          <section key={group.label} aria-label={group.label} className="mt-3 first:mt-1">
            <h2 className="px-0.5 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#8b7e76]">{group.label}</h2>
            <ul className="divide-y divide-[#eee8e3] border-y border-[#eee8e3]">
              {group.items.map(item => {
                const kind = noticeKind(item);
                const menuOpen = menuFor === item.id;
                return (
                  <li key={item.id} className="relative flex items-start">
                    {!item.read && <span aria-hidden="true" className="absolute left-1 top-4 h-1.5 w-1.5 rounded-full bg-[#7d1f2a]" />}
                    <button type="button" onClick={() => openItem(item)} className={`flex min-w-0 flex-1 items-start gap-2.5 py-2.5 pl-4 pr-1 text-left hover:bg-[#faf7f5] ${FOCUS}`}>
                      <Icon name={kindIcon(kind)} className={`mt-0.5 h-4 w-4 shrink-0 ${kind === "general" ? "text-[#756b65]" : "text-[#7d1f2a]"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={`min-w-0 break-words text-[13px] leading-snug text-[#282321] ${item.read ? "font-normal" : "font-semibold"}`}>
                            {item.title}{!item.read && <span className="sr-only"> (unread)</span>}
                          </span>
                          <span className="shrink-0 pt-px text-[11px] text-[#8b7e76]">{ago(item.createdAt)}</span>
                        </span>
                        {item.body && <span className="mt-0.5 line-clamp-2 break-words text-xs leading-snug text-[#6d6260]">{item.body}</span>}
                      </span>
                    </button>
                    <div data-notification-menu className="relative shrink-0 pr-0.5 pt-1.5">
                      <button type="button" onClick={() => setMenuFor(menuOpen ? null : item.id)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`More actions: ${item.title}`} className={`flex h-8 w-8 items-center justify-center rounded-md text-[#8b7e76] hover:bg-black/5 ${FOCUS}`}>
                        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="16" cy="10" r="1.6" /></svg>
                      </button>
                      {menuOpen && (
                        <div role="menu" className="absolute right-1 top-10 z-20 w-40 overflow-hidden rounded-lg border border-[#e9e1db] bg-white py-1 shadow-[0_8px_24px_rgba(40,25,20,0.14)]">
                          {!item.read && <button role="menuitem" type="button" onClick={() => markRead(item)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#282321] hover:bg-[#f8f4f1] ${FOCUS}`}><Icon name="check" className="h-3.5 w-3.5 text-[#7d1f2a]" />Mark as read</button>}
                          <button role="menuitem" type="button" onClick={() => void remove(item)} disabled={busy} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#7d1f2a] hover:bg-[#f8f4f1] disabled:opacity-50 ${FOCUS}`}><Icon name="trash" className="h-3.5 w-3.5" />Delete</button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {nextCursor && <div ref={sentinelRef} aria-hidden={!loadingMore} className="py-3 text-center text-xs text-[#81766f]">{loadingMore ? "Loading more…" : ""}</div>}
      </div>
    </div>
  );
}