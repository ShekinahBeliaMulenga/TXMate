"use client";

import { useEffect, useState } from "react";


type RequestStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "DECLINED"
  | "CANCELLED"
  | "EXPIRED";

type RequestAction = "ACCEPTED" | "DECLINED";
type StatusFilter = "REQUESTED" | "ACCEPTED" | "DECLINED" | "ALL";

type Course = {
  id: string;
  code: string;
  name: string;
};

type RequestItem = {
  id: string;
  status: RequestStatus;
  message: string | null;
  requestedStart: string | null;
  requestedEnd: string | null;
  respondedAt: string | null;
  createdAt: string;
  student: {
    name: string;
    university: { name: string; code: string };
    programme: { name: string; code: string };
    yearNumber: number;
  };
  offering: {
    id: string;
    title: string | null;
    description: string | null;
    rate: string;
    currency: string;
    rateType: string;
    sessionDurationMinutes: number;
    course: Course;
  };
  tutoringSession: {
    id: string;
    status: string;
    scheduledStart: string;
    scheduledEnd: string;
    meetingLocation: string;
  } | null;
};

type RequestsResponse = {
  academicMate: {
    status: string;
    verificationStatus: string;
  };
  summary: {
    pendingRequests: number;
    totalRequests: number;
    acceptedRequests: number;
    declinedRequests: number;
  };
  requests: RequestItem[];
  courses: Course[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  error?: string;
};

type Confirmation = {
  item: RequestItem;
  action: RequestAction;
};

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-ZM", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Lusaka",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-ZM", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lusaka",
  }).format(date);
}

function formatRateType(value: string) {
  const labels: Record<string, string> = {
    PER_SESSION: "per session",
    PER_HOUR: "per hour",
    PER_WEEK: "per week",
    PER_MONTH: "per month",
    PER_COURSE: "per course",
    CUSTOM: "custom pricing",
  };

  return labels[value] ?? formatStatus(value);
}

function formatAmount(rate: string, currency: string) {
  const amount = Number(rate);
  if (!Number.isFinite(amount)) return `${currency} ${rate}`;

  return `${currency} ${amount.toLocaleString("en-ZM", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`;

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (remaining === 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${hours} hr ${remaining} min`;
}

function statusStyles(status: string) {
  switch (status) {
    case "ACCEPTED":
    case "COMPLETED":
    case "CONFIRMED":
      return { badge: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-600" };

    case "REQUESTED":
    case "SCHEDULED":
    case "IN_PROGRESS":
      return { badge: "bg-amber-50 text-amber-900 ring-amber-200", dot: "bg-amber-500" };

    case "DECLINED":
    case "CANCELLED":
    case "EXPIRED":
    case "DISPUTED":
    case "NO_SHOW":
      return { badge: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-600" };

    default:
      return { badge: "bg-stone-100 text-stone-700 ring-stone-200", dot: "bg-stone-400" };
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles = statusStyles(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles.badge}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      {status === "REQUESTED" ? "Pending" : formatStatus(status)}
    </span>
  );
}

function RequestActions({
  item,
  busy,
  onDetails,
  onAccept,
  onDecline,
}: {
  item: RequestItem;
  busy: boolean;
  onDetails: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onDetails}
        className="min-h-9 rounded-md border border-[#dcd3ca] bg-white px-3 text-xs font-medium text-[#4d433e] transition hover:bg-[#f7f4f1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30"
      >
        View details
      </button>

      {item.status === "REQUESTED" && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onAccept}
            className="min-h-9 rounded-md bg-[#7d1f2a] px-3 text-xs font-semibold text-white transition hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:opacity-50"
          >
            Accept
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onDecline}
            className="min-h-9 rounded-md px-3 text-xs font-medium text-[#74635c] transition hover:bg-red-50 hover:text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50"
          >
            Decline
          </button>
        </>
      )}
    </div>
  );
}

export default function AcademicMateRequestsPage() {
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [courseId, setCourseId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("REQUESTED");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedRequest, setSelectedRequest] =
    useState<RequestItem | null>(null);

  const [confirmation, setConfirmation] =
    useState<Confirmation | null>(null);

  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  // Debounce search so that we do not send a request for every keystroke.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [query]);

  // Search, status, course and pagination are handled by the API.
  useEffect(() => {
    const controller = new AbortController();

    async function loadRequests() {
      try {
        setLoading(true);
        setPageError("");

        const params = new URLSearchParams({
          status,
          page: String(page),
          pageSize: String(pageSize),
        });

        if (debouncedQuery) params.set("q", debouncedQuery);
        if (courseId) params.set("courseId", courseId);

        const response = await fetch(
          `/api/student/academic-mate/requests?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          }
        );

        const body = (await response.json()) as RequestsResponse;

        if (!response.ok) {
          throw new Error(body.error || "Unable to load requests.");
        }

        setData(body);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setPageError(
          error instanceof Error ? error.message : "Unable to load requests."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadRequests();

    return () => controller.abort();
  }, [debouncedQuery, courseId, status, page, pageSize, refreshKey]);

  // Close dialogs with Escape and stop the page behind them from scrolling.
  const dialogOpen = Boolean(selectedRequest || confirmation);

  useEffect(() => {
    if (!dialogOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || respondingId) return;

      if (confirmation) {
        setConfirmation(null);
        setActionError("");
      } else {
        setSelectedRequest(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [dialogOpen, confirmation, respondingId]);

  async function respondToRequest() {
    if (!confirmation || respondingId) return;

    const { item, action } = confirmation;

    try {
      setRespondingId(item.id);
      setActionError("");

      const response = await fetch(
        `/api/student/academic-mate/requests/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(body.error || "Unable to update this request.");
      }

      setConfirmation(null);
      setSelectedRequest(null);

      setNotice(
        `Request from ${item.student.name} has been ${action.toLowerCase()}.`
      );

      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to update this request."
      );
    } finally {
      setRespondingId(null);
    }
  }

  function askToRespond(item: RequestItem, action: RequestAction) {
    setActionError("");
    setConfirmation({ item, action });
  }

  const summary = data?.summary;
  const pagination = data?.pagination;
  const requests = data?.requests ?? [];
  const courses = data?.courses ?? [];

  const total = pagination?.total ?? 0;
  const currentPage = pagination?.page ?? page;
  const totalPages = pagination?.totalPages ?? 1;

  const firstRecord = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, total);

  const hasFilters = Boolean(query || courseId);

  function changeStatus(value: StatusFilter) {
    setStatus(value);
    setPage(1);
    setNotice("");
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setCourseId("");
    setPage(1);
  }

  const tabs: { label: string; value: StatusFilter; count: number }[] = [
    { label: "Pending", value: "REQUESTED", count: summary?.pendingRequests ?? 0 },
    { label: "Accepted", value: "ACCEPTED", count: summary?.acceptedRequests ?? 0 },
    { label: "Declined", value: "DECLINED", count: summary?.declinedRequests ?? 0 },
    { label: "All", value: "ALL", count: summary?.totalRequests ?? 0 },
  ];

  const emptyTitle = hasFilters
    ? "No matching requests"
    : status === "REQUESTED"
      ? "No pending requests"
      : "No requests found";

  const emptyText = hasFilters
    ? "Try a different search term or clear your filters."
    : "Requests with this status will show up here.";

  const emptyState = (
    <div className="px-5 py-14 text-center">
      <p className="text-sm font-semibold text-[#282321]">{emptyTitle}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#82776f]">
        {emptyText}
      </p>

      {hasFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="mt-3 text-sm font-semibold text-[#7d1f2a] underline underline-offset-4"
        >
          Clear filters
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent text-[#282321] antialiased">

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Title */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Incoming requests
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#756b65]">
              Review what students are asking for, then accept or decline.
            </p>
          </div>
        </div>

        {/* Search and filters */}
        <section aria-label="Search and filter requests" className="mt-6">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto]">
            <label className="relative block">
              <span className="sr-only">Search requests</span>

              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#968980]"
              >
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 4.2 4.2" />
              </svg>

              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                  setNotice("");
                }}
                placeholder="Search by student, course or message"
                className="h-11 w-full rounded-lg border border-[#dcd3ca] bg-white pl-10 pr-4 text-sm text-[#282321] outline-none transition placeholder:text-[#a0958d] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10"
              />
            </label>

            <label className="block">
              <span className="sr-only">Filter by course</span>

              <select
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setPage(1);
                  setNotice("");
                }}
                className="h-11 w-full rounded-lg border border-[#dcd3ca] bg-white px-3 text-sm text-[#4d433e] outline-none focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10"
              >
                <option value="">All courses</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} – {course.name}
                  </option>
                ))}
              </select>
            </label>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="h-11 rounded-lg px-3 text-sm font-medium text-[#7d1f2a] hover:bg-[#f1e9e6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30"
              >
                Clear filters
              </button>
            )}
          </div>
        </section>

        {/* Status tabs: wrap instead of scrolling */}
        <div
          role="tablist"
          aria-label="Filter requests by status"
          className="mt-5 flex flex-wrap gap-2"
        >
          {tabs.map((tab) => {
            const active = status === tab.value;

            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => changeStatus(tab.value)}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30 ${
                  active
                    ? "border-[#7d1f2a] bg-[#7d1f2a] font-semibold text-white"
                    : "border-[#dcd3ca] bg-white text-[#625954] hover:border-[#c9b8b0] hover:text-[#282321]"
                }`}
              >
                {tab.label}

                <span
                  className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-medium leading-5 ${
                    active ? "bg-white/20 text-white" : "bg-[#efebe7] text-[#6f645d]"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Notifications and errors */}
        {notice && (
          <div
            role="status"
            className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            <span>{notice}</span>

            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss notification"
              className="text-lg leading-none text-emerald-800 hover:text-emerald-950"
            >
              ×
            </button>
          </div>
        )}

        {pageError && (
          <div
            role="alert"
            className="mt-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-red-800">{pageError}</p>

            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              className="w-fit text-sm font-semibold text-red-900 underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        )}

        {/* Results */}
        <section
          aria-label="Request results"
          className="mt-5 overflow-hidden rounded-xl border border-[#e2d9d0] bg-white"
        >
          <div className="flex flex-col gap-1 border-b border-[#e8e1da] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-sm font-medium text-[#3d3530]">
              {status === "ALL"
                ? "All requests"
                : status === "REQUESTED"
                  ? "Pending requests"
                  : `${formatStatus(status)} requests`}
            </p>

            <p className="text-xs text-[#8a7f7a]" aria-live="polite">
              {loading
                ? "Updating results..."
                : `Showing ${firstRecord}–${lastRecord} of ${total}`}
            </p>
          </div>

          {/* Small and medium screens: one card per request, no sideways scrolling */}
          <div className="lg:hidden">
            {loading && requests.length === 0 ? (
              <p className="px-5 py-14 text-center text-sm text-[#756b65]">
                Loading requests...
              </p>
            ) : requests.length === 0 ? (
              emptyState
            ) : (
              <ul className="divide-y divide-[#eee8e2]">
                {requests.map((item) => (
                  <li key={item.id} className="space-y-3 px-4 py-4 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {item.student.name}
                        </p>
                        <p className="mt-0.5 text-xs text-[#756b65]">
                          {item.student.programme.name}, Year{" "}
                          {item.student.yearNumber}
                        </p>
                      </div>

                      <StatusBadge status={item.status} />
                    </div>

                    <div>
                      <p className="text-sm">
                        <span className="font-semibold text-[#7d1f2a]">
                          {item.offering.course.code}
                        </span>{" "}
                        <span className="text-[#504740]">
                          {item.offering.course.name}
                        </span>
                      </p>

                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#756b65]">
                        {item.message
                          ? `“${item.message}”`
                          : "No message included"}
                      </p>
                    </div>

                    <p className="text-xs text-[#8a7f7a]">
                      Received {formatDate(item.createdAt)}
                    </p>

                    <RequestActions
                      item={item}
                      busy={respondingId === item.id}
                      onDetails={() => setSelectedRequest(item)}
                      onAccept={() => askToRespond(item, "ACCEPTED")}
                      onDecline={() => askToRespond(item, "DECLINED")}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Large screens: table that fits the container */}
          <div className="hidden lg:block">
            <table className="w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-[#e8e1da] bg-[#faf8f6] text-xs font-medium text-[#83776f]">
                  <th scope="col" className="w-[28%] px-5 py-3">
                    Student
                  </th>
                  <th scope="col" className="w-[26%] px-4 py-3">
                    Course
                  </th>
                  <th scope="col" className="w-[12%] px-4 py-3">
                    Received
                  </th>
                  <th scope="col" className="w-[12%] px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="w-[22%] px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#eee8e2]">
                {loading && requests.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-14 text-center text-sm text-[#756b65]"
                    >
                      Loading requests...
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={5}>{emptyState}</td>
                  </tr>
                ) : (
                  requests.map((item) => (
                    <tr
                      key={item.id}
                      className="align-top transition hover:bg-[#fcfaf8]"
                    >
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setSelectedRequest(item)}
                          className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30"
                        >
                          <span className="block truncate text-sm font-semibold hover:text-[#7d1f2a]">
                            {item.student.name}
                          </span>
                          <span className="mt-1 block truncate text-xs text-[#756b65]">
                            {item.student.programme.name}, Year{" "}
                            {item.student.yearNumber}
                          </span>
                          <span className="mt-2 block truncate text-xs text-[#8a7f7a]">
                            {item.message
                              ? `“${item.message}”`
                              : "No message included"}
                          </span>
                        </button>
                      </td>

                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold text-[#7d1f2a]">
                          {item.offering.course.code}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-[#504740]">
                          {item.offering.course.name}
                        </p>
                        {item.offering.title && (
                          <p className="mt-1 truncate text-xs text-[#8a7f7a]">
                            {item.offering.title}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-4 text-sm text-[#625954]">
                        {formatDate(item.createdAt)}
                      </td>

                      <td className="px-4 py-4">
                        <StatusBadge status={item.status} />
                      </td>

                      <td className="px-4 py-4">
                        <RequestActions
                          item={item}
                          busy={respondingId === item.id}
                          onDetails={() => setSelectedRequest(item)}
                          onAccept={() => askToRespond(item, "ACCEPTED")}
                          onDecline={() => askToRespond(item, "DECLINED")}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <footer className="flex flex-col gap-3 border-t border-[#e8e1da] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <label className="flex items-center gap-2 text-xs text-[#756b65]">
              Rows per page
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="h-8 rounded-md border border-[#dcd3ca] bg-white px-2 text-xs text-[#4d433e] outline-none focus:border-[#7d1f2a]"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="text-xs text-[#756b65]">
                Page {currentPage} of {totalPages}
              </span>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loading || currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="min-h-9 rounded-md border border-[#dcd3ca] bg-white px-3 text-sm font-medium text-[#4d433e] transition hover:bg-[#f7f4f1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <button
                  type="button"
                  disabled={loading || currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  className="min-h-9 rounded-md border border-[#dcd3ca] bg-white px-3 text-sm font-medium text-[#4d433e] transition hover:bg-[#f7f4f1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </footer>
        </section>
      </main>

      {/* Request details: bottom sheet on phones, centred dialog on larger screens */}
      {selectedRequest && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedRequest(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-details-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-[#e2d9d0] bg-white shadow-xl sm:rounded-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e8e1da] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#877a72]">
                  Request details
                </p>

                <h2
                  id="request-details-title"
                  className="mt-1 truncate text-xl font-semibold tracking-tight"
                >
                  {selectedRequest.student.name}
                </h2>

                <p className="mt-1 text-sm text-[#756b65]">
                  {selectedRequest.student.programme.name}, Year{" "}
                  {selectedRequest.student.yearNumber}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                aria-label="Close request details"
                className="rounded-md px-2 py-1 text-xl text-[#756b65] hover:bg-[#f4f1ed] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusBadge status={selectedRequest.status} />

                <span className="text-xs text-[#82776f]">
                  Received {formatDateTime(selectedRequest.createdAt)}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#3d3530]">
                  Requested course
                </h3>

                <p className="mt-2 text-sm font-semibold text-[#7d1f2a]">
                  {selectedRequest.offering.course.code}{" "}
                  <span className="font-medium text-[#504740]">
                    {selectedRequest.offering.course.name}
                  </span>
                </p>

                {selectedRequest.offering.title && (
                  <p className="mt-1 text-sm text-[#625954]">
                    {selectedRequest.offering.title}
                  </p>
                )}

                <p className="mt-2 text-sm text-[#625954]">
                  {formatAmount(
                    selectedRequest.offering.rate,
                    selectedRequest.offering.currency
                  )}{" "}
                  {formatRateType(selectedRequest.offering.rateType)}, for{" "}
                  {formatDuration(
                    selectedRequest.offering.sessionDurationMinutes
                  )}
                </p>
              </div>

              <div className="border-t border-[#eee8e2] pt-4">
                <h3 className="text-sm font-semibold text-[#3d3530]">
                  Message from student
                </h3>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#413a35]">
                  {selectedRequest.message || "No message was included."}
                </p>
              </div>

              {(selectedRequest.requestedStart ||
                selectedRequest.requestedEnd) && (
                <div className="border-t border-[#eee8e2] pt-4">
                  <h3 className="text-sm font-semibold text-[#3d3530]">
                    Requested time
                  </h3>

                  {selectedRequest.requestedStart && (
                    <p className="mt-2 text-sm text-[#413a35]">
                      Starts: {formatDateTime(selectedRequest.requestedStart)}
                    </p>
                  )}

                  {selectedRequest.requestedEnd && (
                    <p className="mt-1 text-sm text-[#413a35]">
                      Ends: {formatDateTime(selectedRequest.requestedEnd)}
                    </p>
                  )}
                </div>
              )}

              {selectedRequest.tutoringSession && (
                <div className="border-t border-[#eee8e2] pt-4">
                  <h3 className="text-sm font-semibold text-[#3d3530]">
                    Scheduled session
                  </h3>

                  <p className="mt-2 text-sm text-[#413a35]">
                    {formatDateTime(
                      selectedRequest.tutoringSession.scheduledStart
                    )}
                  </p>

                  <p className="mt-1 text-sm text-[#625954]">
                    {selectedRequest.tutoringSession.meetingLocation}
                  </p>

                  <div className="mt-2">
                    <StatusBadge
                      status={selectedRequest.tutoringSession.status}
                    />
                  </div>
                </div>
              )}

              {selectedRequest.respondedAt && (
                <p className="border-t border-[#eee8e2] pt-4 text-xs text-[#82776f]">
                  Responded on {formatDateTime(selectedRequest.respondedAt)}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#e8e1da] bg-[#fcfaf8] px-5 py-4 sm:px-6">
              {selectedRequest.status === "REQUESTED" ? (
                <>
                  <button
                    type="button"
                    onClick={() => askToRespond(selectedRequest, "DECLINED")}
                    className="min-h-10 rounded-md border border-[#d8cec5] bg-white px-4 py-2 text-sm font-medium text-[#514640] hover:bg-[#f5f0eb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30"
                  >
                    Decline
                  </button>

                  <button
                    type="button"
                    onClick={() => askToRespond(selectedRequest, "ACCEPTED")}
                    className="min-h-10 rounded-md bg-[#7d1f2a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"
                  >
                    Accept request
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="min-h-10 rounded-md border border-[#d8cec5] bg-white px-4 py-2 text-sm font-medium text-[#514640] hover:bg-[#f5f0eb]"
                >
                  Close
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Accept or decline confirmation */}
      {confirmation && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !respondingId) {
              setConfirmation(null);
              setActionError("");
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-request-title"
            className="w-full max-w-md rounded-t-2xl border border-[#e2d9d0] bg-white shadow-xl sm:rounded-xl"
          >
            <div className="p-5 sm:p-6">
              <h2
                id="confirm-request-title"
                className="text-lg font-semibold tracking-tight"
              >
                {confirmation.action === "ACCEPTED"
                  ? "Accept this request?"
                  : "Decline this request?"}
              </h2>

              <p className="mt-3 text-sm leading-6 text-[#625954]">
                {confirmation.action === "ACCEPTED"
                  ? `You are about to accept ${confirmation.item.student.name}'s request for ${confirmation.item.offering.course.code}. You will still need to arrange the tutoring session separately.`
                  : `You are about to decline ${confirmation.item.student.name}'s request for ${confirmation.item.offering.course.code}.`}
              </p>

              {actionError && (
                <p
                  role="alert"
                  className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                  {actionError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[#e8e1da] bg-[#fcfaf8] px-5 py-4 sm:px-6">
              <button
                type="button"
                disabled={Boolean(respondingId)}
                onClick={() => {
                  setConfirmation(null);
                  setActionError("");
                }}
                className="min-h-10 rounded-md border border-[#d8cec5] bg-white px-4 py-2 text-sm font-medium text-[#514640] hover:bg-[#f5f0eb] disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={Boolean(respondingId)}
                onClick={() => void respondToRequest()}
                className="min-h-10 rounded-md bg-[#7d1f2a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#681923] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {respondingId
                  ? "Saving..."
                  : confirmation.action === "ACCEPTED"
                    ? "Confirm acceptance"
                    : "Confirm decline"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}