"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ConversationItem = {
  id: string;
  otherUserName: string;
  otherUserImage: string | null;
  courseName: string;
  studentMessagingEnabled: boolean;
  lastMessage: {
    body: string;
    createdAt: string;
    senderUserId: string;
  } | null;
  session: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    status: string;
  } | null;
  conversationUrl: string | null;
};

const TZ = "Africa/Lusaka";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });
const clockFmt = new Intl.DateTimeFormat("en-ZM", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const weekdayFmt = new Intl.DateTimeFormat("en-ZM", { weekday: "short", timeZone: TZ });
const shortDateFmt = new Intl.DateTimeFormat("en-ZM", { day: "numeric", month: "short", timeZone: TZ });
const longDateFmt = new Intl.DateTimeFormat("en-ZM", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const sessionFmt = new Intl.DateTimeFormat("en-ZM", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

const DAY = 24 * 60 * 60 * 1000;

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

type SessionState = { label: string; tone: string };

function sessionState(session: NonNullable<ConversationItem["session"]>, nowMs: number): SessionState {
  if (session.status.toLowerCase().includes("cancel")) return { label: "Cancelled", tone: "bg-stone-100 text-stone-500" };
  const start = toDate(session.scheduledStart)?.getTime();
  const end = toDate(session.scheduledEnd)?.getTime();
  if (start === undefined || end === undefined) return { label: session.status, tone: "bg-stone-100 text-stone-500" };
  if (nowMs >= start && nowMs <= end) return { label: "In progress", tone: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" };
  if (nowMs > end) return { label: "Completed", tone: "bg-stone-100 text-stone-500" };
  const days = Math.round((start - nowMs) / DAY);
  return { label: days <= 0 ? "Today" : days === 1 ? "Tomorrow" : "Upcoming", tone: "bg-amber-50 text-amber-800 ring-1 ring-amber-200" };
}

function sortKey(item: ConversationItem) {
  return (toDate(item.lastMessage?.createdAt) ?? toDate(item.session?.scheduledStart))?.getTime() ?? 0;
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
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className="h-12 w-12 shrink-0 rounded-full border border-[#eadfd9] object-cover" />;
  }
  return (
    <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold ${toneFor(name)}`}>
      {name.trim().charAt(0).toUpperCase() || "T"}
    </span>
  );
}

function Row({ item, nowMs }: { item: ConversationItem; nowMs: number }) {
  const state = item.session ? sessionState(item.session, nowMs) : null;
  const when = stamp(item.lastMessage?.createdAt ?? item.session?.scheduledStart, nowMs);

  const body = (
    <>
      <Avatar name={item.otherUserName} image={item.otherUserImage} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="truncate text-[15px] font-semibold text-[#282321]">{item.otherUserName}</h2>
          {when && <time className="shrink-0 text-xs tabular-nums text-[#94877e]">{when}</time>}
        </div>

        <p className={`mt-0.5 truncate text-sm ${item.lastMessage ? "text-[#6d6260]" : "italic text-[#a99d95]"}`}>
          {item.lastMessage?.body ?? "No messages yet. Say hello."}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="rounded-md bg-[#f4eceb] px-2 py-0.5 text-[11px] font-semibold text-[#7d1f2a]">{item.courseName}</span>
          {item.session && state && (
            <>
              <span className="inline-flex items-center gap-1 text-[11px] text-[#8a7f7a]">
                <CalendarIcon />
                {toDate(item.session.scheduledStart) ? sessionFmt.format(new Date(item.session.scheduledStart)) : "Session"}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${state.tone}`}>{state.label}</span>
            </>
          )}
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

  const base = "flex items-start gap-3.5 px-4 py-4 sm:gap-4 sm:px-5";

  return item.conversationUrl ? (
    <Link
      href={item.conversationUrl}
      aria-label={`Open conversation with ${item.otherUserName}, ${item.courseName}`}
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
        <div key={i} className="flex animate-pulse items-start gap-4 px-5 py-4">
          <div className="h-12 w-12 shrink-0 rounded-full bg-stone-200/70" />
          <div className="flex-1 space-y-2.5 pt-1">
            <div className="h-3.5 w-1/3 rounded bg-stone-200/70" />
            <div className="h-3 w-2/3 rounded bg-stone-200/60" />
            <div className="h-4 w-24 rounded bg-stone-200/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/student/messages", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load messages.");
      setConversations(data.conversations ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unable to load messages.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...conversations]
      .sort((a, b) => sortKey(b) - sortKey(a))
      .filter((c) => !q || [c.otherUserName, c.courseName, c.lastMessage?.body ?? ""].some((s) => s.toLowerCase().includes(q)));
  }, [conversations, query]);

  const showSearch = !loading && !error && conversations.length > 0;

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#f9f8f6] px-4 pb-10 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#282321] sm:text-3xl">Messages</h1>
            <p className="mt-1 text-sm text-[#756a63]">Chat with your Academic Mates and students about upcoming sessions.</p>
          </div>
          {!loading && !error && conversations.length > 0 && (
            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold tabular-nums text-[#7d1f2a] shadow-sm ring-1 ring-[#eadfd9]">
              {conversations.length} {conversations.length === 1 ? "chat" : "chats"}
            </span>
          )}
        </header>

        {showSearch && (
          <div className="relative mb-4">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[#94877e]"><SearchIcon /></span>
            <label htmlFor="chat-search" className="sr-only">Search conversations</label>
            <input
              id="chat-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, course or message"
              className="w-full rounded-xl border border-[#e4dbd3] bg-white py-3 pl-10 pr-4 text-base text-[#282321] outline-none transition placeholder:text-[#a99d95] focus:border-[#7d1f2a] focus:ring-4 focus:ring-[#7d1f2a]/10 sm:text-sm"
            />
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-[#eee5df] bg-white shadow-sm">
          {loading ? (
            <SkeletonRows />
          ) : error ? (
            <div role="alert" className="px-6 py-10 text-center">
              <p className="text-sm font-semibold text-red-700">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
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
                When a session is booked, a chat with your Academic Mate or student opens here.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-semibold text-[#282321]">No matches for &ldquo;{query.trim()}&rdquo;</p>
              <button type="button" onClick={() => setQuery("")} className="mt-2 text-sm font-semibold text-[#7d1f2a] underline-offset-2 hover:underline">
                Clear search
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-[#f0eae5]">
              {visible.map((item) => (
                <li key={item.id}>
                  <Row item={item} nowMs={nowMs} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}