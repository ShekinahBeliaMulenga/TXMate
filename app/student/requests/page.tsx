"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type RequestsResponse = { requests: RequestItem[]; error?: string };

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "REQUESTED", label: "Pending" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "EXPIRED", label: "Expired" },
];

function formatStatus(status: string) {
  if (status === "REQUESTED") return "Pending";
  return status.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatDate(value: string | null) {
  if (!value) return "Not specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZM", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lusaka",
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "Not specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZM", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka",
  }).format(date);
}

function statusClasses(status: string) {
  switch (status) {
    case "ACCEPTED":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "REQUESTED":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "DECLINED":
    case "CANCELLED":
    case "EXPIRED":
      return "bg-red-50 text-red-800 ring-red-200";
    default:
      return "bg-stone-100 text-stone-700 ring-stone-200";
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${statusClasses(status)}`}>
      {formatStatus(status)}
    </span>
  );
}

function canCancel(item: RequestItem) {
  return (item.status === "REQUESTED" || item.status === "ACCEPTED") && !item.tutoringSession;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// Tells the sidebar to clear its green "newly accepted" badge (same event name as use-accepted-requests.ts).
async function markAcceptedRequestsSeen() {
  try {
    const response = await fetch("/api/student/my-requests/seen", { method: "POST", cache: "no-store" });
    if (response.ok) window.dispatchEvent(new Event("txmate:accepted-requests-seen"));
  } catch {
    // The badge will clear the next time the page is opened.
  }
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
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadRequests = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setPageError("");
      const response = await fetch("/api/student/my-requests", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal,
      });
      const body = (await response.json()) as RequestsResponse;
      if (!response.ok) throw new Error(body.error || "Unable to load your requests.");
      setRequests(body.requests);
      void markAcceptedRequestsSeen();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setPageError(error instanceof Error ? error.message : "Unable to load your requests.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadRequests(controller.signal);
    return () => controller.abort();
  }, [loadRequests]);

  useEffect(() => {
    if (!selectedRequest && !cancelTarget) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !cancellingId) {
        setSelectedRequest(null);
        setCancelTarget(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedRequest, cancelTarget, cancellingId]);

  const counts = useMemo(() => {
    const values: Record<StatusFilter, number> = {
      ALL: requests.length,
      REQUESTED: 0,
      ACCEPTED: 0,
      DECLINED: 0,
      CANCELLED: 0,
      EXPIRED: 0,
    };
    for (const item of requests) values[item.status] += 1;
    return values;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const search = query.trim().toLowerCase();
    const result = requests.filter((item) => {
      const matchesStatus = status === "ALL" || item.status === status;
      const searchable = [
        item.offering.course.code,
        item.offering.course.name,
        item.offering.title ?? "",
        item.offering.academicMate.name,
        item.message ?? "",
      ].join(" ").toLowerCase();
      return matchesStatus && (!search || searchable.includes(search));
    });
    return result.sort((a, b) => {
      const difference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === "NEWEST" ? -difference : difference;
    });
  }, [requests, query, status, sortOrder]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRequests = filteredRequests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, status, sortOrder]);

  async function handleCancel() {
    if (!cancelTarget || cancellingId) return;
    const requestId = cancelTarget.id;
    setCancellingId(requestId);
    setPageError("");
    setNotice("");
    try {
      const response = await fetch(`/api/student/mate-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCELLED" }),
      });
      const body = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to cancel this request.");
      setRequests((current) => current.map((item) => item.id === requestId ? { ...item, status: "CANCELLED" } : item));
      setNotice(body.message || "Your request has been cancelled.");
      setCancelTarget(null);
      setSelectedRequest(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to cancel this request.");
      setCancelTarget(null);
    } finally {
      setCancellingId(null);
    }
  }

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

        {pageError && (
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
              <input id="request-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Academic Mate or course" className="h-10 w-full rounded-md border border-[#d8cec5] bg-white px-3 text-sm outline-none placeholder:text-[#a39a94] focus:border-[#7d1f2a]" />
            </div>
            <div>
              <label htmlFor="request-sort" className="mb-1.5 block text-xs font-medium text-[#625954]">Sort by date</label>
              <select id="request-sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} className="h-10 w-full rounded-md border border-[#d8cec5] bg-white px-3 text-sm outline-none focus:border-[#7d1f2a]">
                <option value="NEWEST">Newest first</option>
                <option value="OLDEST">Oldest first</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by request status">
            {FILTERS.map((item) => (
              <button key={item.value} type="button" aria-pressed={status === item.value} onClick={() => setStatus(item.value)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${status === item.value ? "bg-[#7d1f2a] text-white" : "border border-[#d8cec5] bg-white text-[#625954] hover:bg-[#f7f4f0]"}`}>
                {item.label}<span className="ml-1.5 tabular-nums opacity-80">{counts[item.value]}</span>
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
                    <tr className="border-b border-[#e2d9d0]">
                      <th className="px-3 py-3 text-[11px] font-semibold text-[#625954] sm:px-4">Course</th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-[#625954] sm:px-4">Academic Mate</th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-[#625954] sm:px-4">Requested</th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-[#625954] sm:px-4">Status</th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-[#625954] sm:px-4">Session</th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-[#625954] sm:px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRequests.map((item) => (
                      <tr key={item.id} className="border-b border-[#eee8e2] last:border-0 hover:bg-[#fcfaf8]">
                        <td className="max-w-[230px] px-3 py-3 sm:px-4">
                          <p className="font-mono text-[11px] font-semibold text-[#7d1f2a]">{item.offering.course.code}</p>
                          <p className="mt-0.5 text-xs leading-5 text-[#282321]">{item.offering.course.name}</p>
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex items-center gap-2">
                            {item.offering.academicMate.image ? <img src={item.offering.academicMate.image} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f2e7e5] text-[10px] font-semibold text-[#7d1f2a]">{initials(item.offering.academicMate.name)}</span>}
                            <span className="text-xs font-medium text-[#4d4541]">{item.offering.academicMate.name}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-[#625954] sm:px-4">{formatDate(item.createdAt)}</td>
                        <td className="px-3 py-3 sm:px-4"><StatusBadge status={item.status} /></td>
                        <td className="px-3 py-3 sm:px-4">
                          {item.tutoringSession ? <><p className="text-xs font-medium text-[#4d4541]">{formatDateTime(item.tutoringSession.scheduledStart)}</p><p className="mt-0.5 text-[10px] text-[#8a7f7a]">{formatStatus(item.tutoringSession.status)}</p></> : <span className="text-xs text-[#8a7f7a]">Not booked</span>}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setSelectedRequest(item)} className="rounded-md border border-[#d8cec5] px-2.5 py-1.5 text-xs font-medium text-[#625954] hover:bg-[#f7f4f0]">Details</button>
                            {item.status === "ACCEPTED" && !item.tutoringSession && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRequest(null);
                                  setBookingTarget(item);
                                }}
                                className="rounded-md bg-[#7d1f2a] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#681923]"
                              >
                                Book session
                              </button>
                            )}

                            {item.tutoringSession && (
                              <Link
                                href={`/student/sessions/${encodeURIComponent(item.tutoringSession.id)}/conversation`}
                                className="whitespace-nowrap rounded-md border border-[#d8cec5] px-2.5 py-1.5 text-xs font-medium text-[#7d1f2a] hover:bg-[#f7f4f0]"
                              >
                                Open conversation
                              </Link>
                            )}

                            {canCancel(item) && <button type="button" onClick={() => setCancelTarget(item)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[#8b3335] hover:bg-red-50">Cancel</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2d9d0] bg-[#fcfbf9] px-3 py-2.5 sm:px-4">
                <p className="text-xs text-[#7a6f6a]">Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRequests.length)} of {filteredRequests.length}</p>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-md border border-[#d8cec5] px-3 py-1.5 text-xs font-medium disabled:opacity-40">Previous</button>
                  <span className="text-xs tabular-nums text-[#6d6260]">{currentPage} / {totalPages}</span>
                  <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-md border border-[#d8cec5] px-3 py-1.5 text-xs font-medium disabled:opacity-40">Next</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedRequest(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="request-details-title" className="my-auto w-full max-w-lg rounded-lg border border-[#e2d9d0] bg-white p-4 shadow-xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="request-details-title" className="text-base font-semibold">Request details</h2>
                <p className="mt-1 text-xs text-[#6d6260]">{selectedRequest.offering.course.code} · {selectedRequest.offering.course.name}</p>
              </div>
              <StatusBadge status={selectedRequest.status} />
            </div>
            <dl className="mt-4 divide-y divide-[#eee8e2] border-y border-[#eee8e2]">
              <div className="flex justify-between gap-4 py-2.5"><dt className="text-xs text-[#7a6f6a]">Academic Mate</dt><dd className="text-right text-xs font-medium">{selectedRequest.offering.academicMate.name}</dd></div>
              <div className="flex justify-between gap-4 py-2.5"><dt className="text-xs text-[#7a6f6a]">Date requested</dt><dd className="text-right text-xs font-medium">{formatDateTime(selectedRequest.createdAt)}</dd></div>
              {selectedRequest.respondedAt && <div className="flex justify-between gap-4 py-2.5"><dt className="text-xs text-[#7a6f6a]">Response date</dt><dd className="text-right text-xs font-medium">{formatDateTime(selectedRequest.respondedAt)}</dd></div>}
              {(selectedRequest.requestedStart || selectedRequest.requestedEnd) && <div className="flex justify-between gap-4 py-2.5"><dt className="text-xs text-[#7a6f6a]">Requested time</dt><dd className="text-right text-xs font-medium">{formatDateTime(selectedRequest.requestedStart)} to {formatDateTime(selectedRequest.requestedEnd)}</dd></div>}
              {selectedRequest.tutoringSession && <div className="flex justify-between gap-4 py-2.5"><dt className="text-xs text-[#7a6f6a]">Booked session</dt><dd className="text-right text-xs font-medium">{formatDateTime(selectedRequest.tutoringSession.scheduledStart)} to {formatDateTime(selectedRequest.tutoringSession.scheduledEnd)}</dd></div>}
            </dl>
            <div className="mt-4"><p className="text-xs font-semibold text-[#625954]">Your message</p><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-5 text-[#4d4541]">{selectedRequest.message?.trim() || "No message was included with this request."}</p></div>
            <div className="mt-5 flex justify-end gap-2">
              {canCancel(selectedRequest) && <button type="button" onClick={() => { setCancelTarget(selectedRequest); setSelectedRequest(null); }} className="rounded-md px-3 py-2 text-xs font-medium text-[#8b3335] hover:bg-red-50">Cancel request</button>}
              <button type="button" onClick={() => setSelectedRequest(null)} className="rounded-md border border-[#d8cec5] px-3 py-2 text-xs font-medium text-[#625954] hover:bg-[#f7f4f0]">Close</button>
            </div>
          </section>
        </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !cancellingId) setCancelTarget(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="cancel-request-title" className="my-auto w-full max-w-md rounded-lg border border-[#e2d9d0] bg-white p-4 shadow-xl sm:p-5">
            <h2 id="cancel-request-title" className="text-base font-semibold">Cancel this request?</h2>
            <p className="mt-1.5 text-xs leading-5 text-[#625954]">You are cancelling your request for <strong>{cancelTarget.offering.course.code}</strong> with <strong>{cancelTarget.offering.academicMate.name}</strong>. The Academic Mate will be notified, and this request will remain in your history as Cancelled.</p>
            {cancelTarget.status === "ACCEPTED" && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">This request has already been accepted. Cancelling it will end the request before a session is booked.</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={cancellingId !== null} onClick={() => setCancelTarget(null)} className="rounded-md border border-[#d8cec5] px-3 py-2 text-xs font-medium text-[#625954] hover:bg-[#f7f4f0] disabled:opacity-50">Keep request</button>
              <button type="button" disabled={cancellingId !== null} onClick={() => void handleCancel()} className="rounded-md bg-[#7d1f2a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#681923] disabled:cursor-not-allowed disabled:opacity-50">{cancellingId ? "Cancelling..." : "Confirm cancellation"}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
