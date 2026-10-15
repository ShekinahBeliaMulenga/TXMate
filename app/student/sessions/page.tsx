
"use client";

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

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});

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

function SessionCard({ session }: { session: SessionItem }) {
  const start = new Date(session.scheduledStart);
  const validDate = !Number.isNaN(start.getTime());

  return (
    <article className="rounded-xl border border-[#e8e0d9] bg-white p-4 transition-colors hover:border-[#d6c2bb] sm:p-5">
      <div className="flex items-start gap-3.5">
        <div className="flex h-[58px] w-[58px] shrink-0 flex-col items-center justify-center rounded-lg bg-[#f7f1ee] text-[#7d1f2a]">
          {validDate ? (
            <>
              <span className="text-[10px] font-semibold uppercase">
                {SHORT_DATE_FORMAT.format(start).split(" ")[1] ??
                  start.toLocaleDateString("en-ZM", { month: "short", timeZone: TIME_ZONE })}
              </span>
              <span className="text-2xl font-semibold leading-7 tabular-nums">
                {new Intl.DateTimeFormat("en-ZM", {
                  day: "numeric",
                  timeZone: TIME_ZONE,
                }).format(start)}
              </span>
            </>
          ) : (
            <span className="text-xs">Date</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#7d1f2a]">
                {session.course.code}
              </p>
              <h2 className="mt-1 break-words text-sm font-semibold leading-5 text-[#282321] sm:text-base">
                {session.course.name}
              </h2>
            </div>

            <span
              className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset sm:text-xs ${statusClass(session.status)}`}
            >
              {formatStatus(session.status)}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {session.academicMate.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.academicMate.image}
                alt=""
                className="h-7 w-7 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f4eceb] text-xs font-semibold text-[#7d1f2a]"
              >
                {session.academicMate.name.trim().charAt(0).toUpperCase() || "A"}
              </span>
            )}
            <p className="text-xs text-[#625954]">
              With <span className="font-medium">{session.academicMate.name}</span>
            </p>
          </div>

          <div className="mt-3 space-y-2 text-xs leading-5 text-[#625954]">
            <p className="flex items-start gap-2">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="mt-0.5 h-4 w-4 shrink-0 text-[#94877e]"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M16 3v4M8 3v4M3 10h18" />
              </svg>
              <span>
                {formatDate(session.scheduledStart)}
                <br />
                {formatTime(session.scheduledStart)} to{" "}
                {formatTime(session.scheduledEnd)}
              </span>
            </p>

            <p className="flex items-start gap-2">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="mt-0.5 h-4 w-4 shrink-0 text-[#94877e]"
              >
                <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span className="break-words">{session.meetingLocation}</span>
            </p>
          </div>

          <div className="mt-4 border-t border-[#f0eae5] pt-3">
            <Link
              href={`/student/sessions/${encodeURIComponent(session.id)}/conversation`}
              className="inline-flex min-h-9 items-center justify-center rounded-md bg-[#7d1f2a] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2"
            >
              Open conversation
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [filter, setFilter] = useState<Filter>("UPCOMING");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const controller = new AbortController();

    async function loadSessions() {
      setLoading(true);
      setError("");

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
          const session = request.tutoringSession;
          if (!session) return [];

          return [{
            requestId: request.id,
            id: session.id,
            status: session.status,
            scheduledStart: session.scheduledStart,
            scheduledEnd: session.scheduledEnd,
            meetingLocation: session.meetingLocation,
            course: request.offering.course,
            academicMate: request.offering.academicMate,
          }];
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

  const visibleSessions = useMemo(() => {
    return sessions
      .filter((session) => matchesFilter(session, filter, now))
      .sort((a, b) => {
        const first = new Date(a.scheduledStart).getTime();
        const second = new Date(b.scheduledStart).getTime();

        return filter === "UPCOMING"
          ? first - second
          : second - first;
      });
  }, [sessions, filter, now]);

  const tabs: { value: Filter; label: string }[] = [
    { value: "UPCOMING", label: "Upcoming" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
    { value: "ALL", label: "All sessions" },
  ];

  return (
    <main className="min-h-screen bg-[#fcfbfa] px-4 py-6 text-[#282321] sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Sessions
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#756b65]">
              Keep track of your booked tutoring sessions.
            </p>
          </div>
        </header>

        <section aria-label="Session counts" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              aria-pressed={filter === tab.value}
              className={`rounded-lg border p-3 text-left transition sm:p-4 ${
                filter === tab.value
                  ? "border-[#7d1f2a] bg-[#f8efed] ring-1 ring-[#7d1f2a]/10"
                  : "border-[#e8e0d9] bg-white hover:border-[#d6c2bb]"
              }`}
            >
              <span className="block text-xs text-[#756b65]">{tab.label}</span>
              <span className="mt-1 block text-xl font-semibold tabular-nums">
                {counts[tab.value]}
              </span>
            </button>
          ))}
        </section>

        <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Filter sessions">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={filter === tab.value}
              onClick={() => setFilter(tab.value)}
              className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                filter === tab.value
                  ? "bg-[#7d1f2a] text-white"
                  : "border border-[#e1d8d0] bg-white text-[#625954] hover:bg-[#f7f4f0]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
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
          <div aria-busy="true" className="mt-5 space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-44 animate-pulse rounded-xl border border-[#eee5df] bg-white" />
            ))}
          </div>
        ) : !error && visibleSessions.length === 0 ? (
          <section className="mt-5 rounded-xl border border-dashed border-[#dcd1c8] bg-white px-5 py-14 text-center">
            <h2 className="text-sm font-semibold">
              {filter === "UPCOMING"
                ? "No upcoming sessions"
                : filter === "COMPLETED"
                  ? "No completed sessions yet"
                  : filter === "CANCELLED"
                    ? "No cancelled sessions"
                    : "No sessions yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#756b65]">
              {filter === "UPCOMING"
                ? "Once you book a session with an Academic Mate, the details will appear here."
                : "Sessions in this category will remain available here for your reference."}
            </p>
            {filter === "UPCOMING" && (
              <Link
                href="/student/find-academic-mate"
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-[#7d1f2a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#681923]"
              >
                Find an Academic Mate
              </Link>
            )}
          </section>
        ) : !error ? (
          <section className="mt-5 space-y-3" aria-label="Sessions">
            <p className="text-xs text-[#82776f]" aria-live="polite">
              Showing {visibleSessions.length}{" "}
              {visibleSessions.length === 1 ? "session" : "sessions"}
            </p>
            {visibleSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
