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
  topics: Array<{ id: string; name: string; description: string | null }>;
  academicMate: {
    id: string;
    headline: string | null;
    bio: string | null;
    teachingExperience: string | null;
    yearsExperience: number | null;
    verificationStatus: string;
    user: { id: string; name: string; image: string | null };
    studentProfile: {
      programme: {
        department: { id: string; code: string; name: string } | null;
      } | null;
    } | null;
  };
  existingRequest: {
    id: string;
    status: string;
  } | null;
};

type ExistingRequest = { id: string; status: string };
type MatchingResponse = { academicMates: AcademicMateOffering[]; matchedCourses: Course[]; mode?: "suggestions" | "search"; error?: string };
type RequestResponse = { message?: string; error?: string; request?: { id: string; status: string } };

function profileHref(mateId: string) {
  return `/student/academic-mate/${encodeURIComponent(mateId)}`;
}

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

/* Card animations. Motion is switched off for people who prefer reduced motion. */
const CARD_STYLES = `
@keyframes mc-rise{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}
@keyframes mc-tick{to{stroke-dashoffset:0}}
@keyframes mc-gshift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes mc-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
.mc-rise{animation:mc-rise .55s cubic-bezier(.2,.8,.2,1) backwards}
.mc-tick{stroke-dasharray:1;stroke-dashoffset:1;animation:mc-tick .6s ease .5s forwards}
.mc-ring{background:linear-gradient(120deg,#7d1f2a,#f5b324,#7d1f2a);background-size:100% 100%}
.mc-skel{background:linear-gradient(90deg,#f1ebe5 25%,#f8f4f0 50%,#f1ebe5 75%);background-size:200% 100%;animation:mc-shimmer 1.4s linear infinite}
.mc-noscroll{scrollbar-width:none;-ms-overflow-style:none}
.mc-noscroll::-webkit-scrollbar{display:none}
@media (prefers-reduced-motion:reduce){.mc-rise{animation:none}.mc-tick{animation:none;stroke-dashoffset:0}.mc-skel{animation:none}}
`;

type IconName = "clock" | "award" | "building" | "check" | "search" | "sliders" | "arrow";

function Icon({ name, className = "h-3.5 w-3.5" }: { name: IconName; className?: string }) {
  const props = {
    "aria-hidden": true as const,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  switch (name) {
    case "clock":
      return (<svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
    case "award":
      return (<svg {...props}><circle cx="12" cy="9" r="5" /><path d="m8.5 13.5-1.5 7 5-3 5 3-1.5-7" /></svg>);
    case "building":
      return (<svg {...props}><path d="M4 21V5l8-2v18M12 9h8v12M3 21h18" /></svg>);
    case "check":
      return (<svg {...props} strokeWidth={2}><path d="m5 12 4 4L19 6" /></svg>);
    case "search":
      return (<svg {...props} strokeWidth={1.75}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>);
    case "sliders":
      return (<svg {...props}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>);
    case "arrow":
      return (<svg {...props} strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
  }
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
    // eslint-disable-next-line @next/next/no-img-element
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
    <div className="flex items-baseline justify-between gap-6 border-b border-[#efe8e1] py-1.5">
      <dt className="shrink-0 text-xs text-[#8a7f7a]">{label}</dt>
      <dd className="min-w-0 text-right text-xs leading-5 text-[#282321]">{children}</dd>
    </div>
  );
}

function ProseBlock({ title, text }: { title: string; text: string }) {
  return (
    <section className="border-b border-[#efe8e1] py-3">
      <h3 className="text-xs font-semibold text-[#8a7f7a]">{title}</h3>
      <p className="mt-1 whitespace-pre-line text-xs leading-6 text-[#4b423e]">{text}</p>
    </section>
  );
}

function SkeletonCard() {
  return (
    <div aria-hidden="true" className="rounded-xl border border-[#e4dbd3] bg-white p-5">
      <div className="flex items-start gap-3.5">
        <div className="mc-skel h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2.5">
          <div className="mc-skel h-4 w-1/3 rounded" />
          <div className="mc-skel h-3 w-1/2 rounded" />
          <div className="mc-skel h-3 w-2/3 rounded" />
          <div className="mc-skel h-9 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/**
 * The whole card is clickable (stretched link on the name). Anything interactive inside the card
 * (Details / Cancel / Request) sits on `relative z-10` so it keeps working on its own.
 */
function OfferingRow({
    offering,
    index,
    requestSent,
    canCancel,
    cancelling,
    cancelError,
    onOpenDetails,
    onOpenRequest,
    onCancelRequest,
  }: {
    offering: AcademicMateOffering;
    index: number;
    requestSent: boolean;
    canCancel: boolean;
    cancelling: boolean;
    cancelError: string | null;
    onOpenDetails: (offering: AcademicMateOffering) => void;
    onOpenRequest: (offering: AcademicMateOffering) => void;
    onCancelRequest: (offering: AcademicMateOffering) => void;
  }) {
    const mate = offering.academicMate;
    const years = mate.yearsExperience;
    const preview = previewText(offering);
    const showYears = years !== null && years > 0;
    const topics = offering.topics.slice(0, 3);
    const extraTopics = offering.topics.length - topics.length;
  
    return (
      <article
        // Reduced outer padding from px-4 py-4 sm:px-5 sm:py-5 to p-3.5
        className="mc-rise relative overflow-hidden rounded-xl border border-[#e4dbd3] bg-white p-3.5 shadow-[0_1px_2px_rgba(40,35,33,0.05),0_10px_24px_-14px_rgba(125,31,42,0.25)]"
        style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
      >
        <div className="flex items-start gap-3">
          <span className="mc-ring mt-0.5 shrink-0 rounded-full p-[2px] shadow-sm">
            {/* Reduced avatar size from h-12 w-12 to h-10 w-10 */}
            <Avatar name={mate.user.name} image={mate.user.image} className="h-10 w-10 ring-2 ring-white" />
          </span>
  
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {/* Reduced font size from [15px] to sm */}
                  <h2 className="text-sm font-semibold text-[#282321]">
                    <Link
                      href={profileHref(mate.id)}
                      aria-label={`View ${mate.user.name}'s profile, ${offering.course.code}`}
                      className="rounded-sm after:absolute after:inset-0 after:z-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[#7d1f2a]/50"
                    >
                      {mate.user.name}
                    </Link>
                  </h2>
                  {mate.verificationStatus && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="mc-tick" />
                      </svg>
                      Verified
                    </span>
                  )}
                </div>
                {mate.headline && <p className="mt-0.5 text-xs font-medium leading-4 text-[#7d1f2a]">{mate.headline}</p>}
                {mate.studentProfile?.programme?.department && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#6d6260]">
                    <Icon name="building" className="h-3 w-3 shrink-0 text-[#9a8f89]" />
                    <span>{mate.studentProfile.programme.department.name}</span>
                  </p>
                )}
              </div>
  
              <div className="shrink-0 text-right">
                {/* Reduced price text size slightly */}
                <p className="text-sm font-bold tabular-nums tracking-tight text-[#7d1f2a]">{formatRate(offering.rate, offering.currency)}</p>
                <p className="mt-0.5 text-[10px] text-[#8a7f7a]">{formatRateType(offering.rateType)}</p>
              </div>
            </div>
  
            <p className="mt-2 text-xs leading-4 text-[#282321]">
              <span className="rounded bg-[#f3ece7] px-1.5 py-0.5 font-semibold text-[#7d1f2a]">{offering.course.code}</span>
              <span className="text-[#6d6260]"> · {offering.course.name}</span>
            </p>
  
            {offering.title && <p className="mt-1 text-xs font-medium leading-4 text-[#4b423e]">{offering.title}</p>}
  
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-[#6d6260]">
              <span className="inline-flex items-center gap-1">
                <Icon name="clock" className="h-3 w-3 text-[#9a8f89]" />
                {formatDuration(offering.sessionDurationMinutes)} session
              </span>
              {showYears && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="award" className="h-3 w-3 text-[#9a8f89]" />
                  {years} {years === 1 ? "yr" : "yrs"} exp
                </span>
              )}
            </div>
  
            {preview && <p className="mt-1.5 line-clamp-1 text-xs leading-4 text-[#5c534f]">{preview}</p>}
  
            {topics.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1" aria-label="Topics covered">
                {topics.map((topic) => (
                  <li key={topic.id} className="rounded-full border border-[#eadfd9] bg-[#fbf8f6] px-2 py-0.5 text-[10px] font-medium text-[#6d6260]">
                    {topic.name}
                  </li>
                ))}
                {extraTopics > 0 && <li className="px-1 py-0.5 text-[10px] font-medium text-[#8a7f7a]">+{extraTopics} more</li>}
              </ul>
            )}
  
            {offering.rateType === "CUSTOM" && offering.rateDetails && (
              <p className="mt-1 truncate text-[11px] leading-4 text-[#6d6260]" title={offering.rateDetails}>
                <span className="text-[#8a7f7a]">Pricing · </span>
                {offering.rateDetails}
              </p>
            )}
  
            {/* Compact Footer Actions */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[#f1ebe5] pt-2.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenDetails(offering)}
                  aria-haspopup="dialog"
                  aria-label={`Quick details for ${mate.user.name}, ${offering.course.code}`}
                  className="relative z-10 inline-flex min-h-7 items-center text-xs font-semibold text-[#7d1f2a] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"
                >
                  Quick details
                </button>
              </div>
  
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {requestSent && canCancel && (
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => onCancelRequest(offering)}
                    aria-label={`Cancel your request to ${mate.user.name} for ${offering.course.code}`}
                    className="relative z-10 inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#d8cec5] bg-white px-3 py-1.5 text-xs font-semibold text-[#7d1f2a] transition hover:border-[#c9a9ad] hover:bg-[#f8f2f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {cancelling && <Spinner className="h-3 w-3" />}
                    {cancelling ? "Cancelling..." : "Cancel"}
                  </button>
                )}
  
                <button
                  type="button"
                  disabled={requestSent}
                  onClick={() => onOpenRequest(offering)}
                  aria-label={requestSent ? `Request sent to ${mate.user.name}` : `Request academic support from ${mate.user.name}`}
                  className={`relative z-10 inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:cursor-not-allowed ${
                    requestSent
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "bg-gradient-to-r from-[#7d1f2a] to-[#a52a3a] text-white shadow-sm shadow-[#7d1f2a]/25 hover:shadow-md active:scale-95 motion-reduce:active:scale-100"
                  }`}
                >
                  {requestSent ? (
                    <>
                      <Icon name="check" className="h-3.5 w-3.5" />
                      Sent
                    </>
                  ) : (
                    "Request"
                  )}
                </button>
              </div>
            </div>
  
            {cancelError && (
              <p role="alert" className="relative z-10 mt-1.5 text-right text-[11px] leading-4 text-red-700">{cancelError}</p>
            )}
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
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [durationFilter, setDurationFilter] = useState("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedOffering, setSelectedOffering] = useState<AcademicMateOffering | null>(null);
  const [detailsOffering, setDetailsOffering] = useState<AcademicMateOffering | null>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestSubmitError, setRequestSubmitError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [requestedOfferingIds, setRequestedOfferingIds] = useState<Set<string>>(new Set());
  const [requestsByOffering, setRequestsByOffering] = useState<Record<string, ExistingRequest>>({});
  const [cancellingOfferingId, setCancellingOfferingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<{ offeringId: string; message: string } | null>(null);

  const requestDialogRef = useRef<HTMLDialogElement>(null);
  const detailsDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAcademicMates() {
      try {
        setLoading(true);
        setError(null);

        const query = search.trim();
        const url = query
          ? `/api/student/academic-mates?q=${encodeURIComponent(query)}`
          : "/api/student/academic-mates";

        const response = await fetch(url, {
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
        setRequestsByOffering(
          Object.fromEntries(
            offerings.flatMap((offering) =>
              offering.existingRequest ? [[offering.offeringId, offering.existingRequest] as const] : [],
            ),
          ),
        );
        setCancelError(null);
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

    const debounce = window.setTimeout(() => {
      void loadAcademicMates();
    }, search.trim() ? 300 : 0);

    return () => {
      window.clearTimeout(debounce);
      controller.abort();
    };
  }, [retryCount, search]);

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
    const minimum = minPrice.trim() === "" ? null : Number(minPrice);
    const maximum = maxPrice.trim() === "" ? null : Number(maxPrice);

    return data.academicMates.filter((offering) => {
      const matchesCourse = selectedCourseId === "ALL" || offering.course.id === selectedCourseId;

      const searchableText = [
        offering.course.code,
        offering.course.name,
        offering.title,
        offering.description,
        offering.academicMate.user.name,
        offering.academicMate.headline,
        offering.academicMate.studentProfile?.programme?.department?.name,
        offering.academicMate.studentProfile?.programme?.department?.code,
        offering.academicMate.bio,
        offering.academicMate.teachingExperience,
        ...offering.topics.map((topic) => topic.name),
        ...offering.topics.map((topic) => topic.description),
      ].filter(Boolean).join(" ").toLowerCase();

      const matchesQuery = !query || searchableText.includes(query);

      const price = Number(offering.rate);
      const matchesMinPrice = minimum === null || (Number.isFinite(price) && price >= minimum);
      const matchesMaxPrice = maximum === null || (Number.isFinite(price) && price <= maximum);

      const duration = offering.sessionDurationMinutes;
      const matchesDuration =
        durationFilter === "ALL" ||
        (durationFilter === "UP_TO_30" && duration <= 30) ||
        (durationFilter === "31_TO_60" && duration >= 31 && duration <= 60) ||
        (durationFilter === "61_TO_90" && duration >= 61 && duration <= 90) ||
        (durationFilter === "OVER_90" && duration > 90);

      return matchesCourse && matchesQuery && matchesMinPrice && matchesMaxPrice && matchesDuration;
    });
  }, [data, search, selectedCourseId, minPrice, maxPrice, durationFilter]);

  const activeFilterCount =
    (selectedCourseId !== "ALL" ? 1 : 0) + (minPrice !== "" ? 1 : 0) + (maxPrice !== "" ? 1 : 0) + (durationFilter !== "ALL" ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0 || search.trim() !== "";

  function clearFilters() {
    setSearch("");
    setSelectedCourseId("ALL");
    setMinPrice("");
    setMaxPrice("");
    setDurationFilter("ALL");
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

      const submittedOfferingId = selectedOffering.offeringId;
      setRequestedOfferingIds((previous) => {
        const updated = new Set(previous);
        updated.add(submittedOfferingId);
        return updated;
      });

      if (body.request) {
        const createdRequest = { id: body.request.id, status: body.request.status };
        setRequestsByOffering((previous) => ({ ...previous, [submittedOfferingId]: createdRequest }));
      }

      setCancelError(null);
      setRequestSuccess(body.message || "Your academic support request has been submitted.");
    } catch (err) {
      setRequestSubmitError(err instanceof Error ? err.message : "Unable to submit your request. Please try again.");
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function handleCancelRequest(offering: AcademicMateOffering) {
    const request = requestsByOffering[offering.offeringId];
    if (!request || cancellingOfferingId) return;

    const confirmed = window.confirm(
      request.status === "ACCEPTED"
        ? "Cancel this accepted request? You can no longer book a session from it."
        : "Cancel this academic support request?",
    );
    if (!confirmed) return;

    setCancellingOfferingId(offering.offeringId);
    setCancelError(null);

    try {
      const response = await fetch(`/api/student/mate-requests/${encodeURIComponent(request.id)}`, {
        method: "PATCH",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCELLED" }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to cancel this request.");

      // The request no longer exists as a pending one, so the card goes back to "Request".
      setRequestedOfferingIds((previous) => {
        const updated = new Set(previous);
        updated.delete(offering.offeringId);
        return updated;
      });
      setRequestsByOffering((previous) => {
        const updated = { ...previous };
        delete updated[offering.offeringId];
        return updated;
      });
    } catch (err) {
      setCancelError({
        offeringId: offering.offeringId,
        message: err instanceof Error ? err.message : "Unable to cancel this request.",
      });
    } finally {
      setCancellingOfferingId(null);
    }
  }

  const detailsRequestSent = detailsOffering ? requestedOfferingIds.has(detailsOffering.offeringId) : false;

  const fieldClass =
    "h-11 w-full rounded-lg border border-[#d8cec5] bg-white px-3 text-base text-[#282321] shadow-sm outline-none transition placeholder:text-[#a39a94] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10 sm:h-10 sm:text-sm";

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#f9f8f6] px-4 py-6 sm:px-6 lg:px-8">
      <style>{CARD_STYLES}</style>

      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-[#282321] sm:text-3xl">Find an Academic Mate</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d6260]">
            Compare course offerings, experience and rates. Tap a card to see the full profile.
          </p>
        </header>

        {/* ---------- search ---------- */}
        <section className="mb-4" aria-label="Search Academic Mates">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="mate-search" className="sr-only">Search Academic Mates</label>
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a7f7a]"><Icon name="search" className="h-4 w-4" /></span>
              <input
                id="mate-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, course, topic or department"
                className={`${fieldClass} h-12 rounded-xl pl-10 pr-4 sm:h-12`}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="filter-panel"
              className={`relative inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm transition lg:hidden ${
                showFilters || activeFilterCount > 0 ? "border-[#7d1f2a]/40 bg-[#f8f2f0] text-[#7d1f2a]" : "border-[#d8cec5] bg-white text-[#4b423e]"
              }`}
            >
              <Icon name="sliders" className="h-4 w-4" />
              <span className="hidden min-[400px]:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#7d1f2a] px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>
              )}
            </button>
          </div>

          {/* Course chips: scroll sideways on mobile */}
          {(data?.matchedCourses.length ?? 0) > 0 && (
            <div className="mc-noscroll -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by course">
              {[{ id: "ALL", code: "All courses", name: "" }, ...(data?.matchedCourses ?? [])].map((course) => {
                const active = selectedCourseId === course.id;
                return (
                  <button
                    key={course.id}
                    type="button"
                    aria-pressed={active}
                    title={course.name || undefined}
                    onClick={() => setSelectedCourseId(course.id)}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                      active ? "border-[#7d1f2a] bg-[#7d1f2a] text-white shadow-sm" : "border-[#e4dbd3] bg-white text-[#4b423e] hover:border-[#d8c2c5] hover:bg-[#fbf8f6]"
                    }`}
                  >
                    {course.code}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className="lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-8">
          {/* ---------- filters (sidebar on desktop, drawer-style panel on mobile) ---------- */}
          <aside
            id="filter-panel"
            aria-label="Price and duration filters"
            className={`${showFilters ? "block" : "hidden"} mb-5 rounded-xl border border-[#e4dbd3] bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:mb-0 lg:block`}
          >
            <h2 className="text-sm font-semibold text-[#282321]">Filters</h2>

            <fieldset className="mt-4">
              <legend className="text-xs font-semibold text-[#6d6260]">Price</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="min-price" className="sr-only">Minimum price</label>
                  <input id="min-price" type="number" min="0" step="any" inputMode="decimal" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="Min" className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="max-price" className="sr-only">Maximum price</label>
                  <input id="max-price" type="number" min="0" step="any" inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Max" className={fieldClass} />
                </div>
              </div>
            </fieldset>

            <div className="mt-4">
              <label htmlFor="duration-filter" className="text-xs font-semibold text-[#6d6260]">Session length</label>
              <select id="duration-filter" value={durationFilter} onChange={(event) => setDurationFilter(event.target.value)} className={`${fieldClass} mt-2`}>
                <option value="ALL">Any length</option>
                <option value="UP_TO_30">30 minutes or less</option>
                <option value="31_TO_60">31 to 60 minutes</option>
                <option value="61_TO_90">61 to 90 minutes</option>
                <option value="OVER_90">Over 90 minutes</option>
              </select>
            </div>

            {hasAnyFilter && (
              <button type="button" onClick={clearFilters} className="mt-4 w-full rounded-lg border border-[#e4dbd3] py-2 text-xs font-semibold text-[#7d1f2a] transition hover:bg-[#f8f2f0]">
                Clear all filters
              </button>
            )}
          </aside>

          {/* ---------- results ---------- */}
          <section aria-label="Academic Mate results" className="min-w-0">
            {!loading && !error && (
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#282321]">
                    {search.trim() ? `Search results for “${search.trim()}”` : "Suggested"}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-[#6d6260]">
                    {search.trim()
                      ? "Results can include courses outside your current enrolment."
                      : "Based on courses you are enrolled in or repeating. Search to discover others."}
                  </p>
                </div>
                <p className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold tabular-nums text-[#7d1f2a] shadow-sm ring-1 ring-[#eadfd9]" aria-live="polite">
                  {filteredOfferings.length} {filteredOfferings.length === 1 ? "offering" : "offerings"}
                </p>
              </div>
            )}

            {loading && (
              <div role="status" className="space-y-4">
                <span className="sr-only">Loading Academic Mates...</span>
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
              </div>
            )}

            {!loading && error && (
              <div role="alert" className="rounded-xl border border-[#e4dbd3] bg-white px-5 py-14 text-center shadow-sm">
                <h2 className="text-base font-semibold text-[#282321]">Unable to load results</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#6d6260]">{error}</p>
                <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="mt-5 rounded-lg bg-[#7d1f2a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#681923]">Try again</button>
              </div>
            )}

            {!loading && !error && filteredOfferings.length === 0 && (
              <div className="rounded-xl border border-[#e4dbd3] bg-white px-5 py-14 text-center shadow-sm">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f4eceb] text-[#7d1f2a]"><Icon name="search" className="h-6 w-6" /></span>
                <h2 className="mt-4 text-base font-semibold text-[#282321]">{data && data.academicMates.length > 0 ? "No matching results" : "No Academic Mate matches yet"}</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#6d6260]">
                  {data && data.academicMates.length > 0 ? "Try a different search term, or loosen your filters." : "There are currently no verified Academic Mate offerings matching your courses. Check back later, or search for another course."}
                </p>
                {hasAnyFilter && (
                  <button type="button" onClick={clearFilters} className="mt-4 text-sm font-semibold text-[#7d1f2a] hover:underline">Clear filters</button>
                )}
              </div>
            )}

            {!loading && !error && filteredOfferings.length > 0 && (
              <div className="space-y-4">
                {filteredOfferings.map((offering, index) => (
                  <OfferingRow
                    key={offering.offeringId}
                    offering={offering}
                    index={index}
                    requestSent={requestedOfferingIds.has(offering.offeringId)}
                    canCancel={
                      requestsByOffering[offering.offeringId]?.status === "REQUESTED" ||
                      requestsByOffering[offering.offeringId]?.status === "ACCEPTED"
                    }
                    cancelling={cancellingOfferingId === offering.offeringId}
                    cancelError={cancelError?.offeringId === offering.offeringId ? cancelError.message : null}
                    onOpenDetails={openDetailsDialog}
                    onOpenRequest={openRequestDialog}
                    onCancelRequest={(target) => void handleCancelRequest(target)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ---------- details dialog ---------- */}
      <dialog
        ref={detailsDialogRef}
        aria-labelledby="details-dialog-title"
        onClose={handleDetailsDialogClose}
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-[#e4dbd3] bg-white p-0 text-[#282321] shadow-xl backdrop:bg-black/50"
      >
        {detailsOffering && (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-[#efe8e1] px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar name={detailsOffering.academicMate.user.name} image={detailsOffering.academicMate.user.image} className="h-10 w-10" />
                <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                <h2 id="details-dialog-title" className="text-base font-semibold tracking-tight text-[#282321]">
                    {detailsOffering.academicMate.user.name}
                </h2>
                {detailsOffering.academicMate.verificationStatus && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <Icon name="check" className="h-3 w-3" />
                    Verified
                    </span>
                )}
                </div>
                  {detailsOffering.academicMate.headline && <p className="mt-1 text-xs leading-5 text-[#7d1f2a]">{detailsOffering.academicMate.headline}</p>}
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6d6260]">
                    
                    {detailsOffering.academicMate.yearsExperience !== null && detailsOffering.academicMate.yearsExperience > 0 && (
                      <>
                        <span aria-hidden="true" className="h-3 w-px bg-[#e4dbd3]" />
                        <span>{detailsOffering.academicMate.yearsExperience} {detailsOffering.academicMate.yearsExperience === 1 ? "year" : "years"} of experience</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button type="button" aria-label="Close details" onClick={() => detailsDialogRef.current?.close()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6d6260] transition hover:bg-[#f6f1ec] hover:text-[#282321]">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div className="px-5 sm:px-6">
              <dl className="border-b border-[#efe8e1]">
                <SpecRow label="Course">
                  <span className="text-sm">{detailsOffering.course.code}</span>
                  <span className="text-[#6d6260]"> · {detailsOffering.course.name}</span>
                </SpecRow>
                {detailsOffering.academicMate.studentProfile?.programme?.department && (
                  <SpecRow label="Department">{detailsOffering.academicMate.studentProfile.programme.department.name}</SpecRow>
                )}
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

            <div className="flex flex-col-reverse gap-2 border-t border-[#efe8e1] px-5 py-4 sm:flex-row sm:items-center sm:px-6">
              <Link href={profileHref(detailsOffering.academicMate.id)} className="inline-flex min-h-10 items-center justify-center gap-1.5 text-xs font-semibold text-[#7d1f2a] hover:underline sm:mr-auto">
                View full profile
              </Link>
              <button type="button" onClick={() => detailsDialogRef.current?.close()} className="min-h-10 rounded-lg border border-[#d8cec5] bg-white px-4 py-2.5 text-sm font-semibold text-[#4b423e] transition hover:bg-[#faf8f6]">Close</button>
              <button
                type="button"
                disabled={detailsRequestSent}
                onClick={requestFromDetails}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
                  detailsRequestSent ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-[#7d1f2a] text-white hover:bg-[#681923]"
                }`}
              >
                {detailsRequestSent ? (
                  <>
                    <Icon name="check" className="h-3 w-3" />
                   Request Sent
                  </>
                ) : (
                  "Request academic support"
                )}
              </button>
            </div>
          </>
        )}
      </dialog>

      {/* ---------- request dialog ---------- */}
      <dialog
        ref={requestDialogRef}
        aria-labelledby="request-dialog-title"
        onClose={handleRequestDialogClose}
        onCancel={(event) => { if (submittingRequest) event.preventDefault(); }}
        onClick={(event) => { if (event.target === event.currentTarget && !submittingRequest) event.currentTarget.close(); }}
        className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-[#e2d9d0] bg-white p-0 text-[#282321] shadow-2xl backdrop:bg-black/50"
        >
        {selectedOffering && (
            <>
            {/* Compact Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#eee7df] px-4 py-3">
                <div>
                <h2 id="request-dialog-title" className="text-base font-semibold tracking-tight text-[#282321]">Request academic support</h2>
                <p className="mt-0.5 text-xs text-[#6d6260]">Send an enquiry to <span className="font-semibold text-[#282321]">{selectedOffering.academicMate.user.name}</span>.</p>
                </div>
                <button
                type="button"
                aria-label="Close request form"
                disabled={submittingRequest}
                onClick={() => requestDialogRef.current?.close()}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#6d6260] transition hover:bg-[#f6f1ec] hover:text-[#282321] disabled:opacity-50"
                >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
                </button>
            </div>

            <div className="space-y-3 px-4 py-3">
                {/* Compact Selected Offering Section */}
                <section aria-label="Selected offering" className="rounded-lg border border-[#efe8e1] bg-[#fbf8f6] p-2.5">
                <div className="flex items-start justify-between gap-2">
                    <div>
                    <p className="text-[11px] font-semibold text-[#7d1f2a]">{selectedOffering.course.code}</p>
                    <h3 className="text-xs font-semibold text-[#282321]">{selectedOffering.course.name}</h3>
                    {selectedOffering.title && <p className="mt-0.5 text-[11px] text-[#6d6260]">{selectedOffering.title}</p>}
                    </div>
                    <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-[#282321]">{formatRate(selectedOffering.rate, selectedOffering.currency)}</p>
                    <p className="text-[10px] text-[#6d6260]">{formatRateType(selectedOffering.rateType)}</p>
                    </div>
                </div>
                </section>

                {!requestSuccess ? (
                <form onSubmit={(event) => void handleSubmitRequest(event)} className="space-y-3">
                    <div>
                    <label htmlFor="request-message" className="text-xs font-semibold text-[#282321]">
                        Message <span className="font-normal text-[#8a7f7a]">(optional)</span>
                    </label>
                    <p id="request-message-help" className="mt-0.5 text-[11px] text-[#6d6260]">
                        Describe the topics you need help with or include relevant details.
                    </p>
                    <textarea
                        id="request-message"
                        name="message"
                        value={requestMessage}
                        onChange={(event) => setRequestMessage(event.target.value)}
                        maxLength={1000}
                        rows={3}
                        aria-describedby="request-message-help request-message-count"
                        placeholder="Hello, I would like help understanding..."
                        disabled={submittingRequest}
                        className="mt-1.5 w-full resize-y rounded-md border border-[#d8cec5] bg-white px-2.5 py-1.5 text-xs leading-5 text-[#282321] outline-none transition placeholder:text-[#a39a94] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10 disabled:bg-[#faf8f6]"
                    />
                    <div className="mt-0.5 flex justify-end">
                        <p id="request-message-count" className="text-[10px] text-[#8a7f7a]" aria-live="polite">
                        {requestMessage.length}/1000
                        </p>
                    </div>
                    </div>

                    {requestSubmitError && (
                    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5">
                        <p className="text-xs font-semibold text-red-800">Request not submitted</p>
                        <p className="mt-0.5 text-[11px] leading-4 text-red-700">{requestSubmitError}</p>
                    </div>
                    )}

                    <div className="border-t border-[#efe8e1] pt-2">
                    <p className="text-[11px] leading-4 text-[#6d6260]">
                        Sending this request does not confirm a session. The Academic Mate must respond first.
                    </p>
                    </div>

                    {/* Compact Action Buttons */}
                    <div className="flex flex-col-reverse gap-1.5 border-t border-[#eee7df] pt-3 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        disabled={submittingRequest}
                        onClick={() => requestDialogRef.current?.close()}
                        className="min-h-8 rounded-md border border-[#d8cec5] bg-white px-3 py-1.5 text-xs font-semibold text-[#4b423e] transition hover:bg-[#faf8f6] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={submittingRequest}
                        className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md bg-[#7d1f2a] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#681923] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {submittingRequest && <Spinner className="h-3 w-3" />}
                        {submittingRequest ? "Sending..." : "Send request"}
                    </button>
                    </div>
                </form>
                ) : (
                <div aria-live="polite" className="space-y-3">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex items-start gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 ring-1 ring-emerald-200">
                        <Icon name="check" className="h-3.5 w-3.5" />
                        </span>
                        <div>
                        <h3 className="text-xs font-semibold text-emerald-900">Request submitted</h3>
                        <p className="mt-0.5 text-xs leading-4 text-emerald-800">{requestSuccess}</p>
                        <p className="mt-1.5 text-[11px] leading-4 text-emerald-800">
                            You can check its status from your student dashboard.
                        </p>
                        </div>
                    </div>
                    </div>
                    
                    {/* Success Footer Buttons */}
                    <div className="flex flex-col-reverse gap-1.5 border-t border-[#eee7df] pt-3 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={() => requestDialogRef.current?.close()}
                        className="min-h-8 rounded-md border border-[#d8cec5] bg-white px-3 py-1.5 text-xs font-semibold text-[#4b423e] transition hover:bg-[#faf8f6]"
                    >
                        Done
                    </button>
                    <Link
                        href="/student/dashboard"
                        className="inline-flex min-h-8 items-center justify-center rounded-md bg-[#7d1f2a] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#681923]"
                    >
                        View dashboard
                    </Link>
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