"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

type Course = { id?: string; code: string; name: string };
type DashboardResponse = {
  student: {
    name: string;
    status: string;
    university: { id: string; code: string; name: string };
    programme: { id: string; name: string; code: string };
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

type IconName = "requests" | "pending" | "completed" | "calendar" | "arrow" | "location";

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, string> = {
    requests: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    pending: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    completed: "m5 12 4 4L19 6",
    calendar: "M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z",
    arrow: "M5 12h14M13 6l6 6-6 6",
    location: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z M12 10h.01",
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={paths[name]} /></svg>;
}

function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`animate-spin motion-reduce:animate-none ${className}`}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZM", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lusaka" }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZM", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" }).format(date);
}

function formatStatus(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function statusClasses(status: string) {
  switch (status) {
    case "VERIFIED":
    case "ACCEPTED":
    case "COMPLETED":
    case "CONFIRMED":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "REQUESTED":
    case "PENDING":
    case "SCHEDULED":
    case "IN_PROGRESS":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "DECLINED":
    case "CANCELLED":
    case "SUSPENDED":
    case "REJECTED":
    case "EXPIRED":
    case "DISPUTED":
    case "NO_SHOW":
      return "bg-red-50 text-red-800 ring-red-200";
    default:
      return "bg-stone-100 text-stone-700 ring-stone-200";
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 text-[10px] font-medium ring-1 ring-inset sm:text-[11px] ${statusClasses(status)}`}>{formatStatus(status)}</span>;
}

function Metric({ label, value, description, icon }: { label: string; value: number; description: string; icon: IconName }) {
  return (
    <article className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[#e2d9d0] bg-white p-3 sm:p-4">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-[#756b65] sm:text-xs">{label}</p>
        <p className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-[#282321] sm:text-2xl">{value}</p>
        <p className="mt-1.5 truncate text-[10px] leading-4 text-[#8a7f7a] sm:text-[11px]">{description}</p>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#f5eeec] text-[#7d1f2a] sm:h-9 sm:w-9">
        <Icon name={icon} className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
      </div>
    </article>
  );
}

function PanelHeader({ title, description, count }: { title: string; description: string; count?: number }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#eee8e2] px-3.5 py-3 sm:px-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[#282321]">{title}</h2>
        <p className="mt-0.5 text-[11px] leading-4 text-[#81756d] sm:text-xs">{description}</p>
      </div>
      {typeof count === "number" && <span className="rounded-md bg-[#f5eeec] px-2 py-1 text-[10px] font-semibold text-[#7d1f2a]">{count}</span>}
    </div>
  );
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-6 sm:px-5 sm:py-8">
      <p className="text-sm font-medium text-[#39322e]">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[#756b65] sm:text-sm">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#7d1f2a] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">{children}<Icon name="arrow" className="h-4 w-4" /></Link>;
}

function DashboardContent({ data }: { data: DashboardResponse }) {
  const { student, summary } = data;
  return (
    <div className="mx-auto min-w-0 max-w-[1440px] px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <header className="border-b border-[#e2d9d0] pb-5 sm:flex sm:items-end sm:justify-between sm:gap-5 sm:pb-6">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7c73] sm:text-xs">Student workspace</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#282321] sm:mt-2 sm:text-3xl">Dashboard</h1>
          <p className="mt-1.5 max-w-xl text-xs leading-5 text-[#6d6260] sm:mt-2 sm:text-sm sm:leading-6">Welcome back, {student.name}. Here is your academic support activity.</p>
        </div>
        <Link href="/student/find-academic-mate" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#7d1f2a] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/50 focus-visible:ring-offset-2 sm:mt-0 sm:w-auto">
          Find an Academic Mate
        </Link>

      </header>

      <section className="mt-5 sm:mt-6" aria-label="Academic support overview">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:mb-3">
          <h2 className="text-sm font-semibold text-[#39322e]">Your overview</h2>
          <span className="max-w-full truncate text-[10px] text-[#81756d] sm:text-xs">{student.university.code} · Year {student.programmeYear.yearNumber}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <Metric label="Total requests" value={summary.totalRequests} icon="requests" description="All tutoring requests" />
          <Metric label="Pending" value={summary.pendingRequests} icon="pending" description="Awaiting a response" />
          <Metric label="Completed sessions" value={summary.completedSessions} icon="completed" description="Sessions completed" />
          <Metric label="Upcoming sessions" value={summary.upcomingSessions} icon="calendar" description="Scheduled sessions" />
        </div>
      </section>

      <div className="mt-5 grid min-w-0 gap-4 xl:mt-6 xl:grid-cols-2 xl:gap-5">
        <section className="min-w-0 overflow-hidden rounded-lg border border-[#e2d9d0] bg-white">
          <PanelHeader title="Upcoming sessions" description="Your next scheduled tutoring sessions." count={data.upcomingSessions.length} />
          {data.upcomingSessions.length === 0 ? (
            <EmptyState title="No upcoming sessions" description="Scheduled session times and locations will appear here." action={<ActionLink href="/student/find-academic-mate">Find an Academic Mate</ActionLink>} />
          ) : (
            <div className="divide-y divide-[#eee8e2]">
              {data.upcomingSessions.map((session) => {
                const course = session.request.offering.course;
                const mate = session.request.offering.academicMateProfile.user;
                return (
                  <article key={session.id} className="px-3.5 py-3 transition-colors hover:bg-[#fcfaf8] sm:px-4 sm:py-3.5">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-[#7d1f2a]">{course.code}</p>
                        <h3 className="mt-0.5 break-words text-[13px] font-semibold leading-5 text-[#282321] sm:text-sm">{course.name}</h3>
                        <p className="mt-1 text-[11px] text-[#6d6260] sm:text-xs">With {mate.name}</p>
                      </div>
                      <StatusBadge status={session.status} />
                    </div>
                    <div className="mt-2.5 grid gap-1.5 border-t border-[#f0ebe5] pt-2.5 sm:grid-cols-2 sm:gap-2">
                      <p className="flex min-w-0 items-start gap-1.5 text-[11px] leading-4 text-[#625954] sm:text-xs"><Icon name="calendar" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a7f7a]" /><time dateTime={session.scheduledStart}>{formatDateTime(session.scheduledStart)}</time></p>
                      <p className="flex min-w-0 items-start gap-1.5 text-[11px] leading-4 text-[#625954] sm:text-xs"><Icon name="location" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a7f7a]" /><span className="break-words">{session.meetingLocation}</span></p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border border-[#e2d9d0] bg-white">
          <PanelHeader title="Recent requests" description="The latest updates on your requests." count={data.recentRequests.length} />
          {data.recentRequests.length === 0 ? (
            <EmptyState title="No requests yet" description="Browse Academic Mates and request support for one of your courses." action={<ActionLink href="/student/find-academic-mate">Browse Academic Mates</ActionLink>} />
          ) : (
            <div className="divide-y divide-[#eee8e2]">
              {data.recentRequests.map((request) => {
                const mate = request.offering.academicMate;
                return (
                  <article key={request.id} className="flex items-start gap-2.5 px-3.5 py-3 transition-colors hover:bg-[#fcfaf8] sm:gap-3 sm:px-4 sm:py-3.5">
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
                      <p className="mt-1 text-[10px] text-[#93867d]">Requested <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time></p>
                      {request.message && <p className="mt-1.5 hidden line-clamp-2 text-xs leading-5 text-[#756b65] sm:block">{request.message}</p>}
                      {request.tutoringSession && <p className="mt-1.5 flex items-center gap-1.5 text-[10px] leading-4 text-[#625954] sm:text-xs"><Icon name="calendar" className="h-3.5 w-3.5 shrink-0 text-[#8a7f7a]" />Session: {formatDateTime(request.tutoringSession.scheduledStart)}</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <footer className="mt-6 border-t border-[#e2d9d0] py-4 sm:mt-8 sm:py-5">
        <div className="flex flex-col gap-1.5 text-[11px] text-[#8a7f7a] sm:flex-row sm:items-center sm:justify-between sm:text-xs">
          <p>{student.programme.name} · Year {student.programmeYear.yearNumber}</p>
          <ActionLink href="/student/profile">Manage student profile</ActionLink>
        </div>
      </footer>
    </div>
  );
}

function LoadingDashboard() {
  return (
    <main role="status" aria-live="polite" className="flex min-h-[50vh] items-center justify-center px-4 py-12">
      <div className="flex items-center gap-3 text-sm text-[#6d6260]">
        <Spinner className="h-5 w-5 text-[#7d1f2a]" />
        <span>Loading your dashboard...</span>
      </div>
    </main>
  );
}

export default function StudentDashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

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
      <main className="mx-auto max-w-lg px-3 py-10 sm:px-5 sm:py-12">
        <section className="rounded-lg border border-[#e2d9d0] bg-white p-4 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7c73] sm:text-xs">Student workspace</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-[#282321]">Dashboard unavailable</h1>
          <p className="mt-2 text-sm leading-5 text-[#6d6260]">{error || "Your dashboard could not be loaded."}</p>
          <button type="button" onClick={() => setRetryCount((current) => current + 1)} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[#7d1f2a] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/50 focus-visible:ring-offset-2">Try again</button>
        </section>
      </main>
    );
  }

  return <DashboardContent data={data} />;
}
