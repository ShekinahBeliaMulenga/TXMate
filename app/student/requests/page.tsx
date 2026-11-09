"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import SessionBookingDialog from "@/components/student/session-booking-dialog";
import { Icon } from "@/components/ui/icon";
import { dayRangeFilter } from "@/lib/admin/date-range";

type RequestStatus = "REQUESTED" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
type StatusFilter = "ALL" | RequestStatus;
type SortOrder = "NEWEST" | "OLDEST";
type RequestItem = {
  id: string; status: RequestStatus; message: string | null; createdAt: string; respondedAt: string | null;
  requestedStart: string | null; requestedEnd: string | null; arrangementType: "ONE_TIME" | "RECURRING"; arrangementStatus: string;
  recurrenceEveryWeeks: number | null; recurrenceWeekday: string | null; recurrenceLocalStartMinute: number | null;
  recurrenceTimezone: string | null; recurrenceEndsAt: string | null;
  offering: {
    id: string; title: string | null; description: string | null; rate: string; currency: string; rateType: string; sessionDurationMinutes: number;
    course: { id: string; code: string; name: string };
    academicMate: { id: string; name: string; image: string | null; status: "ACTIVE" | "INACTIVE" | "SUSPENDED"; verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"; profileVisibility: "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE" };
  };
  tutoringSession: { id: string; status: string; scheduledStart: string; scheduledEnd: string; meetingLocation: string } | null;
};
type ApiBody = { requests?: RequestItem[]; message?: string; error?: string; arrangement?: { id: string; status: string } };

const PAGE_SIZE = 10;
const DEFAULT_TZ = "Africa/Lusaka";
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" }, { value: "REQUESTED", label: "Pending" }, { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" }, { value: "CANCELLED", label: "Cancelled" }, { value: "EXPIRED", label: "Expired" },
];
const RED = "bg-red-50 text-red-800 ring-red-200";
const STATUS_CLASSES: Record<string, string> = { ACCEPTED: "bg-emerald-50 text-emerald-800 ring-emerald-200", REQUESTED: "bg-amber-50 text-amber-800 ring-amber-200", DECLINED: RED, CANCELLED: RED, EXPIRED: RED };
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40";
const BTN_OUTLINE = `rounded-md border border-[#d8cec5] px-3 py-1.5 text-xs font-medium text-[#625954] hover:bg-[#f7f4f0] disabled:opacity-50 ${FOCUS}`;
const BTN_PRIMARY = `rounded-md bg-[#7d1f2a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#681923] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const BTN_SM = `inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium ${FOCUS}`;

const formatStatus = (status: string) => status === "REQUESTED" ? "Pending" : status.toLowerCase().split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
// Intl formatters are expensive to build, so they are cached per time zone.
const formatterCache = new Map<string, Intl.DateTimeFormat>();
function getFormatter(timeZone: string, withTime: boolean): Intl.DateTimeFormat {
  const key = `${timeZone}|${withTime ? 1 : 0}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) };
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat("en-ZM", { ...options, timeZone }); }
  catch {
    // An invalid time zone string from the API must never crash the page.
    try { formatter = new Intl.DateTimeFormat("en-ZM", { ...options, timeZone: DEFAULT_TZ }); } catch { formatter = new Intl.DateTimeFormat("en-ZM", options); }
  }
  formatterCache.set(key, formatter);
  return formatter;
}
function formatWhen(value: string | null, withTime: boolean, timeZone: string) {
  if (!value) return "Not specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return getFormatter(timeZone || DEFAULT_TZ, withTime).format(date);
}
const formatDate = (value: string | null, timeZone: string = DEFAULT_TZ) => formatWhen(value, false, timeZone);
const formatDateTime = (value: string | null, timeZone: string = DEFAULT_TZ) => formatWhen(value, true, timeZone);
const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AM";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};
const timestamp = (value: string) => Date.parse(value) || 0;
const zoneOf = (item: RequestItem) => item.recurrenceTimezone || DEFAULT_TZ;
const canCancel = (item: RequestItem) => (item.status === "REQUESTED" || item.status === "ACCEPTED") && !item.tutoringSession;
const errorMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

/** One line saying what is happening with the request right now. */
function statusHint(item: RequestItem) {
  const session = item.tutoringSession;
  if (session) return `Session ${formatDateTime(session.scheduledStart, zoneOf(item))} · ${formatStatus(session.status)}`;
  if (item.status === "REQUESTED") return "Waiting for the Academic Mate to respond";
  if (item.status === "ACCEPTED") return "Accepted · ready to book a session";
  if (item.status === "DECLINED") return item.respondedAt ? `Declined on ${formatDate(item.respondedAt)}` : "Declined";
  return "No session booked";
}

function arrangementLabel(item: RequestItem, compact = false) {
  if (item.arrangementType !== "RECURRING") return compact ? "One-time" : "One-time session";
  const weeks = item.recurrenceEveryWeeks ?? 1;
  const every = `every ${weeks} week${weeks === 1 ? "" : "s"}`;
  return compact ? `Recurring · ${every}` : `Recurring ${every}`;
}

function getDetailRows(r: RequestItem): [string, string][] {
  const tz = zoneOf(r);
  const rows: [string, string][] = [["Academic Mate", r.offering.academicMate.name], ["Arrangement", arrangementLabel(r)]];
  if (r.recurrenceTimezone) rows.push(["Schedule timezone", r.recurrenceTimezone]);
  if (r.recurrenceEndsAt) rows.push(["Recurring until", formatDate(r.recurrenceEndsAt, tz)]);
  rows.push(["Date requested", formatDateTime(r.createdAt)]);
  if (r.respondedAt) rows.push(["Response date", formatDateTime(r.respondedAt)]);
  if (r.requestedStart || r.requestedEnd) rows.push(["Requested time", [r.requestedStart, r.requestedEnd].filter(Boolean).map((v) => formatDateTime(v, tz)).join(" to ")]);
  if (r.tutoringSession) rows.push(["Booked session", `${formatDateTime(r.tutoringSession.scheduledStart, tz)} to ${formatDateTime(r.tutoringSession.scheduledEnd, tz)}`]);
  return rows;
}

/** JSON request helper: always parses safely and throws `body.error` (or the fallback) on failure. */
async function api(url: string, fallback: string, init: RequestInit = {}): Promise<ApiBody> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  const body: ApiBody = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}

// Tells the sidebar to clear its green "newly accepted" badge (same event name as use-accepted-requests.ts).
async function markAcceptedRequestsSeen() {
  try {
    await api("/api/student/my-requests/seen", "", { method: "POST" });
    window.dispatchEvent(new Event("txmate:accepted-requests-seen"));
  } catch { /* The badge will clear the next time the page is opened. */ }
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_CLASSES[status] ?? "bg-stone-100 text-stone-700 ring-stone-200"}`}>{formatStatus(status)}</span>;
}

function Avatar({ name, src, className }: { name: string; src: string | null; className: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <Image src={src} alt="" width={64} height={64} unoptimized onError={() => setFailed(true)} className={`${className} shrink-0 rounded-full object-cover`} />;
  return <span aria-hidden="true" className={`${className} flex shrink-0 items-center justify-center rounded-full bg-[#f2e7e5] font-semibold text-[#7d1f2a]`}>{initials(name)}</span>;
}

function AcademicMateProfileAvatar({ item, className }: { item: RequestItem; className: string }) {
  const mate = item.offering.academicMate;
  const avatar = <Avatar name={mate.name} src={mate.image} className={className} />;
  const canView = (item.status === "REQUESTED" || item.status === "ACCEPTED") && mate.status === "ACTIVE" && mate.verificationStatus === "VERIFIED" && mate.profileVisibility !== "PRIVATE";
  return canView
    ? <Link href={`/student/academic-mate/${encodeURIComponent(mate.id)}`} aria-label={`View ${mate.name}'s profile`} title="View Academic Mate profile" className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-[#7d1f2a]">{avatar}</Link>
    : avatar;
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function Modal({ id, width, onClose, children }: { id: string; width: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  // Always call the latest onClose without re-subscribing the key listener on every render.
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable.length) { e.preventDefault(); root.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1], active = document.activeElement;
      if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; previouslyFocused?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className={`my-auto w-full ${width} rounded-lg border border-[#e2d9d0] bg-white p-4 shadow-xl outline-none sm:p-5`}>{children}</section>
    </div>
  );
}

function CancelDialog({ id, title, busy, keepLabel, error, onKeep, onConfirm, children }: { id: string; title: string; busy: boolean; keepLabel: string; error: string; onKeep: () => void; onConfirm: () => void; children: ReactNode }) {
  return (
    <Modal id={id} width="max-w-md" onClose={() => !busy && onKeep()}>
      <h2 id={id} className="text-base font-semibold">{title}</h2>
      {children}
      {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onKeep} className={BTN_OUTLINE}>{keepLabel}</button>
        <button type="button" disabled={busy} onClick={onConfirm} className={BTN_PRIMARY}>{busy ? "Cancelling..." : "Confirm cancellation"}</button>
      </div>
    </Modal>
  );
}

type Handlers = { onDetails: (item: RequestItem) => void; onBook: (item: RequestItem) => void; onCancelSession: (item: RequestItem) => void; onCancelRequest: (item: RequestItem) => void };

function RequestActions({ item, onDetails, onBook, onCancelSession, onCancelRequest }: Handlers & { item: RequestItem }) {
  const session = item.tutoringSession;
  const canCancelSession = session !== null && session.status === "SCHEDULED" && Date.parse(session.scheduledStart) > Date.now(); // eslint-disable-line react-hooks/purity
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => onDetails(item)} className={`${BTN_SM} border border-[#d8cec5] text-[#625954] hover:bg-[#f7f4f0]`}>Details</button>
      {item.status === "ACCEPTED" && !session && <button type="button" onClick={() => onBook(item)} className={`${BTN_SM} bg-[#7d1f2a] font-semibold text-white hover:bg-[#681923]`}>Book session</button>}
      {session && <Link href={`/student/sessions/${encodeURIComponent(session.id)}/conversation`} aria-label="Open conversation" title="Open conversation" className={`${BTN_SM} w-8 border border-[#d8cec5] px-0 text-[#7d1f2a] hover:bg-[#f7f4f0]`}><Icon name="message" className="h-4 w-4" /></Link>}
      {canCancelSession && <button type="button" onClick={() => onCancelSession(item)} className={`${BTN_SM} text-red-700 hover:bg-red-50`}>Cancel session</button>}
      {canCancel(item) && <button type="button" onClick={() => onCancelRequest(item)} className={`${BTN_SM} text-[#8b3335] hover:bg-red-50`}>Cancel</button>}
    </div>
  );
}

/** One request, as a compact row on every screen size. */
function RequestRow({ item, ...handlers }: Handlers & { item: RequestItem }) {
  const { course, academicMate } = item.offering;
  const session = item.tutoringSession;
  return (
    <li className="flex flex-col gap-2.5 px-4 py-3.5 md:flex-row md:items-center md:justify-between md:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <AcademicMateProfileAvatar item={item} className="h-11 w-11 text-xs" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="min-w-0 wrap-break-word text-sm"><span className="font-semibold text-[#7d1f2a]">{course.code}</span> <span className="text-[#282321]">{course.name}</span></p>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-0.5 text-xs text-[#756b65]">{academicMate.name} · {arrangementLabel(item, true)} · Requested {formatDate(item.createdAt)}</p>
          <p className="mt-0.5 text-xs text-[#8a7f7a]">{statusHint(item)}</p>
          {item.message?.trim() && <p className="mt-0.5 line-clamp-1 wrap-break-word text-xs italic text-[#8a7f7a]">“{item.message.trim()}”</p>}
        </div>
      </div>
      <div className="shrink-0 pl-14 md:pl-0"><RequestActions item={item} {...handlers} /></div>
    </li>
  );
}

export default function StudentRequestsPage() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [sortOrder, setSortOrder] = useState<SortOrder>("NEWEST");
  const [page, setPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RequestItem | null>(null);
  const [bookingTarget, setBookingTarget] = useState<RequestItem | null>(null);
  const [cancelSessionTarget, setCancelSessionTarget] = useState<RequestItem | null>(null);
  const [cancelSessionReason, setCancelSessionReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Only the most recent load may update state, so overlapping loads can never apply stale data.
  const loadRequests = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setLoading(true);
      setPageError("");
      const body = await api("/api/student/my-requests", "Unable to load your requests.", { signal: controller.signal });
      if (controller.signal.aborted) return;
      setRequests(Array.isArray(body.requests) ? body.requests : []);
      setLoaded(true);
      void markAcceptedRequestsSeen();
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
      setPageError(errorMessage(error, "Unable to load your requests."));
    } finally {
      if (abortRef.current === controller && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests(); // eslint-disable-line react-hooks/set-state-in-effect
    return () => abortRef.current?.abort();
  }, [loadRequests]);

  const counts = useMemo(() => {
    const values: Record<StatusFilter, number> = { ALL: requests.length, REQUESTED: 0, ACCEPTED: 0, DECLINED: 0, CANCELLED: 0, EXPIRED: 0 };
    for (const item of requests) if (item.status in values) values[item.status] += 1;
    return values;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const search = query.trim().toLowerCase();
    const direction = sortOrder === "NEWEST" ? -1 : 1;
    const range = dayRangeFilter(from, to);
    return requests
      .filter((item) => {
        if (status !== "ALL" && item.status !== status) return false;
        const sent = timestamp(item.createdAt);
        if (range?.gte && sent < range.gte.getTime()) return false;
        if (range?.lt && sent >= range.lt.getTime()) return false;
        if (!search) return true;
        const { course, title, academicMate } = item.offering;
        return [course.code, course.name, title ?? "", academicMate.name, item.message ?? ""].join(" ").toLowerCase().includes(search);
      })
      .sort((a, b) => direction * (timestamp(a.createdAt) - timestamp(b.createdAt)));
  }, [requests, query, status, sortOrder, from, to]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRequests = filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const dateActive = from !== "" || to !== "";
  const filtersActive = query.trim() !== "" || status !== "ALL" || dateActive;
  const clearFilters = () => { setQuery(""); setStatus("ALL"); setFrom(""); setTo(""); setShowDate(false); setPage(1); };

  /** Runs a cancel call with shared busy/notice/error handling. */
  async function runCancel(url: string, init: RequestInit, fallback: string, onSuccess: (body: ApiBody) => void, successNotice: string) {
    if (cancelling) return;
    setCancelling(true);
    setActionError("");
    setNotice("");
    try {
      const body = await api(url, fallback, init);
      onSuccess(body);
      setNotice(body.message || successNotice);
    } catch (error) {
      setActionError(errorMessage(error, fallback));
    } finally {
      setCancelling(false);
    }
  }

  const handleCancel = () => {
    const target = cancelTarget;
    if (!target) return;
    return runCancel(`/api/student/mate-requests/${encodeURIComponent(target.id)}`, { method: "PATCH", body: JSON.stringify({ action: "CANCELLED" }) }, "Unable to cancel this request.", () => {
      setRequests((cur) => cur.map((r) => (r.id === target.id ? { ...r, status: "CANCELLED" } : r)));
      setCancelTarget(null);
      setSelectedRequest(null);
    }, "Your request has been cancelled.");
  };

  const handleCancelSession = () => {
    const target = cancelSessionTarget;
    const session = target?.tutoringSession;
    if (!target || !session) return;
    return runCancel(`/api/student/sessions/${encodeURIComponent(session.id)}/cancel`, { method: "POST", body: JSON.stringify({ reason: cancelSessionReason.trim() }) }, "Unable to cancel this session.", (body) => {
      const arrangementCancelled = body.arrangement?.status === "CANCELLED";
      setRequests((cur) => cur.map((r) => r.id !== target.id ? r : {
        ...r,
        ...(arrangementCancelled ? { status: "CANCELLED" as const } : {}),
        ...(r.tutoringSession ? { tutoringSession: { ...r.tutoringSession, status: "CANCELLED" } } : {}),
      }));
      setCancelSessionTarget(null);
      setCancelSessionReason("");
    }, "Session cancelled successfully.");
  };

  const handlers: Handlers = {
    onDetails: (item) => setSelectedRequest(item),
    onBook: (item) => { setSelectedRequest(null); setBookingTarget(item); },
    onCancelSession: (item) => { setActionError(""); setCancelSessionReason(""); setCancelSessionTarget(item); },
    onCancelRequest: (item) => { setActionError(""); setCancelTarget(item); setSelectedRequest(null); },
  };
  const closeCancelRequest = () => { setCancelTarget(null); setActionError(""); };
  const closeCancelSession = () => { setCancelSessionTarget(null); setActionError(""); };

  const refreshing = loading && loaded;
  const firstRecord = filteredRequests.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastRecord = Math.min(currentPage * PAGE_SIZE, filteredRequests.length);
  const pageButton = `min-h-8 rounded-md border border-[#d8cec5] px-3 py-1 text-xs font-medium disabled:opacity-40 ${FOCUS}`;

  let body: ReactNode;
  if (!loaded && loading) body = <div role="status" className="px-4 py-10 text-center text-[13px] text-[#6d6260]">Loading requests...</div>;
  else if (!loaded) body = null;
  else if (requests.length === 0) {
    body = (
      <div className="px-4 py-12 text-center">
        <h2 className="text-[13px] font-semibold">You have no requests yet</h2>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-[#6d6260]">When you ask an Academic Mate for help, your request and their response will show up here.</p>
        <Link href="/student/find-academic-mate" className={`mt-3 inline-flex min-h-8 items-center rounded-md bg-[#7d1f2a] px-3 text-xs font-semibold text-white hover:bg-[#681923] ${FOCUS}`}>Find an Academic Mate</Link>
      </div>
    );
  }
  else if (filteredRequests.length === 0) {
    body = (
      <div className="px-4 py-10 text-center">
        <h2 className="text-[13px] font-semibold">No matching requests</h2>
        <p className="mt-1 text-xs text-[#6d6260]">Try another search term or status.</p>
        <button type="button" onClick={clearFilters} className="mt-2 text-xs font-semibold text-[#7d1f2a] hover:underline">Clear filters</button>
      </div>
    );
  } else {
    body = (
      <>
        <ul className="divide-y divide-[#eee8e2]">{visibleRequests.map((item) => <RequestRow key={item.id} item={item} {...handlers} />)}</ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e2d9d0] bg-[#fcfbf9] px-3.5 py-2 sm:px-4">
          <p className="text-xs text-[#7a6f6a]" aria-live="polite">{refreshing ? "Updating..." : `Showing ${firstRecord}–${lastRecord} of ${filteredRequests.length}`}</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className={pageButton}>Previous</button>
            <span className="text-xs tabular-nums text-[#6d6260]">{currentPage} / {totalPages}</span>
            <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className={pageButton}>Next</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f1ed] px-4 py-4 text-[#282321] sm:px-6 sm:py-6">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#282321] sm:text-3xl">My Requests</h1>
            <p className="mt-0.5 text-[13px] text-[#756b65]">Track responses and manage your Academic Mate requests.</p>
          </div>
        </header>

        {pageError && (
          <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-[13px] text-red-800">{pageError}</p>
            <button type="button" onClick={() => void loadRequests()} className="text-xs font-semibold text-red-800 underline underline-offset-2">Try again</button>
          </div>
        )}
        {notice && (
          <div role="status" className="mt-3 flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")} className={`rounded px-1.5 py-0.5 text-xs font-semibold hover:bg-emerald-100 ${FOCUS}`}>Dismiss</button>
          </div>
        )}

        {requests.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative block min-w-0 flex-1 basis-48 sm:max-w-xs">
                <span className="sr-only">Search requests</span>
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8e86]" />
                <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search mate, course or message" className="h-10 w-full rounded-lg border border-[#ddd3cc] bg-white pl-9 pr-3 text-sm placeholder:text-[#a39a94] focus:border-[#7d1f2a] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/20" />
              </label>
              <button type="button" onClick={() => setShowDate((v) => !v)} aria-expanded={showDate} className={`inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#ddd3cc] bg-white px-3 text-xs font-medium text-[#625954] hover:bg-[#fbf8f6] ${FOCUS}`}>
                Filters{dateActive && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#7d1f2a]" />}<span className="sr-only">{dateActive ? " (date filter on)" : " (date)"}</span>
                <Icon name="chevronRight" className={`h-3.5 w-3.5 transition-transform ${showDate ? "-rotate-90" : "rotate-90"}`} />
              </button>
              <label htmlFor="request-sort" className="sr-only">Sort requests</label>
              <select id="request-sort" value={sortOrder} onChange={(e) => { setSortOrder(e.target.value as SortOrder); setPage(1); }} className={`ml-auto h-10 shrink-0 rounded-lg border border-[#ddd3cc] bg-white pl-3 pr-7 text-xs font-medium text-[#625954] ${FOCUS}`}>
                <option value="NEWEST">Latest first</option>
                <option value="OLDEST">Oldest first</option>
              </select>
            </div>
            {showDate && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[#e9e1db] bg-white p-2.5">
                <label className="block text-xs font-medium text-[#625954]">Requested from<input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-[#ddd3cc] px-2.5 text-sm font-normal text-[#282321] focus:border-[#7d1f2a] focus:outline-none" /></label>
                <label className="block text-xs font-medium text-[#625954]">To<input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-[#ddd3cc] px-2.5 text-sm font-normal text-[#282321] focus:border-[#7d1f2a] focus:outline-none" /></label>
                {dateActive && <button type="button" onClick={() => { setFrom(""); setTo(""); setPage(1); }} className={`h-9 rounded-lg px-2.5 text-xs font-semibold text-[#7d1f2a] hover:bg-[#f8efed] ${FOCUS}`}>Clear dates</button>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2" role="group" aria-label="Filter by request status">
              {FILTERS.map(({ value, label }) => {
                const active = status === value;
                return (
                  <button key={value} type="button" aria-pressed={active} onClick={() => { setStatus(value); setPage(1); }} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-xs active:scale-95 ${FOCUS} ${active ? "bg-[#7d1f2a] text-white" : "bg-white text-[#625954] ring-1 ring-[#e4dbd3] hover:bg-[#fbf8f6]"}`}>
                    {label}
                    {counts[value] > 0 && <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums ${active ? "bg-white/20 text-white" : "bg-[#f4eceb] text-[#7d1f2a]"}`}>{counts[value]}</span>}
                  </button>
                );
              })}
              {filtersActive && <button type="button" onClick={clearFilters} className={`ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#7d1f2a] hover:bg-[#f8efed] ${FOCUS}`}>Clear filters</button>}
            </div>
          </div>
        )}

        {body !== null && (
          <section className={`mt-3 overflow-hidden rounded-xl border border-[#e2d9d0] bg-white transition-opacity ${refreshing ? "pointer-events-none opacity-60" : ""}`} aria-label="Your requests" aria-busy={loading}>{body}</section>
        )}
      </div>

      {selectedRequest && (
        <Modal id="request-details-title" width="max-w-lg" onClose={() => setSelectedRequest(null)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="request-details-title" className="text-base font-semibold">Request details</h2>
              <p className="mt-0.5 wrap-break-word text-xs text-[#6d6260]">{selectedRequest.offering.course.code} · {selectedRequest.offering.course.name}</p>
            </div>
            <StatusBadge status={selectedRequest.status} />
          </div>
          <dl className="mt-3 divide-y divide-[#eee8e2] border-y border-[#eee8e2]">
            {getDetailRows(selectedRequest).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2">
                <dt className="shrink-0 text-xs text-[#7a6f6a]">{label}</dt>
                <dd className="wrap-break-word text-right text-xs font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3">
            <p className="text-xs font-semibold text-[#625954]">Your message</p>
            <p className="mt-1 whitespace-pre-wrap wrap-break-word text-[13px] leading-5 text-[#4d4541]">{selectedRequest.message?.trim() || "No message was included with this request."}</p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {canCancel(selectedRequest) && <button type="button" onClick={() => handlers.onCancelRequest(selectedRequest)} className={`rounded-md px-3 py-1.5 text-xs font-medium text-[#8b3335] hover:bg-red-50 ${FOCUS}`}>Cancel request</button>}
            <button type="button" onClick={() => setSelectedRequest(null)} className={BTN_OUTLINE}>Close</button>
          </div>
        </Modal>
      )}

      {bookingTarget && (
        <SessionBookingDialog
          requestId={bookingTarget.id}
          courseLabel={`${bookingTarget.offering.course.code} · ${bookingTarget.offering.course.name}`}
          onClose={() => setBookingTarget(null)}
          onBooked={async () => { await loadRequests(); setNotice("Session booked successfully."); }}
        />
      )}

      {cancelTarget && (
        <CancelDialog id="cancel-request-title" title="Cancel this request?" busy={cancelling} keepLabel="Keep request" error={actionError} onKeep={closeCancelRequest} onConfirm={() => void handleCancel()}>
          <p className="mt-1.5 text-xs leading-5 text-[#625954]">
            You are cancelling your request for <strong>{cancelTarget.offering.course.code}</strong> with <strong>{cancelTarget.offering.academicMate.name}</strong>. The Academic Mate will be notified, and this request will remain in your history as Cancelled.
          </p>
          {cancelTarget.status === "ACCEPTED" && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">This request has already been accepted. Cancelling it will end the request before a session is booked.</p>}
        </CancelDialog>
      )}

      {cancelSessionTarget?.tutoringSession && (
        <CancelDialog id="cancel-session-title" title="Cancel booked session?" busy={cancelling} keepLabel="Keep session" error={actionError} onKeep={closeCancelSession} onConfirm={() => void handleCancelSession()}>
          <p className="mt-2 text-[13px] leading-5 text-[#625954]">
            This will cancel your session for <strong>{cancelSessionTarget.offering.course.code}</strong> with <strong>{cancelSessionTarget.offering.academicMate.name}</strong>. Both participants will be notified. Your conversation and booking history will remain available.
          </p>
          <label htmlFor="session-cancellation-reason" className="mt-3 block text-xs font-medium text-[#625954]">Reason (optional)</label>
          <textarea id="session-cancellation-reason" value={cancelSessionReason} onChange={(e) => setCancelSessionReason(e.target.value)} maxLength={500} rows={3} placeholder="Why are you cancelling?" disabled={cancelling} className="mt-1 w-full resize-y rounded-md border border-[#d8cec5] px-3 py-2 text-sm outline-none focus:border-[#7d1f2a]" />
        </CancelDialog>
      )}
    </main>
  );
}
