"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Filter = "UPCOMING" | "COMPLETED" | "CANCELLED" | "ALL";

type RequestItem = {
  id: string;
  offering: {
    title: string | null;
    course: { code: string; name: string };
    academicMate: { name: string; image: string | null };
  };
  tutoringSession: {
    id: string;
    status: string;
    scheduledStart: string;
    scheduledEnd: string;
    meetingLocation: string;
  } | null;
  sessions?: Array<{
    id: string;
    status: string;
    scheduledStart: string;
    scheduledEnd: string;
    meetingLocation: string;
  }>;
};

type SessionItem = {
  requestId: string;
  id: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  meetingLocation: string;
  course: { code: string; name: string };
  academicMate: { name: string; image: string | null };
};

type ApiResponse = {
  requests?: RequestItem[];
  error?: string;
};

const TIME_ZONE = "Africa/Lusaka";

const DATE_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const MONTH_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  month: "short",
  timeZone: TIME_ZONE,
});

const DAY_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  day: "numeric",
  timeZone: TIME_ZONE,
});

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  weekday: "short",
  timeZone: TIME_ZONE,
});

// YYYY-MM-DD in the Lusaka time zone, used for "today / tomorrow" comparisons.
const DAY_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

// Shared by SessionCard and SkeletonCard so the loading state can never drift from the real layout.
const CARD_PAD = "p-3 sm:p-4";
const CARD_GAP = "gap-3 sm:gap-4";
const TILE_SIZE = "h-12 w-12 sm:h-14 sm:w-14";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : TIME_FORMAT.format(date);
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusClass(status: string) {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "IN_PROGRESS":
      return "bg-blue-50 text-blue-800 ring-blue-200";
    case "CANCELLED":
    case "NO_SHOW":
      return "bg-stone-100 text-stone-600 ring-stone-200";
    case "DISPUTED":
      return "bg-red-50 text-red-800 ring-red-200";
    case "SCHEDULED":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    default:
      return "bg-stone-100 text-stone-700 ring-stone-200";
  }
}

function isUpcoming(session: SessionItem, now: number) {
  const status = session.status.toUpperCase();
  const end = new Date(session.scheduledEnd).getTime();

  return (
    ["SCHEDULED", "IN_PROGRESS"].includes(status) &&
    Number.isFinite(end) &&
    end >= now
  );
}

function matchesFilter(session: SessionItem, filter: Filter, now: number) {
  const status = session.status.toUpperCase();

  switch (filter) {
    case "UPCOMING":
      return isUpcoming(session, now);
    case "COMPLETED":
      return status === "COMPLETED";
    case "CANCELLED":
      return status === "CANCELLED";
    case "ALL":
      return true;
  }
}

function dayDifference(target: Date, now: number) {
  const toUtc = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round(
    (toUtc(DAY_KEY_FORMAT.format(target)) -
      toUtc(DAY_KEY_FORMAT.format(new Date(now)))) /
      86_400_000
  );
}

/** Short, human timing hint shown on upcoming sessions. */
function timingLabel(session: SessionItem, now: number) {
  const start = new Date(session.scheduledStart);
  const end = new Date(session.scheduledEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  if (start.getTime() <= now && end.getTime() >= now) {
    return { text: "Happening now", live: true };
  }

  const minutes = Math.round((start.getTime() - now) / 60_000);
  if (minutes < 0) return null;
  if (minutes < 60) {
    return { text: `Starts in ${Math.max(minutes, 1)} min`, live: false };
  }

  const days = dayDifference(start, now);
  if (days === 0) {
    const hours = Math.round(minutes / 60);
    return { text: `Today, in ${hours} ${hours === 1 ? "hour" : "hours"}`, live: false };
  }
  if (days === 1) return { text: "Tomorrow", live: false };
  return { text: `In ${days} days`, live: false };
}

function durationLabel(startValue: string, endValue: string) {
  const minutes = Math.round(
    (new Date(endValue).getTime() - new Date(startValue).getTime()) / 60_000
  );
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function SessionCard({ session, now }: { session: SessionItem; now: number }) {
  const start = new Date(session.scheduledStart);
  const validDate = !Number.isNaN(start.getTime());
  const upcoming = isUpcoming(session, now);
  const timing = upcoming ? timingLabel(session, now) : null;
  const duration = durationLabel(session.scheduledStart, session.scheduledEnd);
  const inactive = ["CANCELLED", "NO_SHOW"].includes(session.status.toUpperCase());

  return (
    <article className={`rounded-xl border border-[#e8e0d9] bg-white ${CARD_PAD} transition-colors hover:border-[#d3c5bd]`}>
      <div className={`flex ${CARD_GAP}`}>
        <div
          title={validDate ? formatDate(session.scheduledStart) : undefined}
          className={`flex ${TILE_SIZE} shrink-0 flex-col items-center justify-center rounded-lg ${
            inactive ? "bg-stone-100 text-stone-500" : "bg-[#f7f1ee] text-[#7d1f2a]"
          }`}
        >
          {validDate ? (
            <>
              <span className="text-[11px] font-medium leading-none">
                {MONTH_FORMAT.format(start)}
              </span>
              <span className="mt-1 text-lg font-semibold leading-none tabular-nums sm:text-xl">
                {DAY_FORMAT.format(start)}
              </span>
            </>
          ) : (
            <span className="text-xs">Date</span>
          )}
        </div>

        {/* Stacked on phones (details, then a footer row); side by side from sm up. */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
          <div className="min-w-0 flex-1">
            <h2
              className={`break-words text-[15px] font-semibold leading-5 ${
                inactive ? "text-[#756b65]" : "text-[#282321]"
              }`}
            >
              {session.course.name}
              <span className="ml-2 text-xs font-medium text-[#94877e]">
                {session.course.code}
              </span>
            </h2>

            <div className="mt-1.5 flex items-center gap-2">
              {session.academicMate.image ? (
                <Image
                  src={session.academicMate.image}
                  alt="" width={64} height={64} unoptimized
                  className="h-5 w-5 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f4eceb] text-[10px] font-semibold text-[#7d1f2a]"
                >
                  {session.academicMate.name.trim().charAt(0).toUpperCase() || "A"}
                </span>
              )}
              <p className="truncate text-[13px] text-[#756b65]">
                With{" "}
                <span className="font-medium text-[#282321]">
                  {session.academicMate.name}
                </span>
              </p>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[#756b65]">
              <p className="flex items-center gap-1.5">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 shrink-0 text-[#a99d94]"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <span className="tabular-nums">
                  {validDate ? `${WEEKDAY_FORMAT.format(start)}, ` : ""}
                  {formatTime(session.scheduledStart)} to {formatTime(session.scheduledEnd)}
                  {duration ? ` (${duration})` : ""}
                </span>
              </p>

              <p className="flex min-w-0 items-center gap-1.5">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 shrink-0 text-[#a99d94]"
                >
                  <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                <span className="break-words">{session.meetingLocation}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#f3ece8] pt-2 sm:shrink-0 sm:flex-col sm:items-end sm:justify-between sm:border-t-0 sm:pt-0">
            <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              {timing && (
                <span
                  className={`truncate text-xs ${
                    timing.live ? "font-medium text-blue-700" : "text-[#94877e]"
                  }`}
                >
                  {timing.text}
                </span>
              )}
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClass(session.status)}`}
              >
                {timing?.live && (
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                )}
                {formatStatus(session.status)}
              </span>
            </div>

            <Link
              href={`/student/sessions/${encodeURIComponent(session.id)}/conversation`}
              aria-label="Open conversation"
              title="Open conversation"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e1d8d0] text-[#625954] transition hover:border-[#7d1f2a]/40 hover:bg-[#faf5f3] hover:text-[#7d1f2a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-1"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px]"
              >
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className={`flex ${CARD_GAP} rounded-xl border border-[#eee5df] bg-white ${CARD_PAD}`}>
      <div className={`${TILE_SIZE} shrink-0 animate-pulse rounded-lg bg-[#f3ece8] motion-reduce:animate-none`} />
      <div className="flex-1 space-y-3">
        <div className="h-4 w-1/2 animate-pulse rounded bg-[#f3ece8] motion-reduce:animate-none" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-[#f8f3f0] motion-reduce:animate-none" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-[#f8f3f0] motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [filter, setFilter] = useState<Filter>("UPCOMING");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    // loading starts as true and error as "", so nothing is set synchronously here.
    async function loadSessions() {
      try {
        const response = await fetch("/api/student/my-requests", {
          cache: "no-store",
          signal: controller.signal,
        });

        const body = (await response.json()) as ApiResponse;

        if (!response.ok) {
          throw new Error(body.error || "Unable to load your sessions.");
        }

        const mapped: SessionItem[] = (body.requests ?? []).flatMap((request) => {
          const occurrences = request.sessions?.length
            ? request.sessions
            : request.tutoringSession
              ? [request.tutoringSession]
              : [];

          return occurrences.map((session) => ({
            requestId: request.id,
            id: session.id,
            status: session.status,
            scheduledStart: session.scheduledStart,
            scheduledEnd: session.scheduledEnd,
            meetingLocation: session.meetingLocation,
            course: request.offering.course,
            academicMate: request.offering.academicMate,
          }));
        });

        if (!controller.signal.aborted) setSessions(mapped);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unable to load your sessions.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSessions();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(() => ({
    UPCOMING: sessions.filter((session) => isUpcoming(session, now)).length,
    COMPLETED: sessions.filter((session) => session.status.toUpperCase() === "COMPLETED").length,
    CANCELLED: sessions.filter((session) => session.status.toUpperCase() === "CANCELLED").length,
    ALL: sessions.length,
  }), [sessions, now]);

  const normalizedQuery = query.trim().toLowerCase();

  const visibleSessions = useMemo(() => {
    return sessions
      .filter((session) => matchesFilter(session, filter, now))
      .filter((session) => {
        if (!normalizedQuery) return true;
        return [session.course.code, session.course.name, session.academicMate.name]
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => {
        const first = new Date(a.scheduledStart).getTime();
        const second = new Date(b.scheduledStart).getTime();

        return filter === "UPCOMING"
          ? first - second
          : second - first;
      });
  }, [sessions, filter, now, normalizedQuery]);

  const tabs: { value: Filter; label: string }[] = [
    { value: "UPCOMING", label: "Upcoming" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
    { value: "ALL", label: "All" },
  ];

  return (
    <main className="min-h-screen bg-[#fcfbfa] px-4 py-6 text-[#282321] sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header>
          <h1 className="text-xl font-semibold tracking-tight sm:text-[28px]">
            Sessions
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#756b65] sm:mt-1.5">
            Keep track of your booked tutoring sessions.
          </p>
        </header>

        {/* Tabs from sm up; on phones the same filter is a dropdown next to the search box (below). */}
        <div
          role="tablist"
          aria-label="Filter sessions"
          className="mt-6 hidden gap-6 border-b border-[#e8e0d9] sm:flex"
        >
          {tabs.map((tab) => {
            const active = filter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.value)}
                className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 ${
                  active
                    ? "border-[#7d1f2a] text-[#7d1f2a]"
                    : "border-transparent text-[#756b65] hover:text-[#282321]"
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
                    active ? "bg-[#f4e6e3] text-[#7d1f2a]" : "bg-[#f3ece8] text-[#756b65]"
                  }`}
                >
                  {counts[tab.value]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <label htmlFor="session-search" className="sr-only">
            Search sessions by course or Academic Mate
          </label>
          <div className="relative min-w-0 flex-1">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94877e]"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id="session-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
              placeholder="Search sessions"
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-[#e1d8d0] bg-white pl-9 pr-9 text-base text-[#282321] placeholder:text-[#94877e] focus:border-[#7d1f2a] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/15 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[#94877e] hover:bg-[#f3ece8] hover:text-[#282321] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>

          <select
            aria-label="Filter sessions"
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
            className="h-10 w-32 shrink-0 rounded-lg border border-[#e1d8d0] bg-white pl-2.5 pr-1 text-xs font-medium text-[#282321] focus:border-[#7d1f2a] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/15 sm:hidden"
          >
            {tabs.map((tab) => (
              <option key={tab.value} value={tab.value}>
                {tab.label} ({counts[tab.value]})
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 font-semibold underline"
            >
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <div aria-busy="true" className="mt-4 space-y-3">
            {[1, 2, 3].map((item) => (
              <SkeletonCard key={item} />
            ))}
          </div>
        ) : !error && visibleSessions.length === 0 ? (
          <section className="mt-4 rounded-xl border border-dashed border-[#dcd1c8] bg-white px-5 py-10 text-center sm:py-12">
            <h2 className="text-sm font-semibold">
              {normalizedQuery
                ? "No sessions match your search"
                : filter === "UPCOMING"
                  ? "No upcoming sessions"
                  : filter === "COMPLETED"
                    ? "No completed sessions yet"
                    : filter === "CANCELLED"
                      ? "No cancelled sessions"
                      : "No sessions yet"}
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-[#756b65]">
              {normalizedQuery
                ? "Check the spelling, try a different course or Academic Mate, or switch to another tab."
                : filter === "UPCOMING"
                  ? "Once you book a session with an Academic Mate, the details will appear here."
                  : "Sessions in this category will remain available here for your reference."}
            </p>
            {normalizedQuery ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-4 inline-flex h-9 items-center justify-center rounded-md border border-[#7d1f2a]/30 px-3.5 text-[13px] font-semibold text-[#7d1f2a] transition hover:bg-[#f8efed] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2"
              >
                Clear search
              </button>
            ) : (
              filter === "UPCOMING" && (
                <Link
                  href="/student/find-academic-mate"
                  className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-[#7d1f2a] px-4 text-[13px] font-semibold text-white transition hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2"
                >
                  Find an Academic Mate
                </Link>
              )
            )}
          </section>
        ) : !error ? (
          <section className="mt-4 space-y-3" aria-label="Sessions">
            <p className="text-xs text-[#82776f]" aria-live="polite">
              Showing {visibleSessions.length}{" "}
              {visibleSessions.length === 1 ? "session" : "sessions"}
              {normalizedQuery ? ` matching "${query.trim()}"` : ""}
            </p>
            {visibleSessions.map((session) => (
              <SessionCard key={session.id} session={session} now={now} />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}