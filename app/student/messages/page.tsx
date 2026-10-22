"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessageHits, useMessageSearch } from "./MessageHits";
import { ReadReceipt } from "./read-receipt";

type ConversationItem = {
  id: string;
  updatedAt: string;
  arrangementStatus: "PENDING" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  arrangementType: "ONE_TIME" | "RECURRING";
  sessionLabel: "NEXT" | "IN_PROGRESS" | "SESSION" | null;
  otherUserName: string;
  otherUserImage: string | null;
  courseName: string;
  studentMessagingEnabled: boolean;
  unreadCount: number;
  lastMessage: {
    body: string;
    createdAt: string;
    senderUserId: string;
    readAt?: string | null;
  } | null;
  session: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    status: string;
  } | null;
  conversationUrl: string | null;
};

type ConversationsData = {
  conversations: ConversationItem[];
  /** The signed-in user, used to tell which last messages are theirs. */
  currentUserId: string;
};

const EMPTY_DATA: ConversationsData = { conversations: [], currentUserId: "" };

const TZ = "Africa/Lusaka";
const POLL_MS = 15_000;
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });
const clockFmt = new Intl.DateTimeFormat("en-ZM", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const weekdayFmt = new Intl.DateTimeFormat("en-ZM", { weekday: "short", timeZone: TZ });
const shortDateFmt = new Intl.DateTimeFormat("en-ZM", { day: "numeric", month: "short", timeZone: TZ });
const longDateFmt = new Intl.DateTimeFormat("en-ZM", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const sessionFmt = new Intl.DateTimeFormat("en-ZM", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

const DAY = 24 * 60 * 60 * 1000;

// Shared by Row and SkeletonRows so the loading state can never drift from the real layout.
const ROW_BASE = "flex items-start gap-3 px-3.5 py-3 sm:px-4 sm:py-3.5";

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Unable to load messages.");

async function fetchConversations(signal?: AbortSignal): Promise<ConversationsData> {
  const response = await fetch("/api/student/messages", { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load messages.");
  return {
    conversations: data.conversations ?? [],
    currentUserId: typeof data.currentUserId === "string" ? data.currentUserId : "",
  };
}

function toDate(value: string | undefined | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** WhatsApp-style stamp: time today, "Yesterday", weekday this week, otherwise a date. */
function stamp(value: string | undefined | null, nowMs: number) {
  const d = toDate(value);
  if (!d) return "";
  const key = dayKeyFmt.format(d);
  if (key === dayKeyFmt.format(new Date(nowMs))) return clockFmt.format(d);
  if (key === dayKeyFmt.format(new Date(nowMs - DAY))) return "Yesterday";
  if (nowMs - d.getTime() < 6 * DAY && d.getTime() < nowMs) return weekdayFmt.format(d);
  return d.getFullYear() === new Date(nowMs).getFullYear() ? shortDateFmt.format(d) : longDateFmt.format(d);
}

type ArrangementGroup = "ACTIVE" | "COMPLETED" | "CANCELLED";

function arrangementGroup(status: ConversationItem["arrangementStatus"]): ArrangementGroup {
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";
  // PENDING and PAUSED arrangements are not ended, so keep them under Active.
  return "ACTIVE";
}

function arrangementState(status: ConversationItem["arrangementStatus"]) {
  switch (status) {
    case "PENDING": return { label: "Pending", tone: "bg-amber-50 text-amber-800 ring-1 ring-amber-200" };
    case "PAUSED": return { label: "Paused", tone: "bg-stone-100 text-stone-600" };
    case "COMPLETED": return { label: "Completed", tone: "bg-stone-100 text-stone-600" };
    case "CANCELLED": return { label: "Cancelled", tone: "bg-stone-100 text-stone-600" };
    default: return { label: "Active", tone: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" };
  }
}

function sortKey(item: ConversationItem) {
  return (toDate(item.lastMessage?.createdAt) ?? toDate(item.updatedAt) ?? toDate(item.session?.scheduledStart))?.getTime() ?? 0;
}

const AVATAR_TONES = ["bg-[#f4eceb] text-[#7d1f2a]", "bg-[#fbf1dc] text-[#8f4e00]", "bg-[#e8f0ec] text-[#2f6b4f]", "bg-[#ece9f4] text-[#4b3f87]", "bg-[#e8eef4] text-[#2f5d86]"];
function toneFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/* ---------- icons ---------- */
const iconProps = { "aria-hidden": true, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const SearchIcon = () => <svg {...iconProps} className="h-4 w-4"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
const CalendarIcon = () => <svg {...iconProps} className="h-3.5 w-3.5 shrink-0"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>;
const LockIcon = () => <svg {...iconProps} className="h-3 w-3 shrink-0"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
const ChevronIcon = () => <svg {...iconProps} className="h-4 w-4"><path d="m9 6 6 6-6 6" /></svg>;
const ChatIcon = () => <svg {...iconProps} strokeWidth={1.7} className="h-7 w-7"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>;

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return <Image src={image} alt="" width={64} height={64} unoptimized className="h-8 w-8 shrink-0 rounded-full border border-[#eadfd9] object-cover" />; // Changed from h-10 w-10
  }
  return (
    <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${toneFor(name)}`}>
      {name.trim().charAt(0).toUpperCase() || "T"}
    </span>
  );
}

function Row({ item, nowMs, currentUserId }: { item: ConversationItem; nowMs: number; currentUserId: string }) {
  const state = arrangementState(item.arrangementStatus);
  const when = stamp(item.lastMessage?.createdAt ?? item.updatedAt, nowMs);
  const unread = item.unreadCount ?? 0;
  // Ticks only appear when the latest message in the chat is the current user's own.
  const sentByMe = Boolean(currentUserId) && item.lastMessage?.senderUserId === currentUserId;
  const seen = Boolean(item.lastMessage?.readAt);

  const body = (
    <>
      <Avatar name={item.otherUserName} image={item.otherUserImage} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className={`truncate text-sm text-[#282321] ${unread > 0 ? "font-bold" : "font-semibold"}`}>{item.otherUserName}</h2>
          {when && (
            <time className={`shrink-0 text-[11px] tabular-nums ${unread > 0 ? "font-semibold text-[#7d1f2a]" : "text-[#94877e]"}`}>
              {when}
            </time>
          )}
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          {sentByMe && <ReadReceipt seen={seen} />}
          <p
            className={`min-w-0 flex-1 truncate text-xs ${
              unread > 0 ? "font-semibold text-[#282321]" : item.lastMessage ? "text-[#6d6260]" : "italic text-[#a99d95]"
            }`}
          >
            {item.lastMessage?.body ?? "No messages yet. Say hello."}
          </p>
          {unread > 0 && (
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#7d1f2a] px-1.5 text-[11px] font-semibold leading-none tabular-nums text-white">
              <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
              <span className="sr-only">
                {unread} unread {unread === 1 ? "message" : "messages"}
              </span>
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-md bg-[#f4eceb] px-1.5 py-0.5 text-[10px] font-semibold text-[#7d1f2a]">{item.courseName}</span>
          {item.session && item.sessionLabel && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#8a7f7a]">
              <CalendarIcon />
              <span>{item.sessionLabel === "NEXT" ? "Next session" : item.sessionLabel === "IN_PROGRESS" ? "In progress" : "Session"}:</span>
              {toDate(item.session.scheduledStart) ? sessionFmt.format(new Date(item.session.scheduledStart)) : "Session"}
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${state.tone}`}>{state.label}</span>
          {!item.studentMessagingEnabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
              <LockIcon /> Paused
            </span>
          )}
        </div>
      </div>

      {item.conversationUrl ? (
        <span aria-hidden="true" className="hidden shrink-0 text-[#c9bdb5] transition group-hover:translate-x-0.5 group-hover:text-[#7d1f2a] sm:block">
          <ChevronIcon />
        </span>
      ) : (
        <span className="shrink-0 text-xs text-[#94877e]">Unavailable</span>
      )}
    </>
  );

  const base = ROW_BASE;

  return item.conversationUrl ? (
    <Link
      href={item.conversationUrl}
      aria-label={`Open conversation with ${item.otherUserName}, ${item.courseName}${
        unread > 0 ? `, ${unread} unread ${unread === 1 ? "message" : "messages"}` : ""
      }${sentByMe ? (seen ? ", your last message was seen" : ", your last message was sent") : ""}`}
      className={`group ${base} transition-colors hover:bg-[#fbf8f6] active:bg-[#f6f0ec] focus-visible:bg-[#fbf8f6] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#7d1f2a]`}
    >
      {body}
    </Link>
  ) : (
    <div className={`${base} opacity-70`}>{body}</div>
  );
}

function SkeletonRows() {
  return (
    <div aria-busy="true" className="divide-y divide-[#f0eae5]">
      <p className="sr-only">Loading conversations...</p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} aria-hidden="true" className={`${ROW_BASE} animate-pulse`}>
          {/* avatar */}
          <div className="h-10 w-10 shrink-0 rounded-full bg-stone-200/70" />
          <div className="min-w-0 flex-1">
            {/* name + time */}
            <div className="flex h-[22px] items-center justify-between gap-3">
              <div className="h-4 w-2/5 rounded bg-stone-200/70" />
              <div className="h-3 w-10 rounded bg-stone-200/60" />
            </div>
            {/* last message */}
            <div className="mt-0.5 flex h-5 items-center">
              <div className="h-3.5 w-3/5 rounded bg-stone-200/60" />
            </div>
            {/* course, session, status */}
            <div className="mt-2 flex h-5 items-center gap-2">
              <div className="h-5 w-24 rounded-md bg-stone-200/60" />
              <div className="h-3 w-28 rounded bg-stone-200/50" />
              <div className="h-4 w-14 rounded-full bg-stone-200/60" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function chipClass(active: boolean) {
  return `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-xs active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 ${
    active ? "bg-[#7d1f2a] text-white" : "bg-white text-[#625954] ring-1 ring-[#e4dbd3] hover:bg-[#fbf8f6]"
  }`;
}

const STATUS_OPTIONS = [["ACTIVE", "Active"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"]] as const;

const selectClass =
  "w-36 shrink-0 truncate rounded-full border border-[#e4dbd3] bg-white py-1 pl-2.5 pr-6 text-[11px] font-semibold sm:w-44 sm:py-1.5 sm:pl-3 sm:pr-7 sm:text-xs text-[#625954] outline-none transition focus:border-[#7d1f2a] focus:ring-4 focus:ring-[#7d1f2a]/10";

export default function MessagesPage() {
  const [data, setData] = useState<ConversationsData>(EMPTY_DATA);
  const { conversations, currentUserId } = data;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [arrangementFilter, setArrangementFilter] = useState<ArrangementGroup>("ACTIVE");
  const [course, setCourse] = useState("");
  const [nowMs] = useState(() => Date.now());

  // Server-side search across every message (not just the last one in each chat).
  const { hits, searching, failed } = useMessageSearch(query);

  // Initial load. Loading starts as true and error as "", so no state is set synchronously inside the effect.
  useEffect(() => {
    const controller = new AbortController();
    fetchConversations(controller.signal)
      .then(setData)
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  // "Try again" runs from a click handler, so it can reset loading and error up front.
  function retry() {
    setLoading(true);
    setError("");
    fetchConversations()
      .then(setData)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  // Keep the unread badges and read ticks fresh: poll while the tab is visible, and refresh as soon as the person comes back to it.
  // Background refreshes are silent: no skeleton, no error banner.
  useEffect(() => {
    const controller = new AbortController();

    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      fetchConversations(controller.signal)
        .then(setData)
        .catch(() => {});
    };

    const timer = window.setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // Unique course names for the course filter.
  const courses = useMemo(
    () => Array.from(new Set(conversations.map((c) => c.courseName))).sort((a, b) => a.localeCompare(b)),
    [conversations],
  );
  // If the selected course disappears after a refresh, fall back to "All courses".
  const activeCourse = course && courses.includes(course) ? course : "";
  const unreadChats = useMemo(
    () =>
      conversations.filter(
        (c) =>
          arrangementGroup(c.arrangementStatus) === arrangementFilter &&
          (!activeCourse || c.courseName === activeCourse) &&
          (c.unreadCount ?? 0) > 0,
      ).length,
    [conversations, arrangementFilter, activeCourse],
  );
  const filtersActive = query.trim() !== "" || unreadOnly || activeCourse !== "";
  const showSearch = !loading && !error && conversations.length > 0;
  // Message search results replace the conversation list while a search (3+ characters) is active.
  const searchActive = showSearch && (hits !== null || searching);

  // Status counts follow the course and unread filters, so each number is what that status would show.
  // While searching those controls are hidden and ignored, so the counts ignore them too.
  const arrangementCounts = useMemo(() => {
    const counts: Record<ArrangementGroup, number> = { ACTIVE: 0, COMPLETED: 0, CANCELLED: 0 };
    for (const c of conversations) {
      if (!searchActive && activeCourse && c.courseName !== activeCourse) continue;
      if (!searchActive && unreadOnly && (c.unreadCount ?? 0) === 0) continue;
      counts[arrangementGroup(c.arrangementStatus)]++;
    }
    return counts;
  }, [conversations, activeCourse, unreadOnly, searchActive]);

  function clearFilters() {
    setQuery("");
    setUnreadOnly(false);
    setCourse("");
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...conversations]
      .sort((a, b) => sortKey(b) - sortKey(a))
      .filter((c) => arrangementGroup(c.arrangementStatus) === arrangementFilter)
      .filter((c) => !unreadOnly || (c.unreadCount ?? 0) > 0)
      .filter((c) => !activeCourse || c.courseName === activeCourse)
      .filter((c) => !q || [c.otherUserName, c.courseName, c.lastMessage?.body ?? ""].some((s) => s.toLowerCase().includes(q)));
  }, [conversations, query, unreadOnly, activeCourse, arrangementFilter]);

  // While searching: conversations whose person, course or last message matches in the selected arrangement-state group.
  const nameMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [...conversations]
      .sort((a, b) => sortKey(b) - sortKey(a))
      .filter((c) => arrangementGroup(c.arrangementStatus) === arrangementFilter)
      .filter((c) => [c.otherUserName, c.courseName, c.lastMessage?.body ?? ""].some((s) => s.toLowerCase().includes(q)));
  }, [conversations, query, arrangementFilter]);

  const emptyMessage = query.trim()
    ? `No matches for \u201C${query.trim()}\u201D in ${arrangementFilter.toLowerCase()} conversations`
    : unreadOnly
      ? "No unread conversations in this group"
      : arrangementFilter === "ACTIVE"
        ? "No active conversations"
        : arrangementFilter === "COMPLETED"
          ? "No completed conversations"
          : "No cancelled conversations";

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#f9f8f6] px-4 pb-10 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#282321] sm:text-3xl">Messages</h1>
            <p className="mt-1 text-sm text-[#756a63]">Chat with your students and academic mates.</p>
          </div>
          {!loading && !error && conversations.length > 0 && (
            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold tabular-nums text-[#7d1f2a] shadow-sm ring-1 ring-[#eadfd9]">
              {conversations.length} {conversations.length === 1 ? "chat" : "chats"}
            </span>
          )}
        </header>

        {showSearch && (
          <div className="mb-4 space-y-2.5 sm:space-y-3">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[#94877e]"><SearchIcon /></span>
              <label htmlFor="chat-search" className="sr-only">Search conversations</label>
              <input
                id="chat-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search names, courses or messages"
                className="w-full rounded-xl border border-[#e4dbd3] bg-white py-3 pl-10 pr-4 text-base text-[#282321] outline-none transition placeholder:text-[#a99d95] focus:border-[#7d1f2a] focus:ring-4 focus:ring-[#7d1f2a]/10 sm:text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <label htmlFor="status-filter" className="sr-only">Filter by status</label>
              <select
                id="status-filter"
                value={arrangementFilter}
                onChange={(e) => setArrangementFilter(e.target.value as ArrangementGroup)}
                className={selectClass}
              >
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label} ({arrangementCounts[value]})</option>
                ))}
              </select>

              {!searchActive && (
                <>
                  <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)} className={chipClass(!unreadOnly)}>
                    All
                  </button>
                  <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)} className={chipClass(unreadOnly)}>
                    Unread
                    {unreadChats > 0 && (
                      <span
                        className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums ${
                          unreadOnly ? "bg-white/20 text-white" : "bg-[#f4eceb] text-[#7d1f2a]"
                        }`}
                      >
                        {unreadChats}
                      </span>
                    )}
                  </button>

                  {courses.length > 1 && (
                    <>
                      <label htmlFor="course-filter" className="sr-only">Filter by course</label>
                      <select id="course-filter" value={activeCourse} onChange={(e) => setCourse(e.target.value)} className={selectClass}>
                        <option value="">All courses</option>
                        {courses.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </>
                  )}

                  {filtersActive && (
                    <button type="button" onClick={clearFilters} className="text-xs font-semibold text-[#7d1f2a] underline-offset-2 hover:underline">
                      Clear filters
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-[#eee5df] bg-white shadow-sm">
          {searchActive ? (
            <>
              {nameMatches.length > 0 && (
                <section>
                  <p className="border-b border-[#f0eae5] px-5 py-2.5 text-xs font-semibold text-[#756a63]">Conversations</p>
                  <ul className="divide-y divide-[#f0eae5]">
                    {nameMatches.map((item) => (
                      <li key={item.id}>
                        <Row item={item} nowMs={nowMs} currentUserId={currentUserId} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <div className={nameMatches.length > 0 ? "border-t border-[#f0eae5]" : undefined}>
                <MessageHits
                  hits={hits ?? []}
                  query={query}
                  conversations={conversations.filter((item) => arrangementGroup(item.arrangementStatus) === arrangementFilter)}
                  searching={searching}
                  failed={failed}
                  showEmpty={nameMatches.length === 0}
                />
              </div>
            </>
          ) : loading ? (
            <SkeletonRows />
          ) : error ? (
            <div role="alert" className="px-6 py-10 text-center">
              <p className="text-sm font-semibold text-red-700">{error}</p>
              <button
                type="button"
                onClick={retry}
                className="mt-4 rounded-lg bg-[#7d1f2a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#651822] active:scale-95"
              >
                Try again
              </button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f4eceb] text-[#7d1f2a]"><ChatIcon /></span>
              <h2 className="mt-4 font-semibold text-[#282321]">No conversations yet</h2>
              <p className="mx-auto mt-1.5 max-w-xs text-sm leading-6 text-[#756a63]">
                When a tutoring arrangement is accepted, its shared chat appears here.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-semibold text-[#282321]">{emptyMessage}</p>
              <button type="button" onClick={clearFilters} className="mt-2 text-sm font-semibold text-[#7d1f2a] underline-offset-2 hover:underline">
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-[#f0eae5]">
              {visible.map((item) => (
                <li key={item.id}>
                  <Row item={item} nowMs={nowMs} currentUserId={currentUserId} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}