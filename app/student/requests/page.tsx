"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import SessionBookingDialog from "@/components/student/session-booking-dialog";

type RequestStatus = "REQUESTED" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
type StatusFilter = "ALL" | RequestStatus;
type SortOrder = "NEWEST" | "OLDEST";

type RequestItem = {
  id: string;
  status: RequestStatus;
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  requestedStart: string | null;
  requestedEnd: string | null;
  offering: {
    id: string;
    title: string | null;
    description: string | null;
    rate: string;
    currency: string;
    rateType: string;
    sessionDurationMinutes: number;
    course: { id: string; code: string; name: string };
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

type ApiBody = { requests?: RequestItem[]; message?: string; error?: string };

const PAGE_SIZE = 10;
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "REQUESTED", label: "Pending" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "EXPIRED", label: "Expired" },
];
const COLUMNS = ["Course", "Academic Mate", "Requested", "Status", "Session", "Actions"];

const RED = "bg-red-50 text-red-800 ring-red-200";
const STATUS_CLASSES: Record<string, string> = {
  ACCEPTED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REQUESTED: "bg-amber-50 text-amber-800 ring-amber-200",
  DECLINED: RED,
  CANCELLED: RED,
  EXPIRED: RED,
};

const BTN_OUTLINE = "rounded-md border border-[#d8cec5] px-3 py-2 text-xs font-medium text-[#625954] hover:bg-[#f7f4f0] disabled:opacity-50";
const BTN_PRIMARY = "rounded-md bg-[#7d1f2a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#681923] disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SM = "whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium";
const TH = "px-3 py-3 text-[11px] font-semibold text-[#625954] sm:px-4";
const TD = "px-3 py-3 sm:px-4";

const formatStatus = (status: string) =>
  status === "REQUESTED"
    ? "Pending"
    : status.toLowerCase().split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

function makeFormatter(extra: Intl.DateTimeFormatOptions) {
  const fmt = new Intl.DateTimeFormat("en-ZM", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lusaka", ...extra });
  return (value: string | null) => {
    if (!value) return "Not specified";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : fmt.format(date);
  };
}
const formatDate = makeFormatter({});
const formatDateTime = makeFormatter({ hour: "2-digit", minute: "2-digit" });

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const canCancel = (item: RequestItem) => (item.status === "REQUESTED" || item.status === "ACCEPTED") && !item.tutoringSession;
const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** JSON request helper: always parses safely and throws `body.error` (or the fallback) on failure. */
async function api(url: string, fallback: string, init: RequestInit = {}): Promise<ApiBody> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  const body: ApiBody = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}

// Tells the sidebar to clear its green "newly accepted" badge (same event name as use-accepted-requests.ts).
async function markAcceptedRequestsSeen() {
  try {
    await api("/api/student/my-requests/seen", "", { method: "POST" });
    window.dispatchEvent(new Event("txmate:accepted-requests-seen"));
  } catch {
    // The badge will clear the next time the page is opened.
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${STATUS_CLASSES[status] ?? "bg-stone-100 text-stone-700 ring-stone-200"}`}>
      {formatStatus(status)}
    </span>
  );
}

function Modal({ id, width, onClose, children }: { id: string; width: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 sm:p-5" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby={id} className={`my-auto w-full ${width} rounded-lg border border-[#e2d9d0] bg-white p-4 shadow-xl sm:p-5`}>
        {children}
      </section>
    </div>
  );
}

function CancelDialog({ id, title, busy, keepLabel, onKeep, onConfirm, children }: {
  id: string; title: string; busy: boolean; keepLabel: string; onKeep: () => void; onConfirm: () => void; children: ReactNode;
}) {
  return (
    <Modal id={id} width="max-w-md" onClose={() => !busy && onKeep()}>
      <h2 id={id} className="text-base font-semibold">{title}</h2>
      {children}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onKeep} className={BTN_OUTLINE}>{keepLabel}</button>
        <button type="button" disabled={busy} onClick={onConfirm} className={BTN_PRIMARY}>{busy ? "Cancelling..." : "Confirm cancellation"}</button>
      </div>
    </Modal>
  );
}

export default function StudentRequestsPage() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [sortOrder, setSortOrder] = useState<SortOrder>("NEWEST");
  const [page, setPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RequestItem | null>(null);
  const [bookingTarget, setBookingTarget] = useState<RequestItem | null>(null);
  const [cancelSessionTarget, setCancelSessionTarget] = useState<RequestItem | null>(null);
  const [cancelSessionReason, setCancelSessionReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const loadRequests = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setPageError("");
      const body = await api("/api/student/my-requests", "Unable to load your requests.", { signal });
      setRequests(body.requests ?? []);
      void markAcceptedRequestsSeen();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setPageError(errorMessage(error, "Unable to load your requests."));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadRequests(controller.signal);
    return () => controller.abort();
  }, [loadRequests]);

  useEffect(() => setPage(1), [query, status, sortOrder]);

  const counts = useMemo(() => {
    const values: Record<StatusFilter, number> = { ALL: requests.length, REQUESTED: 0, ACCEPTED: 0, DECLINED: 0, CANCELLED: 0, EXPIRED: 0 };
    for (const item of requests) values[item.status] += 1;
    return values;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const search = query.trim().toLowerCase();
    const direction = sortOrder === "NEWEST" ? -1 : 1;
    return requests
      .filter((item) => {
        if (status !== "ALL" && item.status !== status) return false;
        const { course, title, academicMate } = item.offering;
        return !search || [course.code, course.name, title ?? "", academicMate.name, item.message ?? ""].join(" ").toLowerCase().includes(search);
      })
      .sort((a, b) => direction * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
  }, [requests, query, status, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRequests = filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  /** Runs a cancel call with shared busy/notice/error handling. Returns true on success. */
  async function runCancel(url: string, init: RequestInit, fallback: string, onSuccess: (body: ApiBody) => void, successNotice: string) {
    if (cancelling) return;
    setCancelling(true);
    setPageError("");
    setNotice("");
    try {
      const body = await api(url, fallback, init);
      onSuccess(body);
      setNotice(body.message || successNotice);
    } catch (error) {
      setPageError(errorMessage(error, fallback));
      setCancelTarget(null);
    } finally {
      setCancelling(false);
    }
  }

  const handleCancel = () => {
    const target = cancelTarget;
    if (!target) return;
    return runCancel(
      `/api/student/mate-requests/${encodeURIComponent(target.id)}`,
      { method: "PATCH", body: JSON.stringify({ action: "CANCELLED" }) },
      "Unable to cancel this request.",
      () => {
        setRequests((cur) => cur.map((r) => (r.id === target.id ? { ...r, status: "CANCELLED" } : r)));
        setCancelTarget(null);
        setSelectedRequest(null);
      },
      "Your request has been cancelled.",
    );
  };

  const handleCancelSession = () => {
    const target = cancelSessionTarget;
    const session = target?.tutoringSession;
    if (!target || !session) return;
    return runCancel(
      `/api/student/sessions/${encodeURIComponent(session.id)}/cancel`,
      { method: "POST", body: JSON.stringify({ reason: cancelSessionReason.trim() }) },
      "Unable to cancel this session.",
      () => {
        setRequests((cur) =>
          cur.map((r) => (r.id === target.id && r.tutoringSession ? { ...r, tutoringSession: { ...r.tutoringSession, status: "CANCELLED" } } : r)),
        );
        setCancelSessionTarget(null);
        setCancelSessionReason("");
      },
      "Session cancelled successfully.",
    );
  };

  const detailRows = (r: RequestItem) =>
    [
      ["Academic Mate", r.offering.academicMate.name],
      ["Date requested", formatDateTime(r.createdAt)],
      r.respondedAt && ["Response date", formatDateTime(r.respondedAt)],
      (r.requestedStart || r.requestedEnd) && ["Requested time", `${formatDateTime(r.requestedStart)} to ${formatDateTime(r.requestedEnd)}`],
      r.tutoringSession && ["Booked session", `${formatDateTime(r.tutoringSession.scheduledStart)} to ${formatDateTime(r.tutoringSession.scheduledEnd)}`],
    ].filter(Boolean) as [string, string][];

  const now = new Date();
  const inputClass = "h-10 w-full rounded-md border border-[#d8cec5] bg-white px-3 text-sm outline-none focus:border-[#7d1f2a]";

  return (
    <main className="min-h-screen bg-[#fcfbfa] px-3 py-5 text-[#282321] sm:px-5 sm:py-7 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My Requests</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-5 text-[#6d6260]">Track responses and manage your Academic Mate requests.</p>
          </div>
          <Link href="/student/find-academic-mate" className="inline-flex min-h-9 items-center justify-center rounded-md bg-[#7d1f2a] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#681923]">
            Find an Academic Mate
          </Link>
        </header>

        {pageError && !cancelSessionTarget && (
          <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
            <p className="text-sm text-red-800">{pageError}</p>
            <button type="button" onClick={() => void loadRequests()} className="text-xs font-semibold text-red-800 underline underline-offset-2">Try again</button>
          </div>
        )}
        {notice && <p role="status" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{notice}</p>}

        <section className="mt-5 rounded-lg border border-[#e2d9d0] bg-white p-3 sm:p-4" aria-label="Request filters">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
            <div>
              <label htmlFor="request-search" className="mb-1.5 block text-xs font-medium text-[#625954]">Search</label>
              <input id="request-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Academic Mate or course" className={`${inputClass} placeholder:text-[#a39a94]`} />
            </div>
            <div>
              <label htmlFor="request-sort" className="mb-1.5 block text-xs font-medium text-[#625954]">Sort by date</label>
              <select id="request-sort" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)} className={inputClass}>
                <option value="NEWEST">Newest first</option>
                <option value="OLDEST">Oldest first</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by request status">
            {FILTERS.map(({ value, label }) => (
              <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${status === value ? "bg-[#7d1f2a] text-white" : "border border-[#d8cec5] bg-white text-[#625954] hover:bg-[#f7f4f0]"}`}>
                {label}<span className="ml-1.5 tabular-nums opacity-80">{counts[value]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-lg border border-[#e2d9d0] bg-white" aria-label="Your requests">
          {loading ? (
            <div role="status" className="px-4 py-14 text-center text-sm text-[#6d6260]">Loading requests...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <h2 className="text-sm font-semibold">{requests.length === 0 ? "No requests yet" : "No matching requests"}</h2>
              <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-[#6d6260]">{requests.length === 0 ? "Requests you send to Academic Mates will appear here so you can track their status." : "Try another search term or status filter."}</p>
              {requests.length === 0 ? (
                <Link href="/student/find-academic-mate" className="mt-3 inline-flex text-xs font-semibold text-[#7d1f2a] hover:underline">Browse Academic Mates</Link>
              ) : (
                <button type="button" onClick={() => { setQuery(""); setStatus("ALL"); }} className="mt-3 text-xs font-semibold text-[#7d1f2a] hover:underline">Clear filters</button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <thead className="bg-[#f7f4f0]">
                    <tr className="border-b border-[#e2d9d0]">{COLUMNS.map((c) => <th key={c} className={TH}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {visibleRequests.map((item) => {
                      const { course, academicMate } = item.offering;
                      const session = item.tutoringSession;
                      return (
                        <tr key={item.id} className="border-b border-[#eee8e2] last:border-0 hover:bg-[#fcfaf8]">
                          <td className={`max-w-[230px] ${TD}`}>
                            <p className="font-mono text-[11px] font-semibold text-[#7d1f2a]">{course.code}</p>
                            <p className="mt-0.5 text-xs leading-5 text-[#282321]">{course.name}</p>
                          </td>
                          <td className={TD}>
                            <div className="flex items-center gap-2">
                              {academicMate.image
                                ? <img src={academicMate.image} alt="" className="h-7 w-7 rounded-full object-cover" />
                                : <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f2e7e5] text-[10px] font-semibold text-[#7d1f2a]">{initials(academicMate.name)}</span>}
                              <span className="text-xs font-medium text-[#4d4541]">{academicMate.name}</span>
                            </div>
                          </td>
                          <td className={`whitespace-nowrap text-xs text-[#625954] ${TD}`}>{formatDate(item.createdAt)}</td>
                          <td className={TD}><StatusBadge status={item.status} /></td>
                          <td className={TD}>
                            {session
                              ? <><p className="text-xs font-medium text-[#4d4541]">{formatDateTime(session.scheduledStart)}</p><p className="mt-0.5 text-[10px] text-[#8a7f7a]">{formatStatus(session.status)}</p></>
                              : <span className="text-xs text-[#8a7f7a]">Not booked</span>}
                          </td>
                          <td className={TD}>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setSelectedRequest(item)} className={`${BTN_SM} border border-[#d8cec5] text-[#625954] hover:bg-[#f7f4f0]`}>Details</button>
                              {item.status === "ACCEPTED" && !session && (
                                <button type="button" onClick={() => { setSelectedRequest(null); setBookingTarget(item); }} className={`${BTN_SM} bg-[#7d1f2a] font-semibold text-white hover:bg-[#681923]`}>Book session</button>
                              )}
                              {session && (
                                <Link href={`/student/sessions/${encodeURIComponent(session.id)}/conversation`} className={`${BTN_SM} border border-[#d8cec5] text-[#7d1f2a] hover:bg-[#f7f4f0]`}>Open conversation</Link>
                              )}
                              {session?.status === "SCHEDULED" && new Date(session.scheduledStart) > now && (
                                <button type="button" onClick={() => { setPageError(""); setCancelSessionReason(""); setCancelSessionTarget(item); }} className={`${BTN_SM} text-red-700 hover:bg-red-50`}>Cancel session</button>
                              )}
                              {canCancel(item) && <button type="button" onClick={() => setCancelTarget(item)} className={`${BTN_SM} text-[#8b3335] hover:bg-red-50`}>Cancel</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2d9d0] bg-[#fcfbf9] px-3 py-2.5 sm:px-4">
                <p className="text-xs text-[#7a6f6a]">Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length}</p>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded-md border border-[#d8cec5] px-3 py-1.5 text-xs font-medium disabled:opacity-40">Previous</button>
                  <span className="text-xs tabular-nums text-[#6d6260]">{currentPage} / {totalPages}</span>
                  <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="rounded-md border border-[#d8cec5] px-3 py-1.5 text-xs font-medium disabled:opacity-40">Next</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {selectedRequest && (
        <Modal id="request-details-title" width="max-w-lg" onClose={() => setSelectedRequest(null)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="request-details-title" className="text-base font-semibold">Request details</h2>
              <p className="mt-1 text-xs text-[#6d6260]">{selectedRequest.offering.course.code} · {selectedRequest.offering.course.name}</p>
            </div>
            <StatusBadge status={selectedRequest.status} />
          </div>
          <dl className="mt-4 divide-y divide-[#eee8e2] border-y border-[#eee8e2]">
            {detailRows(selectedRequest).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-xs text-[#7a6f6a]">{label}</dt>
                <dd className="text-right text-xs font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <p className="text-xs font-semibold text-[#625954]">Your message</p>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-5 text-[#4d4541]">{selectedRequest.message?.trim() || "No message was included with this request."}</p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            {canCancel(selectedRequest) && (
              <button type="button" onClick={() => { setCancelTarget(selectedRequest); setSelectedRequest(null); }} className="rounded-md px-3 py-2 text-xs font-medium text-[#8b3335] hover:bg-red-50">Cancel request</button>
            )}
            <button type="button" onClick={() => setSelectedRequest(null)} className={BTN_OUTLINE}>Close</button>
          </div>
        </Modal>
      )}

      {bookingTarget && (
        <SessionBookingDialog
          requestId={bookingTarget.id}
          courseLabel={`${bookingTarget.offering.course.code} · ${bookingTarget.offering.course.name}`}
          onClose={() => setBookingTarget(null)}
          onBooked={async () => {
            await loadRequests();
            setNotice("Session booked successfully.");
          }}
        />
      )}

      {cancelTarget && (
        <CancelDialog id="cancel-request-title" title="Cancel this request?" busy={cancelling} keepLabel="Keep request" onKeep={() => setCancelTarget(null)} onConfirm={() => void handleCancel()}>
          <p className="mt-1.5 text-xs leading-5 text-[#625954]">You are cancelling your request for <strong>{cancelTarget.offering.course.code}</strong> with <strong>{cancelTarget.offering.academicMate.name}</strong>. The Academic Mate will be notified, and this request will remain in your history as Cancelled.</p>
          {cancelTarget.status === "ACCEPTED" && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">This request has already been accepted. Cancelling it will end the request before a session is booked.</p>}
        </CancelDialog>
      )}

      {cancelSessionTarget?.tutoringSession && (
        <CancelDialog id="cancel-session-title" title="Cancel booked session?" busy={cancelling} keepLabel="Keep session" onKeep={() => setCancelSessionTarget(null)} onConfirm={() => void handleCancelSession()}>
          <p className="mt-2 text-sm leading-5 text-[#625954]">
            This will cancel your session for <strong>{cancelSessionTarget.offering.course.code}</strong> with <strong>{cancelSessionTarget.offering.academicMate.name}</strong>. Both participants will be notified. Your conversation and booking history will remain available.
          </p>
          <label htmlFor="session-cancellation-reason" className="mt-4 block text-xs font-medium text-[#625954]">Reason (optional)</label>
          <textarea
            id="session-cancellation-reason"
            value={cancelSessionReason}
            onChange={(e) => setCancelSessionReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Why are you cancelling?"
            disabled={cancelling}
            className="mt-1.5 w-full resize-y rounded-md border border-[#d8cec5] px-3 py-2 text-sm outline-none focus:border-[#7d1f2a]"
          />
          {pageError && <p role="alert" className="mt-3 text-xs text-red-700">{pageError}</p>}
        </CancelDialog>
      )}
    </main>
  );
}