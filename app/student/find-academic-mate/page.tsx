"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";

type Course = { id: string; code: string; name: string };
type AcademicMateOffering = {
  offeringId: string;
  title: string | null;
  description: string | null;
  rate: string;
  currency: string;
  sessionDurationMinutes: number;
  rateType: "PER_SESSION" | "PER_HOUR" | "PER_WEEK" | "PER_MONTH" | "PER_COURSE" | "CUSTOM";
  rateDetails: string | null;
  course: Course;
  academicMate: {
    id: string;
    headline: string | null;
    bio: string | null;
    teachingExperience: string | null;
    yearsExperience: number | null;
    verificationStatus: string;
    user: { id: string; name: string; image: string | null };
  };
  existingRequest: {
    id: string;
    status: string;
  } | null;
};
type MatchingResponse = { academicMates: AcademicMateOffering[]; matchedCourses: Course[]; error?: string };
type RequestResponse = { message?: string; error?: string; request?: { id: string; status: string } };

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatRateType(rateType: AcademicMateOffering["rateType"]) {
  const labels: Record<AcademicMateOffering["rateType"], string> = {
    PER_SESSION: "per session",
    PER_HOUR: "per hour",
    PER_WEEK: "per week",
    PER_MONTH: "per month",
    PER_COURSE: "per course",
    CUSTOM: "custom pricing",
  };
  return labels[rateType];
}

function formatRate(rate: string, currency: string) {
  const amount = Number(rate);
  if (!Number.isFinite(amount)) return `${currency} ${rate}`;
  return `${currency} ${amount.toLocaleString("en-ZM", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours} hr ${remainingMinutes} min`;
}

function previewText(offering: AcademicMateOffering) {
  const source =
    offering.description?.trim() ||
    offering.academicMate.bio?.trim() ||
    offering.academicMate.teachingExperience?.trim() ||
    "";
  return source.replace(/\s+/g, " ");
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={`h-4 w-4 animate-spin motion-reduce:animate-none ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Avatar({ name, image, className = "h-10 w-10" }: { name: string; image: string | null; className?: string }) {
  if (image) {
    return <img src={image} alt="" className={`${className} shrink-0 rounded-full bg-[#f3ece7] object-cover`} />;
  }
  return (
    <div aria-hidden="true" className={`flex ${className} shrink-0 items-center justify-center rounded-full bg-[#f3ece7] text-xs font-semibold text-[#7d1f2a]`}>
      {getInitials(name)}
    </div>
  );
}

function SpecRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-[#efe8e1] py-2.5">
      <dt className="shrink-0 text-xs text-[#8a7f7a]">{label}</dt>
      <dd className="min-w-0 text-right text-sm leading-5 text-[#282321]">{children}</dd>
    </div>
  );
}

function ProseBlock({ title, text }: { title: string; text: string }) {
  return (
    <section className="border-b border-[#efe8e1] py-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a7f7a]">{title}</h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#4b423e]">{text}</p>
    </section>
  );
}

function OfferingRow({
  offering,
  requestSent,
  onOpenDetails,
  onOpenRequest,
}: {
  offering: AcademicMateOffering;
  requestSent: boolean;
  onOpenDetails: (offering: AcademicMateOffering) => void;
  onOpenRequest: (offering: AcademicMateOffering) => void;
}) {
  const mate = offering.academicMate;
  const years = mate.yearsExperience;
  const preview = previewText(offering);
  const showYears = years !== null && years > 0;

  return (
    <article className="px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex items-start gap-3">
        <Avatar name={mate.user.name} image={mate.user.image} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h2 className="text-sm font-semibold text-[#282321]">{mate.user.name}</h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Verified
                </span>
              </div>
              {mate.headline && <p className="mt-0.5 text-[13px] leading-5 text-[#7d1f2a]">{mate.headline}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums tracking-tight text-[#282321]">{formatRate(offering.rate, offering.currency)}</p>
              <p className="mt-0.5 text-[11px] text-[#8a7f7a]">{formatRateType(offering.rateType)}</p>
            </div>
          </div>

          <p className="mt-2 text-[13px] leading-5 text-[#282321]">
            <span className="font-semibold">{offering.course.code}</span>
            <span className="text-[#6d6260]"> · {offering.course.name}</span>
          </p>
          {offering.title && <p className="mt-0.5 text-sm leading-5 text-[#4b423e]">{offering.title}</p>}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-[#6d6260]">
            <span>{formatDuration(offering.sessionDurationMinutes)} session</span>
            {showYears && (
              <>
                <span aria-hidden="true" className="h-3 w-px bg-[#e4dbd3]" />
                <span>{years} {years === 1 ? "year" : "years"} experience</span>
              </>
            )}
          </div>

          {preview && <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#5c534f]">{preview}</p>}
          {offering.rateType === "CUSTOM" && offering.rateDetails && (
            <p className="mt-1.5 truncate text-xs leading-5 text-[#6d6260]" title={offering.rateDetails}>
              <span className="text-[#8a7f7a]">Pricing · </span>
              {offering.rateDetails}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={() => onOpenDetails(offering)}
              aria-haspopup="dialog"
              aria-label={`Details for ${mate.user.name}, ${offering.course.code}`}
              className="text-xs font-medium text-[#7d1f2a] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"
            >
              Details
            </button>
            <button
              type="button"
              disabled={requestSent}
              onClick={() => onOpenRequest(offering)}
              aria-label={requestSent ? `Request sent to ${mate.user.name}` : `Request academic support from ${mate.user.name}`}
              className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${requestSent ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-[#7d1f2a] text-white hover:bg-[#681923]"}`}
            >
              {requestSent ? (
                <>
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Request sent
                </>
              ) : (
                <>
                  Request
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function FindAcademicMatePage() {
  const [data, setData] = useState<MatchingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("ALL");
  const [retryCount, setRetryCount] = useState(0);
  const [selectedOffering, setSelectedOffering] = useState<AcademicMateOffering | null>(null);
  const [detailsOffering, setDetailsOffering] = useState<AcademicMateOffering | null>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestSubmitError, setRequestSubmitError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [requestedOfferingIds, setRequestedOfferingIds] = useState<Set<string>>(new Set());
  const requestDialogRef = useRef<HTMLDialogElement>(null);
  const detailsDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAcademicMates() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/student/academic-mates", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as MatchingResponse;
        if (!response.ok) throw new Error(body.error || "Unable to load Academic Mates.");
        const offerings = Array.isArray(body.academicMates) ? body.academicMates : [];
        setRequestedOfferingIds(
          new Set(
            offerings
              .filter((offering) => offering.existingRequest !== null)
             .map((offering) => offering.offeringId),
          ),
        );
        setData({
          academicMates: offerings,
          matchedCourses: Array.isArray(body.matchedCourses) ? body.matchedCourses : [],
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load Academic Mates. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAcademicMates();
    return () => controller.abort();
  }, [retryCount]);

  useEffect(() => {
    const dialog = detailsDialogRef.current;
    if (!dialog) return;
    if (detailsOffering && !dialog.open) dialog.showModal();
    else if (!detailsOffering && dialog.open) dialog.close();
  }, [detailsOffering]);

  useEffect(() => {
    const dialog = requestDialogRef.current;
    if (!dialog) return;
    if (selectedOffering && !dialog.open) dialog.showModal();
    else if (!selectedOffering && dialog.open) dialog.close();
  }, [selectedOffering]);

  const filteredOfferings = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();

    return data.academicMates.filter((offering) => {
      const matchesCourse = selectedCourseId === "ALL" || offering.course.id === selectedCourseId;
      const searchableText = [
        offering.course.code,
        offering.course.name,
        offering.title,
        offering.description,
        offering.academicMate.user.name,
        offering.academicMate.headline,
        offering.academicMate.bio,
        offering.academicMate.teachingExperience,
      ].filter(Boolean).join(" ").toLowerCase();

      return matchesCourse && (!query || searchableText.includes(query));
    });
  }, [data, search, selectedCourseId]);

  function clearFilters() {
    setSearch("");
    setSelectedCourseId("ALL");
  }

  function openRequestDialog(offering: AcademicMateOffering) {
    if (requestedOfferingIds.has(offering.offeringId)) return;
    setRequestMessage("");
    setRequestSubmitError(null);
    setRequestSuccess(null);
    setSelectedOffering(offering);
  }

  function openDetailsDialog(offering: AcademicMateOffering) {
    setDetailsOffering(offering);
  }

  function handleRequestDialogClose() {
    setSelectedOffering(null);
    setRequestMessage("");
    setRequestSubmitError(null);
    setRequestSuccess(null);
  }

  function handleDetailsDialogClose() {
    setDetailsOffering(null);
  }

  function requestFromDetails() {
    if (!detailsOffering || requestedOfferingIds.has(detailsOffering.offeringId)) return;
    const offering = detailsOffering;
    setDetailsOffering(null);
    openRequestDialog(offering);
  }

  async function handleSubmitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOffering || submittingRequest || requestSuccess) return;

    try {
      setSubmittingRequest(true);
      setRequestSubmitError(null);
      const response = await fetch("/api/student/mate-requests", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          offeringId: selectedOffering.offeringId,
          message: requestMessage.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as RequestResponse;
      if (!response.ok) throw new Error(body.error || "Unable to submit your request. Please try again.");

      setRequestedOfferingIds((previous) => {
        const updated = new Set(previous);
        updated.add(selectedOffering.offeringId);
        return updated;
      });
      setRequestSuccess(body.message || "Your academic support request has been submitted.");
    } catch (err) {
      setRequestSubmitError(err instanceof Error ? err.message : "Unable to submit your request. Please try again.");
    } finally {
      setSubmittingRequest(false);
    }
  }

  const detailsRequestSent = detailsOffering ? requestedOfferingIds.has(detailsOffering.offeringId) : false;

  return (
    <main className="min-h-screen bg-[#f9f8f6] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-[#282321] sm:text-3xl">Find an Academic Mate</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d6260]">Explore Academic Mates offering support for your enrolled courses. Compare course offerings, experience and rates before making a request.</p>
        </header>

        <section className="mb-3" aria-label="Search and filter Academic Mates">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <label htmlFor="mate-search" className="sr-only">Search Academic Mates</label>
              <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a7f7a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4.5 4.5" strokeLinecap="round" />
              </svg>
              <input
                id="mate-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, course or topic"
                className="h-10 w-full rounded-lg border border-[#d8cec5] bg-white pl-9 pr-3 text-sm text-[#282321] outline-none transition placeholder:text-[#a39a94] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10"
              />
            </div>

            <div className="w-full sm:w-64">
              <label htmlFor="course-filter" className="sr-only">Filter by course</label>
              <select
                id="course-filter"
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
                className="h-10 w-full rounded-lg border border-[#d8cec5] bg-white px-3 text-sm text-[#282321] outline-none transition focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10"
              >
                <option value="ALL">All matched courses</option>
                {(data?.matchedCourses ?? []).map((course) => (
                  <option key={course.id} value={course.id}>{course.code} · {course.name}</option>
                ))}
              </select>
            </div>

            <div className="flex min-h-10 items-center justify-between gap-3 sm:ml-auto sm:justify-end">
              <p className="text-xs text-[#6d6260]" aria-live="polite">
                {loading ? "Loading..." : error ? "Results unavailable" : `${filteredOfferings.length} ${filteredOfferings.length === 1 ? "offering" : "offerings"}`}
              </p>
              {(search.trim() || selectedCourseId !== "ALL") && (
                <button type="button" onClick={clearFilters} className="whitespace-nowrap text-xs font-medium text-[#7d1f2a] hover:underline">Clear filters</button>
              )}
            </div>
          </div>
        </section>

        <section className="border-y border-[#e4dbd3] bg-white" aria-label="Academic Mate results">
          {loading && (
            <div role="status" className="flex items-center justify-center gap-3 px-4 py-16">
              <Spinner className="h-5 w-5 text-[#7d1f2a]" />
              <span className="text-sm text-[#6d6260]">Loading Academic Mates...</span>
            </div>
          )}

          {!loading && error && (
            <div role="alert" className="px-5 py-14 text-center">
              <h2 className="text-base font-semibold text-[#282321]">Unable to load results</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#6d6260]">{error}</p>
              <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="mt-5 rounded-lg bg-[#7d1f2a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#681923]">Try again</button>
            </div>
          )}

          {!loading && !error && filteredOfferings.length === 0 && (
            <div className="px-5 py-14 text-center">
              <h2 className="text-base font-semibold text-[#282321]">{data && data.academicMates.length > 0 ? "No matching results" : "No Academic Mate matches yet"}</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#6d6260]">
                {data && data.academicMates.length > 0 ? "Try a different search term or select another course." : "There are currently no verified Academic Mate offerings matching your enrolled courses. Check back later."}
              </p>
              {(search.trim() || selectedCourseId !== "ALL") && (
                <button type="button" onClick={clearFilters} className="mt-4 text-sm font-medium text-[#7d1f2a] hover:underline">Clear filters</button>
              )}
            </div>
          )}

          {!loading && !error && filteredOfferings.length > 0 && (
            <div className="divide-y divide-[#efe8e1]">
              {filteredOfferings.map((offering) => (
                <OfferingRow
                  key={offering.offeringId}
                  offering={offering}
                  requestSent={offering.existingRequest !== null || requestedOfferingIds.has(offering.offeringId)}
                  onOpenDetails={openDetailsDialog}
                  onOpenRequest={openRequestDialog}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <dialog
        ref={detailsDialogRef}
        aria-labelledby="details-dialog-title"
        onClose={handleDetailsDialogClose}
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
        className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-[#e4dbd3] bg-white p-0 text-[#282321] shadow-xl backdrop:bg-black/50"
      >
        {detailsOffering && (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-[#efe8e1] px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar name={detailsOffering.academicMate.user.name} image={detailsOffering.academicMate.user.image} className="h-11 w-11" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7d1f2a]">Details</p>
                  <h2 id="details-dialog-title" className="mt-1 text-lg font-semibold tracking-tight text-[#282321]">{detailsOffering.academicMate.user.name}</h2>
                  {detailsOffering.academicMate.headline && <p className="mt-1 text-sm leading-5 text-[#7d1f2a]">{detailsOffering.academicMate.headline}</p>}
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6d6260]">
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                      <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Verified
                    </span>
                    {detailsOffering.academicMate.yearsExperience !== null && detailsOffering.academicMate.yearsExperience > 0 && (
                      <>
                        <span aria-hidden="true" className="h-3 w-px bg-[#e4dbd3]" />
                        <span>{detailsOffering.academicMate.yearsExperience} {detailsOffering.academicMate.yearsExperience === 1 ? "year" : "years"} of experience</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button type="button" aria-label="Close details" onClick={() => detailsDialogRef.current?.close()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6d6260] transition hover:bg-[#f6f1ec] hover:text-[#282321]">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="px-5 sm:px-6">
              <dl className="border-b border-[#efe8e1]">
                <SpecRow label="Course">
                  <span className="font-medium">{detailsOffering.course.code}</span>
                  <span className="text-[#6d6260]"> · {detailsOffering.course.name}</span>
                </SpecRow>
                {detailsOffering.title && <SpecRow label="Offering">{detailsOffering.title}</SpecRow>}
                <SpecRow label="Session">{formatDuration(detailsOffering.sessionDurationMinutes)}</SpecRow>
                <SpecRow label="Rate">
                  <span className="font-semibold tabular-nums">{formatRate(detailsOffering.rate, detailsOffering.currency)}</span>
                  <span className="text-[#6d6260]"> {formatRateType(detailsOffering.rateType)}</span>
                </SpecRow>
                {detailsOffering.rateType === "CUSTOM" && detailsOffering.rateDetails && (
                  <SpecRow label="Pricing">{detailsOffering.rateDetails}</SpecRow>
                )}
              </dl>

              {detailsOffering.description && <ProseBlock title="Offering details" text={detailsOffering.description} />}
              {detailsOffering.academicMate.bio && <ProseBlock title="About" text={detailsOffering.academicMate.bio} />}
              {detailsOffering.academicMate.teachingExperience && <ProseBlock title="Teaching experience" text={detailsOffering.academicMate.teachingExperience} />}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-[#efe8e1] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" onClick={() => detailsDialogRef.current?.close()} className="min-h-10 rounded-lg border border-[#d8cec5] bg-white px-4 py-2.5 text-sm font-semibold text-[#4b423e] transition hover:bg-[#faf8f6]">Close</button>
              <button
                type="button"
                disabled={detailsRequestSent}
                onClick={requestFromDetails}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${detailsRequestSent ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-[#7d1f2a] text-white hover:bg-[#681923]"}`}
              >
                {detailsRequestSent ? (
                  <>
                    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Request sent
                  </>
                ) : (
                  "Request academic support"
                )}
              </button>
            </div>
          </>
        )}
      </dialog>

      <dialog
        ref={requestDialogRef}
        aria-labelledby="request-dialog-title"
        onClose={handleRequestDialogClose}
        onCancel={(event) => { if (submittingRequest) event.preventDefault(); }}
        onClick={(event) => { if (event.target === event.currentTarget && !submittingRequest) event.currentTarget.close(); }}
        className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-[#e2d9d0] bg-white p-0 text-[#282321] shadow-2xl backdrop:bg-black/50"
      >
        {selectedOffering && (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-[#eee7df] px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7d1f2a]">TXMate</p>
                <h2 id="request-dialog-title" className="mt-1 text-lg font-semibold tracking-tight text-[#282321]">Request academic support</h2>
                <p className="mt-1 text-sm leading-5 text-[#6d6260]">Send an enquiry to <span className="font-semibold text-[#282321]">{selectedOffering.academicMate.user.name}</span>.</p>
              </div>
              <button type="button" aria-label="Close request form" disabled={submittingRequest} onClick={() => requestDialogRef.current?.close()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6d6260] transition hover:bg-[#f6f1ec] hover:text-[#282321] disabled:opacity-50">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div className="space-y-4 px-5 py-4 sm:px-6">
              <section aria-label="Selected offering" className="border-y border-[#efe8e1] py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7d1f2a]">{selectedOffering.course.code}</p>
                    <h3 className="mt-1 text-sm font-semibold text-[#282321]">{selectedOffering.course.name}</h3>
                    {selectedOffering.title && <p className="mt-1 text-xs leading-5 text-[#6d6260]">{selectedOffering.title}</p>}
                  </div>
                  <div className="sm:text-right">
                    <p className="text-base font-semibold text-[#282321]">{formatRate(selectedOffering.rate, selectedOffering.currency)}</p>
                    <p className="text-xs text-[#6d6260]">{formatRateType(selectedOffering.rateType)}</p>
                  </div>
                </div>
              </section>

              {!requestSuccess ? (
                <form onSubmit={(event) => void handleSubmitRequest(event)} className="space-y-4">
                  <div>
                    <label htmlFor="request-message" className="text-sm font-semibold text-[#282321]">Message <span className="font-normal text-[#8a7f7a]">(optional)</span></label>
                    <p id="request-message-help" className="mt-1 text-xs leading-5 text-[#6d6260]">Describe the topics you need help with or include relevant details about your request.</p>
                    <textarea
                      id="request-message"
                      name="message"
                      value={requestMessage}
                      onChange={(event) => setRequestMessage(event.target.value)}
                      maxLength={1000}
                      rows={4}
                      aria-describedby="request-message-help request-message-count"
                      placeholder="Hello, I would like help understanding..."
                      disabled={submittingRequest}
                      className="mt-2 w-full resize-y rounded-lg border border-[#d8cec5] bg-white px-3 py-2.5 text-sm leading-6 text-[#282321] outline-none transition placeholder:text-[#a39a94] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10 disabled:bg-[#faf8f6]"
                    />
                    <div className="mt-1 flex justify-end"><p id="request-message-count" className="text-[11px] text-[#8a7f7a]" aria-live="polite">{requestMessage.length}/1000</p></div>
                  </div>

                  {requestSubmitError && (
                    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
                      <p className="text-sm font-semibold text-red-800">Request not submitted</p>
                      <p className="mt-1 text-xs leading-5 text-red-700">{requestSubmitError}</p>
                    </div>
                  )}

                  <div className="border-y border-[#efe8e1] py-3">
                    <p className="text-xs leading-5 text-[#6d6260]">Sending this request does not confirm a tutoring session. The Academic Mate must respond before arrangements can be finalised.</p>
                  </div>

                  <div className="flex flex-col-reverse gap-2 border-t border-[#eee7df] pt-4 sm:flex-row sm:justify-end">
                    <button type="button" disabled={submittingRequest} onClick={() => requestDialogRef.current?.close()} className="min-h-10 rounded-lg border border-[#d8cec5] bg-white px-4 py-2.5 text-sm font-semibold text-[#4b423e] transition hover:bg-[#faf8f6] disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
                    <button type="submit" disabled={submittingRequest} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#7d1f2a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#681923] disabled:cursor-not-allowed disabled:opacity-60">
                      {submittingRequest && <Spinner />}
                      {submittingRequest ? "Sending request..." : "Send request"}
                    </button>
                  </div>
                </form>
              ) : (
                <div aria-live="polite" className="space-y-4">
                  <div className="border-y border-emerald-200 bg-emerald-50 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 ring-1 ring-emerald-200">
                        <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-emerald-900">Request submitted</h3>
                        <p className="mt-1 text-sm leading-6 text-emerald-800">{requestSuccess}</p>
                        <p className="mt-2 text-xs leading-5 text-emerald-800">This is a request, not a confirmed session. You can check its status from your student dashboard.</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse gap-2 border-t border-[#eee7df] pt-4 sm:flex-row sm:justify-end">
                    <button type="button" onClick={() => requestDialogRef.current?.close()} className="min-h-10 rounded-lg border border-[#d8cec5] bg-white px-4 py-2.5 text-sm font-semibold text-[#4b423e] transition hover:bg-[#faf8f6]">Done</button>
                    <Link href="/student/dashboard" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#7d1f2a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#681923]">View dashboard</Link>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </dialog>
    </main>
  );
}