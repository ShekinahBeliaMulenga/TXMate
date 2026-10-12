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

/* Gentle entrance motion. Switched off for people who prefer reduced motion. */
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
function PanelHeader({ title, description, count }: { title: string; description: string; count?: number }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#eee8e2] px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[#282321]">{title}</h2>
        <p className="mt-0.5 text-[11px] leading-4 text-[#81756d] sm:text-xs">{description}</p>
      </div>
      {typeof count === "number" && <span className="text-xs font-medium tabular-nums text-[#8a7f7a]">{count}</span>}
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

  // The earliest scheduled session is marked "Next".
  let nextSessionId: string | null = null;
  let nextTime = Infinity;
  for (const session of data.upcomingSessions) {
    const time = new Date(session.scheduledStart).getTime();
    if (!Number.isNaN(time) && time < nextTime) {
      nextTime = time;
      nextSessionId = session.id;
    }
  }

  return (
    <div className="mx-auto min-w-0 max-w-[1280px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <style>{DASH_STYLES}</style>

      <header className="dash-rise flex flex-col gap-4 border-b border-[#e6ded6] pb-5 sm:flex-row sm:items-end sm:justify-between sm:pb-6">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b7c73]">Student workspace</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#282321]">Dashboard</h1>
          <p className="mt-1.5 text-sm leading-5 text-[#6d6260]">Welcome back, {student.name}. Here is your academic support activity.</p>
          <p className="mt-1 text-xs text-[#8a7f7a]">{student.university.code} · Year {student.programmeYear.yearNumber}</p>
        </div>
        <Link href="/student/find-academic-mate" className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#7d1f2a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/50 focus-visible:ring-offset-2 sm:w-auto">
          Find an Academic Mate
        </Link>
      </header>

      <section className="dash-rise mt-5" style={{ animationDelay: "60ms" }} aria-label="Academic support overview">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#e6ded6] bg-[#e9e1d9] shadow-[0_1px_2px_rgba(40,35,33,0.04)] lg:grid-cols-4">
          <Metric label="Total requests" value={summary.totalRequests} icon="requests" description="All tutoring requests" />
          <Metric label="Pending" value={summary.pendingRequests} icon="pending" description="Awaiting a response" attention={summary.pendingRequests > 0} />
          <Metric label="Completed sessions" value={summary.completedSessions} icon="completed" description="Sessions completed" />
          <Metric label="Upcoming sessions" value={summary.upcomingSessions} icon="calendar" description="Scheduled sessions" />
        </div>
      </section>

      <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[1.15fr_1fr] xl:gap-5">
        <section className="dash-rise min-w-0 overflow-hidden rounded-lg border border-[#e6ded6] bg-white shadow-[0_1px_2px_rgba(40,35,33,0.04)]" style={{ animationDelay: "120ms" }}>
          <PanelHeader title="Upcoming sessions" description="Your next scheduled tutoring sessions." count={data.upcomingSessions.length} />
          {data.upcomingSessions.length === 0 ? (
            <EmptyState title="No upcoming sessions" description="Scheduled session times and locations will appear here." action={<ActionLink href="/student/find-academic-mate">Find an Academic Mate</ActionLink>} />
          ) : (
            <div className="divide-y divide-[#eee8e2]">
              {data.upcomingSessions.map((session, index) => {
                const course = session.request.offering.course;
                const mate = session.request.offering.academicMateProfile.user;
                const day = formatDayParts(session.scheduledStart);
                return (
                  <article key={session.id} className="dash-rise flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[#fcfaf8]" style={{ animationDelay: `${200 + Math.min(index, 8) * 50}ms` }}>
                    <div aria-hidden="true" className="w-11 shrink-0 rounded-md border border-[#e6ded6] bg-[#faf7f4] py-1.5 text-center">
                      <p className="text-[9px] font-semibold uppercase leading-3 tracking-wider text-[#7d1f2a]">{day.month}</p>
                      <p className="text-base font-semibold leading-5 tabular-nums text-[#282321]">{day.day}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-[10px] font-semibold text-[#7d1f2a]">
                            {course.code}
                            {session.id === nextSessionId && <span className="rounded bg-[#f4e9ea] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">Next</span>}
                          </p>
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

        <section className="dash-rise min-w-0 overflow-hidden rounded-lg border border-[#e6ded6] bg-white shadow-[0_1px_2px_rgba(40,35,33,0.04)]" style={{ animationDelay: "180ms" }}>
          <PanelHeader title="Recent requests" description="The latest updates on your requests." count={data.recentRequests.length} />
          {cancellationError && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs leading-5 text-red-800">{cancellationError}</p>}
          {data.recentRequests.length === 0 ? (
            <EmptyState title="No requests yet" description="Browse Academic Mates and request support for one of your courses." action={<ActionLink href="/student/find-academic-mate">Browse Academic Mates</ActionLink>} />
          ) : (
            <div className="divide-y divide-[#eee8e2]">
              {data.recentRequests.map((request, index) => {
                const mate = request.offering.academicMate;
                return (
                  <article key={request.id} className="dash-rise flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[#fcfaf8]" style={{ animationDelay: `${240 + Math.min(index, 8) * 50}ms` }}>
                    {mate.image ? (
                      <img src={mate.image} alt="" className="h-8 w-8 shrink-0 rounded-full bg-[#f2e7e5] object-cover" />
                    ) : (
                      <div aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f2e7e5] text-[10px] font-semibold text-[#7d1f2a]">{initials(mate.name)}</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-[#7d1f2a]">{request.offering.course.code}</p>
                          <p className="mt-0.5 break-words text-[13px] font-medium leading-5 text-[#282321] sm:text-sm">{request.offering.course.name}</p>
                        </div>
                        <StatusBadge status={request.status} />
                      </div>
                      <p className="mt-1 text-[11px] text-[#6d6260] sm:text-xs">Academic Mate: {mate.name}</p>
                      <p className="mt-0.5 text-[10px] text-[#93867d]">Requested <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time></p>
                      {request.message && <p className="mt-1.5 hidden line-clamp-2 text-xs leading-5 text-[#756b65] sm:block">{request.message}</p>}
                      {request.tutoringSession && <p className="mt-1.5 flex items-center gap-1.5 text-[10px] leading-4 text-[#625954] sm:text-xs"><Icon name="calendar" className="h-3.5 w-3.5 shrink-0 text-[#8a7f7a]" />Session: {formatDateTime(request.tutoringSession.scheduledStart)}</p>}
                      {(request.status === "REQUESTED" || request.status === "ACCEPTED") && !request.tutoringSession && (
                        <button
                          type="button"
                          onClick={() => onCancelRequest(request.id)}
                          disabled={cancellingRequestId === request.id}
                          className="mt-2 inline-flex min-h-8 items-center rounded-md border border-[#d8cec5] px-2.5 py-1.5 text-[11px] font-semibold text-[#7d1f2a] transition hover:bg-[#f8f2f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {cancellingRequestId === request.id ? "Cancelling..." : "Cancel request"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <footer className="dash-rise mt-6 border-t border-[#e6ded6] py-4 sm:mt-8" style={{ animationDelay: "300ms" }}>
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
        <div className="border-b border-[#e6ded6] pb-6">
          <div className="h-2.5 w-28 rounded bg-[#ece5de]" />
          <div className="mt-3 h-6 w-40 rounded bg-[#ece5de]" />
          <div className="mt-3 h-3 w-64 max-w-full rounded bg-[#f1ebe5]" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#e6ded6] bg-[#e9e1d9] lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="bg-white px-4 py-3">
              <div className="h-2.5 w-20 rounded bg-[#ece5de]" />
              <div className="mt-3 h-5 w-10 rounded bg-[#ece5de]" />
              <div className="mt-3 h-2 w-24 rounded bg-[#f1ebe5]" />
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_1fr] xl:gap-5">
          {[0, 1].map((panel) => (
            <div key={panel} className="rounded-lg border border-[#e6ded6] bg-white">
              <div className="border-b border-[#eee8e2] px-4 py-3">
                <div className="h-3 w-32 rounded bg-[#ece5de]" />
                <div className="mt-2 h-2.5 w-48 rounded bg-[#f1ebe5]" />
              </div>
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex gap-3 border-b border-[#f1ebe5] px-4 py-4 last:border-b-0">
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b7c73]">Student workspace</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-[#282321]">Dashboard unavailable</h1>
          <p className="mt-2 text-sm leading-5 text-[#6d6260]">{error || "Your dashboard could not be loaded."}</p>
          <button type="button" onClick={() => setRetryCount((current) => current + 1)} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-[#7d1f2a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/50 focus-visible:ring-offset-2">Try again</button>
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