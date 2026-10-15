"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
type Course = { id?: string; code: string; name: string };
type DashboardResponse = {
  student: {
    name: string;
    status: string;
    university: { id: string; code: string; name: string };
    programme: {
      id: string;
      name: string;
      code: string;
      department: { id: string; code: string; name: string } | null;
    };
    programmeYear: { id: string; yearNumber: number };
  };
  summary: { totalRequests: number; pendingRequests: number; completedSessions: number; upcomingSessions: number };
  recentRequests: {
    id: string;
    status: string;
    message: string | null;
    requestedStart: string | null;
    requestedEnd: string | null;
    createdAt: string;
    offering: {
      title: string | null;
      rate: string;
      currency: string;
      rateType: string;
      course: Course;
      academicMate: { name: string; image: string | null };
    };
    tutoringSession: { id: string; status: string; scheduledStart: string; scheduledEnd: string } | null;
  }[];
  upcomingSessions: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    meetingLocation: string;
    status: string;
    request: {
      id: string;
      offering: {
        title: string | null;
        course: { code: string; name: string };
        academicMateProfile: { user: { name: string; image: string | null } };
      };
    };
  }[];
  error?: string;
};

/* One gentle entrance for the headline blocks. Switched off for people who prefer reduced motion. */
const DASH_STYLES = `
@keyframes dash-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.dash-rise{opacity:0;animation:dash-rise .5s cubic-bezier(.2,.8,.2,1) forwards}
@media (prefers-reduced-motion:reduce){.dash-rise{animation:none;opacity:1}}
`;

type IconName = "requests" | "pending" | "completed" | "calendar" | "location";
function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, string> = {
    requests: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    pending: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    completed: "m5 12 4 4L19 6",
    calendar: "M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z",
    location: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z M12 10h.01",
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={paths[name]} /></svg>;
}

const TIME_ZONE = "Africa/Lusaka";
const DAY_MS = 24 * 60 * 60 * 1000;
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIME_ZONE });

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZM", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE }).format(date);
}
function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZM", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(date);
}
function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZM", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(date);
}
function formatTimeRange(start: string, end: string) {
  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) return formatTime(start);
  return `${formatTime(start)} – ${formatTime(end)}`;
}
function formatWeekday(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZM", { weekday: "long", timeZone: TIME_ZONE }).format(date);
}
function formatDayParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: "–", month: "" };
  return {
    day: new Intl.DateTimeFormat("en-ZM", { day: "numeric", timeZone: TIME_ZONE }).format(date),
    month: new Intl.DateTimeFormat("en-ZM", { month: "short", timeZone: TIME_ZONE }).format(date),
  };
}
function formatStatus(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

/** "In 2 h", "Tomorrow", "In 5 days" or "In progress" for the next session. Empty when it can't be worked out. */
function relativeStart(start: string, end: string, nowMs: number) {
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return "";
  const startMs = startDate.getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isNaN(endMs) && nowMs >= startMs && nowMs <= endMs) return "In progress";
  if (nowMs > startMs) return "";
  if (dayKeyFmt.format(startDate) === dayKeyFmt.format(new Date(nowMs))) {
    const minutes = Math.max(1, Math.round((startMs - nowMs) / 60000));
    if (minutes < 60) return `In ${minutes} min`;
    return `In ${Math.round(minutes / 60)} h`;
  }
  if (dayKeyFmt.format(startDate) === dayKeyFmt.format(new Date(nowMs + DAY_MS))) return "Tomorrow";
  return `In ${Math.max(2, Math.round((startMs - nowMs) / DAY_MS))} days`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

type Tone = "good" | "warn" | "bad" | "neutral";
function statusTone(status: string): Tone {
  switch (status) {
    case "VERIFIED":
    case "ACCEPTED":
    case "COMPLETED":
    case "CONFIRMED":
      return "good";
    case "REQUESTED":
    case "PENDING":
    case "SCHEDULED":
    case "IN_PROGRESS":
      return "warn";
    case "DECLINED":
    case "CANCELLED":
    case "SUSPENDED":
    case "REJECTED":
    case "EXPIRED":
    case "DISPUTED":
    case "NO_SHOW":
      return "bad";
    default:
      return "neutral";
  }
}
const TONE_CLASSES: Record<Tone, { badge: string; dot: string }> = {
  good: { badge: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  warn: { badge: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  bad: { badge: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-500" },
  neutral: { badge: "bg-stone-100 text-stone-700 ring-stone-200", dot: "bg-stone-400" },
};
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(begin + (target - begin) * eased);
      from.current = next;
      setValue(next);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function StatusBadge({ status }: { status: string }) {
  const tone = TONE_CLASSES[statusTone(status)];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset sm:text-[11px] ${tone.badge}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {formatStatus(status)}
    </span>
  );
}

function Metric({ label, value, description, icon, attention = false }: { label: string; value: number; description: string; icon: IconName; attention?: boolean }) {
  const shown = useCountUp(value);
  return (
    <article className="min-w-0 bg-white px-3.5 py-3 sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium text-[#756b65] sm:text-xs">{label}</p>
        <Icon name={icon} className="h-4 w-4 shrink-0 text-[#b3a79f]" />
      </div>
      <p className="mt-1.5 flex items-center gap-2 text-xl font-semibold leading-none tracking-tight tabular-nums text-[#282321] sm:text-[22px]">
        {shown}
        {attention && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
      </p>
      <p className="mt-1.5 truncate text-[10px] leading-4 text-[#8a7f7a] sm:text-[11px]">{description}</p>
    </article>
  );
}

function PanelHeader({ title, description, count, href }: { title: string; description: string; count?: number; href?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#eee8e2] px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[#282321]">{title}</h2>
        <p className="mt-0.5 text-[11px] leading-4 text-[#81756d] sm:text-xs">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {typeof count === "number" && <span className="text-xs font-medium tabular-nums text-[#8a7f7a]">{count}</span>}
        {href && (
          <Link href={href} className="text-xs font-semibold text-[#7d1f2a] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">
            View all
          </Link>
        )}
      </div>
    </div>
  );
}
function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center sm:px-5">
      <p className="text-sm font-medium text-[#39322e]">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#756b65] sm:text-sm">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex min-h-10 items-center text-sm font-semibold text-[#7d1f2a] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">{children}</Link>;
}
function DashboardContent({
  data,
  cancellingRequestId,
  cancellationError,
  onCancelRequest,
}: {
  data: DashboardResponse;
  cancellingRequestId: string | null;
  cancellationError: string | null;
  onCancelRequest: (requestId: string) => void;
}) {
  const { student, summary } = data;
  const [nowMs] = useState(() => Date.now());

  // The earliest scheduled session is featured at the top.
  let nextSessionId: string | null = null;
  let nextTime = Infinity;
  for (const session of data.upcomingSessions) {
    const time = new Date(session.scheduledStart).getTime();
    if (!Number.isNaN(time) && time < nextTime) {
      nextTime = time;
      nextSessionId = session.id;
    }
  }
  const nextSession = data.upcomingSessions.find((session) => session.id === nextSessionId) ?? null;
  const laterSessions = data.upcomingSessions.filter((session) => session.id !== nextSessionId);

  const pending = summary.pendingRequests;
  const headline =
    pending > 0
      ? `${pending} ${pending === 1 ? "request is" : "requests are"} waiting for a response.`
      : "Here is your academic support activity.";

  const nextCourse = nextSession?.request.offering.course;
  const nextMate = nextSession?.request.offering.academicMateProfile.user;
  const nextDay = nextSession ? formatDayParts(nextSession.scheduledStart) : null;
  const nextRelative = nextSession ? relativeStart(nextSession.scheduledStart, nextSession.scheduledEnd, nowMs) : "";

  return (
    <div className="mx-auto min-w-0 max-w-[1280px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <style>{DASH_STYLES}</style>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[#282321] sm:text-3xl">Welcome back, {firstName(student.name)}</h1>
          <p className="mt-1.5 text-sm leading-5 text-[#6d6260]">{headline}</p>
          <p className="mt-1 text-xs text-[#8a7f7a]">{student.university.code} · Year {student.programmeYear.yearNumber}</p>
        </div>
        <Link href="/student/find-academic-mate" className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#7d1f2a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/50 focus-visible:ring-offset-2 sm:w-auto">
          Find an Academic Mate
        </Link>
      </header>

      {nextSession && nextCourse && nextMate && nextDay && (
        <section aria-label="Your next session" className="dash-rise mt-5 overflow-hidden rounded-xl bg-[#7d1f2a] text-white shadow-[0_1px_2px_rgba(40,35,33,0.12)]">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
            <div aria-hidden="true" className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-white/10 py-2.5 sm:w-[72px]">
              <span className="text-xs font-medium text-white/75">{nextDay.month}</span>
              <span className="text-3xl font-semibold leading-8 tabular-nums">{nextDay.day}</span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-white/75">
                Next session
                {nextRelative && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-white">{nextRelative}</span>}
              </p>
              <h2 className="mt-1.5 break-words text-lg font-semibold leading-6 sm:text-xl">{nextCourse.name}</h2>
              <p className="mt-0.5 text-sm text-white/80">{nextCourse.code}, with {nextMate.name}</p>
              <div className="mt-3 flex flex-col gap-1.5 text-sm text-white/90 sm:flex-row sm:flex-wrap sm:gap-x-5">
                <p className="flex min-w-0 items-start gap-1.5">
                  <Icon name="pending" className="mt-0.5 h-4 w-4 shrink-0 text-white/70" />
                  <time dateTime={nextSession.scheduledStart}>{formatWeekday(nextSession.scheduledStart)}, {formatTimeRange(nextSession.scheduledStart, nextSession.scheduledEnd)}</time>
                </p>
                <p className="flex min-w-0 items-start gap-1.5">
                  <Icon name="location" className="mt-0.5 h-4 w-4 shrink-0 text-white/70" />
                  <span className="break-words">{nextSession.meetingLocation}</span>
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2.5 sm:items-end">
              <span className="inline-flex w-fit items-center rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">{formatStatus(nextSession.status)}</span>
              <Link
                href={`/student/sessions/${encodeURIComponent(nextSession.id)}/conversation`}
                className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#7d1f2a] transition-colors hover:bg-[#f9f1f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#7d1f2a] sm:w-auto"
              >
                Open conversation
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="dash-rise mt-5" style={{ animationDelay: "60ms" }} aria-label="Academic support overview">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#e6ded6] bg-[#e9e1d9] shadow-[0_1px_2px_rgba(40,35,33,0.04)] lg:grid-cols-4">
          <Metric label="Total requests" value={summary.totalRequests} icon="requests" description="All tutoring requests" />
          <Metric label="Pending" value={summary.pendingRequests} icon="pending" description="Awaiting a response" attention={summary.pendingRequests > 0} />
          <Metric label="Completed sessions" value={summary.completedSessions} icon="completed" description="Sessions completed" />
          <Metric label="Upcoming sessions" value={summary.upcomingSessions} icon="calendar" description="Scheduled sessions" />
        </div>
      </section>

      <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[1.15fr_1fr] xl:gap-5">
        <section className="min-w-0 overflow-hidden rounded-lg border border-[#e6ded6] bg-white shadow-[0_1px_2px_rgba(40,35,33,0.04)]">
          <PanelHeader
            title="Upcoming sessions"
            description={nextSession ? "Everything scheduled after your next session." : "Your next scheduled tutoring sessions."}
            count={laterSessions.length}
          />
          {data.upcomingSessions.length === 0 ? (
            <EmptyState title="No upcoming sessions" description="Scheduled session times and locations will appear here." action={<ActionLink href="/student/find-academic-mate">Find an Academic Mate</ActionLink>} />
          ) : laterSessions.length === 0 ? (
            <EmptyState title="Nothing else scheduled" description="Your next session is shown at the top of this page." />
          ) : (
            <div className="divide-y divide-[#eee8e2]">
              {laterSessions.map((session) => {
                const course = session.request.offering.course;
                const mate = session.request.offering.academicMateProfile.user;
                const day = formatDayParts(session.scheduledStart);
                return (
                  <article key={session.id} className="flex items-start gap-3.5 px-4 py-4 transition-colors hover:bg-[#fcfaf8] sm:px-5">
                    <div aria-hidden="true" className="w-11 shrink-0 rounded-md border border-[#e6ded6] bg-[#faf7f4] py-1.5 text-center">
                      <p className="text-[10px] font-medium leading-3 text-[#7d1f2a]">{day.month}</p>
                      <p className="text-base font-semibold leading-5 tabular-nums text-[#282321]">{day.day}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-[#7d1f2a]">{course.code}</p>
                          <h3 className="mt-0.5 break-words text-[13px] font-semibold leading-5 text-[#282321] sm:text-sm">{course.name}</h3>
                          <p className="mt-0.5 text-[11px] text-[#6d6260] sm:text-xs">With {mate.name}</p>
                        </div>
                        <StatusBadge status={session.status} />
                      </div>
                      <div className="mt-2 flex flex-col gap-1 text-[11px] leading-4 text-[#625954] sm:flex-row sm:flex-wrap sm:gap-x-4 sm:text-xs">
                        <p className="flex min-w-0 items-start gap-1.5"><Icon name="pending" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9a8f89]" /><time dateTime={session.scheduledStart}>{formatTimeRange(session.scheduledStart, session.scheduledEnd)}</time></p>
                        <p className="flex min-w-0 items-start gap-1.5"><Icon name="location" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9a8f89]" /><span className="break-words">{session.meetingLocation}</span></p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border border-[#e6ded6] bg-white shadow-[0_1px_2px_rgba(40,35,33,0.04)]">
          <PanelHeader title="Recent requests" description="The latest updates on your requests." count={data.recentRequests.length} href="/student/requests" />
          {cancellationError && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs leading-5 text-red-800 sm:px-5">{cancellationError}</p>}
          {data.recentRequests.length === 0 ? (
            <EmptyState title="No requests yet" description="Browse Academic Mates and request support for one of your courses." action={<ActionLink href="/student/find-academic-mate">Browse Academic Mates</ActionLink>} />
          ) : (
            <div className="divide-y divide-[#eee8e2]">
              {data.recentRequests.map((request) => {
                const mate = request.offering.academicMate;
                const cancellable = (request.status === "REQUESTED" || request.status === "ACCEPTED") && !request.tutoringSession;
                const bookable = request.status === "ACCEPTED" && !request.tutoringSession;
                return (
                  <article key={request.id} className="flex items-start gap-3 px-4 py-4 transition-colors hover:bg-[#fcfaf8] sm:px-5">
                    {mate.image ? (
                      <img src={mate.image} alt="" className="h-9 w-9 shrink-0 rounded-full bg-[#f2e7e5] object-cover" />
                    ) : (
                      <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2e7e5] text-[11px] font-semibold text-[#7d1f2a]">{initials(mate.name)}</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-[#7d1f2a]">{request.offering.course.code}</p>
                          <p className="mt-0.5 break-words text-[13px] font-medium leading-5 text-[#282321] sm:text-sm">{request.offering.course.name}</p>
                        </div>
                        <StatusBadge status={request.status} />
                      </div>
                      <p className="mt-1 text-[11px] text-[#6d6260] sm:text-xs">
                        {mate.name}, requested <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time>
                      </p>
                      {request.message && <p className="mt-1.5 hidden line-clamp-2 text-xs leading-5 text-[#756b65] sm:block">{request.message}</p>}
                      {request.tutoringSession && <p className="mt-1.5 flex items-center gap-1.5 text-[10px] leading-4 text-[#625954] sm:text-xs"><Icon name="calendar" className="h-3.5 w-3.5 shrink-0 text-[#8a7f7a]" />Session: {formatDateTime(request.tutoringSession.scheduledStart)}</p>}
                      {cancellable && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          {bookable && (
                            <Link
                              href="/student/requests"
                              className="inline-flex min-h-8 items-center rounded-md bg-[#7d1f2a] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-1"
                            >
                              Book a session
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => onCancelRequest(request.id)}
                            disabled={cancellingRequestId === request.id}
                            className="inline-flex min-h-8 items-center rounded-md border border-[#d8cec5] px-2.5 py-1.5 text-[11px] font-semibold text-[#7d1f2a] transition hover:bg-[#f8f2f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {cancellingRequestId === request.id ? "Cancelling..." : "Cancel request"}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <footer className="mt-6 border-t border-[#e6ded6] py-4 sm:mt-8">
        <div className="flex flex-col gap-1.5 text-[11px] text-[#8a7f7a] sm:flex-row sm:items-center sm:justify-between sm:text-xs">
          <p>
            {student.programme.name}
            {student.programme.department &&
              ` · ${student.programme.department.code} ${student.programme.department.name}`}
            {` · Year ${student.programmeYear.yearNumber}`}
          </p>
          <ActionLink href="/student/profile">Manage student profile</ActionLink>
        </div>
      </footer>
    </div>
  );
}
function LoadingDashboard() {
  return (
    <main role="status" aria-live="polite" aria-busy="true" className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <p className="sr-only">Loading your dashboard...</p>
      <div className="animate-pulse motion-reduce:animate-none">
        <div>
          <div className="h-7 w-64 max-w-full rounded bg-[#ece5de]" />
          <div className="mt-3 h-3 w-56 max-w-full rounded bg-[#f1ebe5]" />
          <div className="mt-2.5 h-2.5 w-28 rounded bg-[#f1ebe5]" />
        </div>
        <div className="mt-5 h-36 rounded-xl bg-[#ece5de] sm:h-32" />
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#e6ded6] bg-[#e9e1d9] lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="bg-white px-5 py-4">
              <div className="h-7 w-10 rounded bg-[#ece5de]" />
              <div className="mt-3 h-2.5 w-24 rounded bg-[#ece5de]" />
              <div className="mt-2 h-2 w-20 rounded bg-[#f1ebe5]" />
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_1fr] xl:gap-5">
          {[0, 1].map((panel) => (
            <div key={panel} className="rounded-lg border border-[#e6ded6] bg-white">
              <div className="border-b border-[#eee8e2] px-5 py-3.5">
                <div className="h-3 w-32 rounded bg-[#ece5de]" />
                <div className="mt-2 h-2.5 w-48 rounded bg-[#f1ebe5]" />
              </div>
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex gap-3 border-b border-[#f1ebe5] px-5 py-4 last:border-b-0">
                  <div className="h-10 w-10 shrink-0 rounded-md bg-[#f1ebe5]" />
                  <div className="flex-1">
                    <div className="h-3 w-3/4 rounded bg-[#ece5de]" />
                    <div className="mt-2 h-2.5 w-1/2 rounded bg-[#f1ebe5]" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
export default function StudentDashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(null);

  async function handleCancelRequest(requestId: string) {
    const requestToCancel = data?.recentRequests.find((request) => request.id === requestId);
    if (!requestToCancel || cancellingRequestId) return;

    const confirmed = window.confirm(
      requestToCancel.status === "ACCEPTED"
        ? "Cancel this accepted request? You can no longer book a session from it."
        : "Cancel this academic support request?"
    );
    if (!confirmed) return;

    setCancellingRequestId(requestId);
    setCancellationError(null);
    try {
      const response = await fetch(`/api/student/mate-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCELLED" }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to cancel this request.");

      setData((current) => {
        if (!current) return current;
        const previous = current.recentRequests.find((request) => request.id === requestId);
        return {
          ...current,
          summary: {
            ...current.summary,
            pendingRequests: previous?.status === "REQUESTED"
              ? Math.max(0, current.summary.pendingRequests - 1)
              : current.summary.pendingRequests,
          },
          recentRequests: current.recentRequests.map((request) =>
            request.id === requestId ? { ...request, status: "CANCELLED" } : request
          ),
        };
      });
    } catch (err) {
      setCancellationError(err instanceof Error ? err.message : "Unable to cancel this request.");
    } finally {
      setCancellingRequestId(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    async function loadDashboard() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/student/dashboard", { method: "GET", headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as DashboardResponse;
        if (!response.ok) throw new Error(body.error || "Unable to load your dashboard.");
        setData(body);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load your dashboard.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadDashboard();
    return () => controller.abort();
  }, [retryCount]);
  if (loading) return <LoadingDashboard />;
  if (error || !data) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-12">
        <section className="rounded-lg border border-[#e6ded6] bg-white p-5 shadow-[0_1px_2px_rgba(40,35,33,0.04)] sm:p-6">
          <h1 className="text-xl font-semibold tracking-tight text-[#282321]">
            Dashboard unavailable
          </h1>

          <p className="mt-2 text-sm leading-5 text-[#6d6260]">
            {error || "Your dashboard could not be loaded."}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setRetryCount((current) => current + 1)}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#7d1f2a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/50 focus-visible:ring-offset-2"
            >
              Try again
            </button>

            <a
              href="/login"
              className="text-sm font-semibold text-[#7d1f2a] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/50 focus-visible:ring-offset-2"
            >
             login
            </a>
          </div>
        </section>
      </main>
    );
  }
  return (
    <DashboardContent
      data={data}
      cancellingRequestId={cancellingRequestId}
      cancellationError={cancellationError}
      onCancelRequest={(requestId) => void handleCancelRequest(requestId)}
    />
  );
}