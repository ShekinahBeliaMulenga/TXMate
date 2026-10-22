"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SessionRequestDialog from "@/components/student/session-request-dialog";

type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
type AcademicMateStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
type MateOfferingStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type MateOfferingRateType = "PER_SESSION" | "PER_HOUR" | "PER_WEEK" | "PER_MONTH" | "PER_COURSE" | "CUSTOM";
type Weekday = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
type StudentStatus = "ACTIVE" | "GRADUATED" | "SUSPENDED" | "WITHDRAWN";
type RequestStatus = "REQUESTED" | "ACCEPTED";

type Offering = {
  id: string;
  course: { id: string; code: string; name: string; description: string | null };
  title: string | null;
  description: string | null;
  rate: string;
  currency: string;
  sessionDurationMinutes: number;
  rateType: MateOfferingRateType;
  rateDetails: string | null;
  status: MateOfferingStatus;
  verificationStatus: VerificationStatus;
  topics: Array<{ id: string; name: string; description: string | null }>;
  isOutsideCurrentCurriculum: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProfileResponse = {
  profile: {
    id: string;
    status: AcademicMateStatus;
    verificationStatus: VerificationStatus;
    headline: string | null;
    bio: string | null;
    teachingExperience: string | null;
    yearsExperience: number | null;
    profileVisibility: ProfileVisibility;
    verifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  user: { id: string; name: string; image: string | null };
  student: {
    id: string;
    studentId: string | null;
    gender: "MALE" | "FEMALE";
    status: StudentStatus;
    phoneNumber: string | null;
    bio: string | null;
    profileVisibility: ProfileVisibility;
    university: { id: string; code: string; name: string; slug: string };
    school: { id: string; code: string; name: string };
    department: { id: string; code: string; name: string } | null;
    programme: { id: string; code: string; name: string; level: string; durationYears: number };
    programmeYear: { id: string; yearNumber: number };
    courses: Array<{
      id: string; semester: number | null; status: string;
      academicYear: { id: string; name: string; isCurrent: boolean };
      course: { id: string; code: string; name: string; description: string | null; credits: number | null };
    }>;
  } | null;
  offerings: Offering[];
  availability: Array<{
    id: string; mateOfferingId: string; day: Weekday;
    startMinute: number; endMinute: number; timezone: string; isActive: boolean;
  }>;
  experiences: Array<{
    id: string; title: string; organisation: string | null; description: string | null;
    startYear: number | null; endYear: number | null; createdAt: string; updatedAt: string;
  }>;
  qualifications: Array<{
    id: string; name: string; issuer: string | null; year: number | null;
    credentialUrl: string | null; createdAt: string; updatedAt: string;
  }>;
  reviews: Array<{
    id: string; rating: number; comment: string | null; createdAt: string;
    reviewerUser: { id: string; name: string; image: string | null };
  }>;
  statistics: {
    totalOfferings: number; totalAvailabilitySlots: number; totalExperiences: number;
    totalQualifications: number; totalReviews: number; averageRating: number | null;
  };
  viewer: { signedIn: boolean; canRequest: boolean; isOwner: boolean };
  requestsByOffering: Record<string, { id: string; status: RequestStatus; hasSession: boolean }>;
};

type ApiError = { error?: string; message?: string };

const statusLabel: Record<AcademicMateStatus, string> = { ACTIVE: "Active", INACTIVE: "Inactive", SUSPENDED: "Suspended" };
const statusDot: Record<AcademicMateStatus, string> = { ACTIVE: "bg-emerald-500", INACTIVE: "bg-stone-400", SUSPENDED: "bg-amber-500" };
const verificationLabel: Record<VerificationStatus, string> = { UNVERIFIED: "Unverified", PENDING: "Verification pending", VERIFIED: "Verified", REJECTED: "Verification rejected" };
const verificationStyle: Record<VerificationStatus, string> = {
  UNVERIFIED: "bg-stone-100 text-stone-700 ring-stone-200",
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  VERIFIED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-red-50 text-red-800 ring-red-200",
};
const rateTypeLabel: Record<MateOfferingRateType, string> = {
  PER_SESSION: "per session", PER_HOUR: "per hour", PER_WEEK: "per week",
  PER_MONTH: "per month", PER_COURSE: "per course", CUSTOM: "Custom rate",
};
const weekdayLabel: Record<Weekday, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday",
  FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday",
};
const weekdayOrder: Weekday[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const iconPaths = {
  user: "M12 14.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm7.25 5.25a7.25 7.25 0 0 0-14.5 0",
  book: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25",
  university: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
  clock: "M12 6v6l4 2m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  star: "m12 3 2.781 5.633 6.219.904-4.5 4.389 1.062 6.194L12 17.2l-5.562 2.92L7.5 13.926 3 9.537l6.219-.904L12 3Z",
  briefcase: "M9 7.5V6a3 3 0 0 1 3-3 3 3 0 0 1 3 3v1.5m-12 0h18v10.125A2.375 2.375 0 0 1 18.625 20h-13.25A2.375 2.375 0 0 1 3 17.625V7.5Zm0 4.5h18M9.75 12v1.5h4.5V12",
  certificate: "M12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Zm0 0v5.25m0 0-2.25-1.5-2.25 1.5V15.75m9-12v4.5m0-4.5h4.5m-4.5 0H12",
  check: "m5 12 4 4L19 6",
  shield: "M12 3 5.25 6v5.25c0 4.15 2.82 7.94 6.75 9 3.93-1.06 6.75-4.85 6.75-9V6L12 3Z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  tag: "M4.5 7.5V4.75A1.75 1.75 0 0 1 6.25 3h2.9c.464 0 .91.184 1.238.512l9.1 9.1a1.75 1.75 0 0 1 0 2.475l-4.4 4.4a1.75 1.75 0 0 1-2.475 0l-9.1-9.1A1.75 1.75 0 0 1 3 9.15v-1.65Z",
  info: "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z",
} as const;
type IconName = keyof typeof iconPaths;

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>;
}
function Section({ title, subtitle, aside, icon, children }: { title: string; subtitle?: string; aside?: ReactNode; icon: IconName; children: ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm">
    <div className="flex items-center justify-between gap-4 border-b border-[#ece5de] bg-[#fbf9f7] px-5 py-3.5 sm:px-6">
      <div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-[#7d1f2a]"><Icon name={icon} className="h-4 w-4" /></span>
        <div><h2 className="text-[15px] font-semibold text-[#282321]">{title}</h2>{subtitle ? <p className="mt-0.5 text-xs text-[#7a6f6a]">{subtitle}</p> : null}</div>
      </div>{aside}
    </div>
    <div className="px-5 py-5 sm:px-6">{children}</div>
  </section>;
}
function Empty({ text }: { text: string }) { return <p className="text-sm text-[#7a6f6a]">{text}</p>; }
function Field({ label, value }: { label: string; value: string | null }) {
  return <div><h3 className="text-xs font-medium text-[#7a6f6a]">{label}</h3><p className={`mt-1 max-w-prose whitespace-pre-wrap text-sm leading-6 ${value ? "text-[#3f3734]" : "text-[#7a6f6a]"}`}>{value || "Not added yet."}</p></div>;
}
function Stars({ rating }: { rating: number }) {
  return <span className="inline-flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, index) => <Icon key={index} name="star" className={`h-4 w-4 ${index < rating ? "fill-amber-500 text-amber-500" : "text-[#d8cec5]"}`} />)}</span>;
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "TM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60), mins = minutes % 60;
  return `${hours % 12 || 12}:${String(mins).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}
function formatDuration(minutes: number) { return `${minutes} min session`; }
function formatRateType(type: MateOfferingRateType) { return rateTypeLabel[type]; }
function formatStatus(status: string) { return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " "); }
function yearsLabel(years: number | null) { return years === null ? "Not specified" : `${years} ${years === 1 ? "year" : "years"}`; }

export default function PublicAcademicMateProfilePage() {
  const params = useParams<{ profileId: string }>();
  const profileId = params.profileId;
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyOfferingId, setBusyOfferingId] = useState<string | null>(null);
  const [requestingOffering, setRequestingOffering] = useState<Offering | null>(null);

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/student/academic-mates/${encodeURIComponent(profileId)}`, {
      method: "GET", headers: { Accept: "application/json" }, cache: "no-store", signal,
    });
    const body = await response.json().catch(() => ({} as ApiError));
    if (!response.ok) throw new Error((body as ApiError).error || "Unable to load this Academic Mate profile.");
    setData(body as ProfileResponse);
  }, [profileId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);
    loadProfile(controller.signal)
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load this Academic Mate profile.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadProfile]);

  const sortedOfferings = useMemo(() => data ? [...data.offerings].sort((a, b) => a.course.code.localeCompare(b.course.code)) : [], [data]);
  const sortedAvailability = useMemo(() => data ? [...data.availability].sort((a, b) => weekdayOrder.indexOf(a.day) - weekdayOrder.indexOf(b.day) || a.startMinute - b.startMinute) : [], [data]);
  const groupedAvailability = useMemo(() => {
    const groups = new Map<Weekday, ProfileResponse["availability"]>();
    sortedAvailability.forEach((slot) => groups.set(slot.day, [...(groups.get(slot.day) ?? []), slot]));
    return groups;
  }, [sortedAvailability]);
  const offeringById = useMemo(() => new Map((data?.offerings ?? []).map((offering) => [offering.id, offering])), [data]);

  function handleRequest(offering: Offering) {
    if (!data?.viewer.canRequest || busyOfferingId) return;
    setActionError(null);
    setRequestingOffering(offering);
  }

  async function handleCancel(offering: Offering) {
    const request = data?.requestsByOffering[offering.id];
    if (!request || request.hasSession || busyOfferingId) return;
    setBusyOfferingId(offering.id);
    setActionError(null);
    try {
      const response = await fetch(`/api/student/mate-requests/${encodeURIComponent(request.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "CANCELLED" }),
      });
      const body = await response.json().catch(() => ({} as ApiError));
      if (!response.ok) throw new Error((body as ApiError).error || "Unable to cancel the request.");
      setData((current) => {
        if (!current) return current;
        const requestsByOffering = { ...current.requestsByOffering };
        delete requestsByOffering[offering.id];
        return { ...current, requestsByOffering };
      });
      await loadProfile().catch(() => undefined);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to cancel the request.");
    } finally {
      setBusyOfferingId(null);
    }
  }

  if (loading) {
    const block = "animate-pulse rounded-xl border border-[#e2d9d0] bg-white";
    return <main className="min-h-screen bg-[#f4f1ed] px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl">
      <div className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm"><div className="h-32 animate-pulse bg-[#7d1f2a]/70 sm:h-40" /><div className="px-5 pb-6 sm:px-8"><div className="-mt-12 h-24 w-24 animate-pulse rounded-full bg-[#eee7df] ring-4 ring-white sm:-mt-14 sm:h-28 sm:w-28" /><div className="mt-5 h-8 w-56 animate-pulse rounded-lg bg-[#eee7df]" /><div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-[#f1ece7]" /></div></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="space-y-6"><div className={`h-48 ${block}`} /><div className={`h-80 ${block}`} /></div><div className="space-y-6"><div className={`h-64 ${block}`} /><div className={`h-52 ${block}`} /></div></div>
    </div></main>;
  }

  if (error || !data) {
    return <main className="min-h-screen bg-[#f4f1ed] px-4 py-8 sm:px-6 lg:px-8">
      <div role="alert" className="mx-auto max-w-xl rounded-xl border border-[#e2d9d0] bg-white p-10 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-[#282321]">Couldn’t load this Academic Mate profile</h1>
        <p className="mt-3 text-sm leading-6 text-[#6d6260]">{error ?? "This Academic Mate profile could not be loaded."}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-lg bg-[#7d1f2a] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#691923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2">Try again</button>
        <div><Link href="/student/find-academic-mate" className="mt-4 inline-block text-sm font-semibold text-[#7d1f2a] hover:underline">Back to Find Academic Mate</Link></div>
      </div>
    </main>;
  }

  const { profile, user, student, offerings, experiences, qualifications, reviews, statistics, viewer } = data;
  const stats = [
    { label: "Courses supported", value: String(statistics.totalOfferings), icon: "book" as IconName },
    { label: "Average rating", value: statistics.averageRating !== null ? statistics.averageRating.toFixed(1) : "—", icon: "star" as IconName },
    { label: "Reviews", value: String(statistics.totalReviews), icon: "user" as IconName },
    { label: "Experience", value: yearsLabel(profile.yearsExperience), icon: "briefcase" as IconName },
  ];

  return <main className="min-h-screen bg-[#f4f1ed] px-4 py-8 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-6xl">
      <section className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm">
        <div aria-hidden="true" className="relative h-32 overflow-hidden bg-gradient-to-br from-[#8f2433] via-[#7d1f2a] to-[#4f121a] sm:h-40">
          <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full border-[26px] border-white/[0.06]" /><div className="absolute bottom-[-5rem] left-1/3 h-48 w-48 rounded-full border-[22px] border-white/[0.05]" />
        </div>
        <div className="px-5 pb-6 sm:px-8">
          <div className="relative z-10 -mt-12 flex items-end justify-between gap-4 sm:-mt-14">

            <div className="relative inline-block">
              {user.image ? (
                <Image src={user.image} alt={user.name} width={64} height={64} unoptimized className="h-24 w-24 shrink-0 rounded-full bg-white object-cover ring-4 ring-white sm:h-28 sm:w-28" />
              ) : (
                <div aria-hidden="true" className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[#f2e9e4] text-2xl font-semibold text-[#7d1f2a] ring-4 ring-white sm:h-28 sm:w-28 sm:text-3xl">
                  {initials(user.name)}
                </div>
              )}
              
              {/* Facebook-style status dot positioned at bottom-right */}
              <span 
                className={`absolute bottom-1 right-1 block h-4 w-4 rounded-full ring-4 ring-white ${statusDot[profile.status]}`} 
                title={statusLabel[profile.status]}
                aria-label={statusLabel[profile.status]}
              />
            </div> 
          </div>

          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><h1 className="text-2xl font-semibold tracking-tight text-[#282321] sm:text-3xl">{user.name}</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${verificationStyle[profile.verificationStatus]}`}><Icon name={profile.verificationStatus === "VERIFIED" ? "check" : "shield"} className="h-3.5 w-3.5" />{verificationLabel[profile.verificationStatus]}</span>
            </div>
            <p className="mt-1.5 max-w-2xl text-s text-[#3f3734]">{profile.headline || "Academic support and tutoring"}</p>
            {student ? <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#6d6260]">
              <li className="inline-flex items-center gap-1.5"><Icon name="book" className="h-4 w-4 text-[#7d1f2a]" />{student.programme.name}, Year {student.programmeYear.yearNumber}</li>
              <li className="inline-flex items-center gap-1.5"><Icon name="university" className="h-4 w-4 text-[#7d1f2a]" />{student.university.name}</li>
              {student.department && <li className="inline-flex items-center gap-1.5"><Icon name="briefcase" className="h-4 w-4 text-[#7d1f2a]" />{student.department.name}</li>}
            </ul> : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-y divide-[#ece5de] border-t border-[#ece5de] bg-[#fbf9f7] sm:grid-cols-4 sm:divide-y-0">
          {stats.map((stat) => <div key={stat.label} className="flex items-center gap-3 px-5 py-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-[#7d1f2a]"><Icon name={stat.icon} /></span><div className="min-w-0"><dd className="truncate text-lg font-semibold leading-none text-[#282321]">{stat.value}</dd><dt className="mt-1 text-xs text-[#6d6260]">{stat.label}</dt></div></div>)}
        </dl>
      </section>

      {actionError && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700">{actionError}</div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Section title="About" subtitle="Academic support profile" icon="user"><div className="space-y-5"><Field label="Bio" value={profile.bio} /><Field label="Teaching experience" value={profile.teachingExperience} /></div></Section>

          <Section title="Courses I support" subtitle="Academic support offerings" icon="book" aside={<span className="text-xs font-medium text-[#6d6260]">{offerings.length} {offerings.length === 1 ? "course" : "courses"}</span>}>
            {sortedOfferings.length === 0 ? <Empty text="No courses have been added yet." /> : <ul className="space-y-3">
              {sortedOfferings.map((offering) => {
                const request = data.requestsByOffering[offering.id];
                const isBusy = busyOfferingId === offering.id;
                return <li key={offering.id} className="rounded-xl border border-[#e2d9d0] bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex min-w-0 items-baseline gap-2"><span className="shrink-0 text-xs font-bold uppercase tracking-wider text-[#7d1f2a]">{offering.course.code}</span><h3 className="truncate text-sm font-semibold text-[#241f1c]">{offering.course.name}</h3></div>
                    {offering.title && <p className="mt-0.5 truncate text-xs text-[#6b625c]">{offering.title}</p>}</div></div>
                  {offering.description && <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-[#625b55]">{offering.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-[#4e4742]">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#241f1c]"><Icon name="tag" className="h-3.5 w-3.5 text-[#7d1f2a]" />{offering.currency} {offering.rate} · {formatRateType(offering.rateType)}</span>
                    <span className="inline-flex items-center gap-1.5"><Icon name="clock" className="h-3.5 w-3.5 text-[#8a817a]" />{formatDuration(offering.sessionDurationMinutes)}</span>
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{formatStatus(offering.status)}</span>
                  </div>
                  {offering.rateType === "CUSTOM" && offering.rateDetails && <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-[#6b625c]"><Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a817a]" /><span>{offering.rateDetails}</span></p>}
                  {viewer.canRequest && <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[#ece5de] pt-3">
                    {request && !request.hasSession && <button type="button" disabled={isBusy} onClick={() => handleCancel(offering)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[#d8cec5] bg-white px-3.5 py-2 text-xs font-semibold text-[#7d1f2a] transition hover:border-[#c9a9ad] hover:bg-[#f8f2f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{isBusy ? "Working..." : "Cancel request"}</button>}
                    <button type="button" disabled={!!request || isBusy} onClick={() => handleRequest(offering)} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${request ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-[#7d1f2a] text-white shadow-sm shadow-[#7d1f2a]/25 hover:bg-[#681923]"} disabled:opacity-70`}>
                      {request ? <><Icon name="check" className="h-3 w-3" />{request.status === "ACCEPTED" ? "Request accepted" : "Request sent"}</> : isBusy ? "Sending..." : "Request"}
                    </button>
                  </div>}
                  {request?.hasSession && <p className="mt-3 border-t border-[#ece5de] pt-3 text-xs leading-5 text-[#6d6260]">A session has been scheduled for this request. Manage any changes from your sessions page.</p>}
                </li>;
              })}
            </ul>}
          </Section>

          <Section title="Experience" subtitle="Academic and professional experience" icon="briefcase">
            {experiences.length === 0 ? <Empty text="No experience has been added yet." /> : <ul className="divide-y divide-[#ece5de]">{experiences.map((item) => <li key={item.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4"><h3 className="text-sm font-semibold text-[#282321]">{item.title}</h3>{item.startYear !== null && <span className="text-xs text-[#7a6f6a]">{item.startYear} - {item.endYear ?? "Present"}</span>}</div>
              {item.organisation && <p className="mt-0.5 text-sm text-[#6d6260]">{item.organisation}</p>}{item.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#514844]">{item.description}</p>}
            </li>)}</ul>}
          </Section>

          <Section title="Qualifications" subtitle="Academic and professional qualifications" icon="certificate">
            {qualifications.length === 0 ? <Empty text="No qualifications have been added yet." /> : <ul className="divide-y divide-[#ece5de]">{qualifications.map((item) => <li key={item.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4"><h3 className="text-sm font-semibold text-[#282321]">{item.name}</h3>{item.year !== null && <span className="text-xs text-[#7a6f6a]">{item.year}</span>}</div>
              {item.issuer && <p className="mt-0.5 text-sm text-[#6d6260]">{item.issuer}</p>}
              {item.credentialUrl && <a href={item.credentialUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#7d1f2a] hover:underline hover:underline-offset-2">View credential <Icon name="arrow" className="h-3.5 w-3.5" /></a>}
            </li>)}</ul>}
          </Section>

          <Section title="Reviews" subtitle="Feedback from students" icon="star" aside={reviews.length > 0 ? <span className="text-xs font-medium text-[#6d6260]">{reviews.length} {reviews.length === 1 ? "review" : "reviews"}</span> : null}>
            {reviews.length === 0 ? <Empty text="No reviews yet." /> : <ul className="divide-y divide-[#ece5de]">{reviews.map((review) => <li key={review.id} className="flex items-start gap-3.5 py-4 first:pt-0 last:pb-0">
              {review.reviewerUser.image ? <Image src={review.reviewerUser.image} alt={review.reviewerUser.name} width={64} height={64} unoptimized className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2e9e4] text-xs font-semibold text-[#7d1f2a]">{initials(review.reviewerUser.name)}</div>}
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-x-3"><p className="text-sm font-semibold text-[#282321]">{review.reviewerUser.name}</p><p className="text-xs text-[#7a6f6a]">{formatDate(review.createdAt)}</p></div><div className="mt-1"><Stars rating={review.rating} /></div>{review.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#514844]">{review.comment}</p>}</div>
            </li>)}</ul>}
          </Section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:h-fit">
          <Section title="Availability" subtitle="Weekly tutoring times" icon="calendar">
            {groupedAvailability.size === 0 ? <Empty text="No availability has been added yet." /> : <ul className="space-y-3">{weekdayOrder.map((day) => {
              const slots = groupedAvailability.get(day);
              if (!slots?.length) return null;
              return <li key={day} className="flex items-start gap-3"><span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md bg-[#7d1f2a]/10 text-xs font-semibold text-[#7d1f2a]" title={weekdayLabel[day]}>{weekdayLabel[day].slice(0, 3)}</span>
                <div className="flex flex-wrap gap-1.5">{slots.map((slot) => { const offering = offeringById.get(slot.mateOfferingId); return <span key={slot.id} className="inline-flex items-center gap-2 rounded-md border border-[#ece5de] bg-[#fbf9f7] px-2.5 py-1.5 text-xs font-medium text-[#514844]"><span className="tabular-nums">{formatTime(slot.startMinute)} - {formatTime(slot.endMinute)}</span>{offering && <span title={offering.course.name} className="inline-flex items-center gap-1 border-l border-[#e2d9d0] pl-2 text-[11px] font-semibold text-[#7d1f2a]">{offering.course.code}</span>}</span>; })}</div>
              </li>;
            })}</ul>}
          </Section>
          {!viewer.canRequest && !viewer.isOwner && <Section title="Request academic support" subtitle="TXMate student access" icon="shield">
            {viewer.signedIn ? <p className="text-sm leading-6 text-[#6d6260]">Requests are available to active TXMate students at the same university as this Academic Mate.</p> :
              <p className="text-sm leading-6 text-[#6d6260]">Sign in with your TXMate student account at the same university to request academic support.</p>}
            <Link href="/login" className="mt-4 inline-flex min-h-9 items-center justify-center rounded-md bg-[#7d1f2a] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#681923]">Sign in</Link>
          </Section>}
        </aside>
      </div>
    </div>
      {requestingOffering && (
        <SessionRequestDialog
          offering={{
            id: requestingOffering.id,
            course: requestingOffering.course,
            title: requestingOffering.title,
            rate: requestingOffering.rate,
            currency: requestingOffering.currency,
            rateType: requestingOffering.rateType,
            sessionDurationMinutes: requestingOffering.sessionDurationMinutes,
            academicMateName: user.name,
          }}
          onClose={() => setRequestingOffering(null)}
          onSubmitted={(request) => {
            setData((current) => current ? {
              ...current,
              requestsByOffering: {
                ...current.requestsByOffering,
                [requestingOffering.id]: {
                  id: request.id,
                  status: request.status as RequestStatus,
                  hasSession: false,
                },
              },
            } : current);
            void loadProfile().catch(() => undefined);
          }}
        />
      )}
  </main>;
}
