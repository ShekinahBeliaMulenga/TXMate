"use client";

import Image from "next/image";
import RatingSummary from "@/components/student/rating-summary";
import { ReviewerList } from "@/components/student/academic-mate-profile/reviews-tab";
import { priceBasisText, priceText } from "@/lib/offering-price";
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
type AcademicMateStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
type MateOfferingStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type MateOfferingRateType = "PER_SESSION" | "PER_HOUR" | "PER_WEEK" | "PER_MONTH" | "PER_COURSE" | "CUSTOM" | "FREE";
type Weekday = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
type StudentStatus = "ACTIVE" | "GRADUATED" | "SUSPENDED" | "WITHDRAWN";

type AcademicMateProfileResponse = {
  profile: { id: string; status: AcademicMateStatus; verificationStatus: VerificationStatus; headline: string | null; bio: string | null; teachingExperience: string | null; yearsExperience: number | null; profileVisibility: ProfileVisibility; verifiedAt: string | null; createdAt: string; updatedAt: string };
  user: { id: string; name: string; email: string; image: string | null };
  student: {
    id: string; studentId: string | null; gender: "MALE" | "FEMALE"; status: StudentStatus; phoneNumber: string | null; bio: string | null; profileVisibility: ProfileVisibility;
    university: { id: string; code: string; name: string; slug: string };
    school: { id: string; code: string; name: string };
    department: { id: string; code: string; name: string } | null;
    programme: { id: string; code: string; name: string; level: string; durationYears: number };
    programmeYear: { id: string; yearNumber: number };
    courses: Array<{ id: string; semester: number | null; status: string; academicYear: { id: string; name: string; isCurrent: boolean }; course: { id: string; code: string; name: string; description: string | null; credits: number | null } }>;
  } | null;
  offerings: Array<{
    id: string; course: { id: string; code: string; name: string; description: string | null }; title: string | null; description: string | null; rate: string; currency: string; sessionDurationMinutes: number; rateType: MateOfferingRateType; rateDetails: string | null; status: MateOfferingStatus; verificationStatus: VerificationStatus; topics: Array<{ id: string; name: string; description: string | null }>; isOutsideCurrentCurriculum: boolean; createdAt: string; updatedAt: string;
  }>;
  availability: Array<{ id: string; mateOfferingId: string; day: Weekday; startMinute: number; endMinute: number; timezone: string; isActive: boolean }>;
  experiences: Array<{ id: string; title: string; organisation: string | null; description: string | null; startYear: number | null; endYear: number | null; createdAt: string; updatedAt: string }>;
  qualifications: Array<{ id: string; name: string; issuer: string | null; year: number | null; credentialUrl: string | null; createdAt: string; updatedAt: string }>;
  reviews: Array<{ id: string; rating: number; comment: string | null; createdAt: string; reviewerUser: { id: string; name: string; image: string | null } }>;
  reviewerStats?: Record<string, { average: number | null; count: number }>;
  statistics: { totalOfferings: number; totalAvailabilitySlots: number; totalExperiences: number; totalQualifications: number; totalReviews: number; averageRating: number | null; ratingDistribution?: Record<string, number> };
};

const TABS = [
  { id: "about", label: "About" },
  { id: "courses", label: "Courses" },
  { id: "reviews", label: "Reviews" },
  { id: "availability", label: "Availability" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const academicMateStatusLabel: Record<AcademicMateStatus, string> = { ACTIVE: "Active", INACTIVE: "Inactive", SUSPENDED: "Suspended" };
const statusDot: Record<AcademicMateStatus, string> = { ACTIVE: "bg-emerald-500", INACTIVE: "bg-stone-400", SUSPENDED: "bg-amber-500" };
const verificationLabel: Record<VerificationStatus, string> = { UNVERIFIED: "Unverified", PENDING: "Verification pending", VERIFIED: "Verified", REJECTED: "Verification rejected" };
const verificationStyle: Record<VerificationStatus, string> = { UNVERIFIED: "bg-stone-100 text-stone-700 ring-stone-200", PENDING: "bg-amber-50 text-amber-800 ring-amber-200", VERIFIED: "bg-emerald-50 text-emerald-800 ring-emerald-200", REJECTED: "bg-red-50 text-red-800 ring-red-200" };
const rateTypeLabel: Record<MateOfferingRateType, string> = { PER_SESSION: "per session", PER_HOUR: "per hour", PER_WEEK: "per week", PER_MONTH: "per month", PER_COURSE: "per course", CUSTOM: "Custom rate", FREE: "" };
const weekdayLabel: Record<Weekday, string> = { MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday" };
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
type Offering = AcademicMateProfileResponse["offerings"][number];
type Slot = AcademicMateProfileResponse["availability"][number];

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={iconPaths[name]} />
    </svg>
  );
}

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2";

/** White surface grouping the blocks of one tab. */
function Surface({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-[#efe8e1] rounded-xl border border-[#ece5de] bg-white p-3 sm:p-4">{children}</div>;
}

function Block({ title, icon, aside, children }: { title: string; icon: IconName; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#282321]">
          <Icon name={icon} className="h-4 w-4 text-[#7d1f2a]" />
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[13px] text-[#7a6f6a]">{text}</p>;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-[#7a6f6a]">{label}</h3>
      <p className={`mt-0.5 max-w-prose whitespace-pre-wrap text-[13px] leading-5 ${value ? "text-[#3f3734]" : "text-[#7a6f6a]"}`}>{value || "Not added yet."}</p>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
const formatStatus = (status: string) => titleCase(status.replace(/_/g, " "));
const formatRateType = (rateType: MateOfferingRateType) => rateTypeLabel[rateType] ?? titleCase(rateType);
const reviewsLabel = (count: number) => `${count} ${count === 1 ? "review" : "reviews"}`;
const experienceShort = (years: number | null) => (years === null ? "—" : `${years} ${years === 1 ? "yr" : "yrs"}`);

function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function statusTone(status: string) {
  if (status === "ACTIVE" || status === "VERIFIED") return "text-emerald-700";
  if (status === "PENDING") return "text-amber-700";
  return "text-[#6b625c]";
}

export default function AcademicMateProfilePage() {
  const [data, setData] = useState<AcademicMateProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("about");

  useEffect(() => {
    const controller = new AbortController();

    async function loadProfile() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/student/academic-mate/profile", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type") ?? "";
        const rawBody = await response.text();

        if (!contentType.includes("application/json")) {
          throw new Error(`Expected a JSON response from the Academic Mate profile service, but received ${contentType || "non-JSON content"}.`);
        }

        let body: { error?: string } & Partial<AcademicMateProfileResponse>;
        try {
          body = JSON.parse(rawBody) as { error?: string } & Partial<AcademicMateProfileResponse>;
        } catch {
          throw new Error("The Academic Mate profile service returned invalid JSON.");
        }

        if (!response.ok) throw new Error(body.error || "Unable to load your Academic Mate profile.");

        if (!body.profile || !body.user || !body.student || !body.offerings || !body.availability || !body.experiences || !body.qualifications || !body.reviews || !body.statistics) {
          throw new Error("The Academic Mate profile service returned an incomplete profile.");
        }

        setData(body as AcademicMateProfileResponse);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load your Academic Mate profile.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadProfile();
    return () => controller.abort();
  }, []);

  const sortedOfferings = useMemo(() => (data ? [...data.offerings].sort((a, b) => a.course.code.localeCompare(b.course.code)) : []), [data]);

  const groupedAvailability = useMemo(() => {
    const groups = new Map<Weekday, Slot[]>();
    const sorted = data ? [...data.availability].sort((a, b) => a.startMinute - b.startMinute) : [];
    for (const slot of sorted) groups.set(slot.day, [...(groups.get(slot.day) ?? []), slot]);
    return groups;
  }, [data]);

  const offeringById = useMemo(() => new Map((data?.offerings ?? []).map((o) => [o.id, o] as const)), [data]);

  if (loading) {
    const block = "animate-pulse rounded-xl border border-[#e2d9d0] bg-white";
    return (
      <main className="min-h-screen bg-[#f4f1ed] px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-5">
          <div className="overflow-hidden rounded-2xl border border-[#e2d9d0] bg-white">
            <div className="h-20 animate-pulse bg-[#7d1f2a]/70 sm:h-24" />
            <div className="px-4 pb-4">
              <div className="-mt-9 h-[72px] w-[72px] animate-pulse rounded-full bg-[#eee7df] ring-4 ring-white sm:-mt-10 sm:h-20 sm:w-20" />
              <div className="mt-3 h-6 w-44 animate-pulse rounded-lg bg-[#eee7df]" />
              <div className="mt-2 h-3.5 w-56 max-w-full animate-pulse rounded bg-[#f1ece7]" />
              <div className="mt-3 h-12 animate-pulse rounded-xl bg-[#f1ece7]" />
            </div>
          </div>
          <div className="mt-3 space-y-3 lg:mt-0">
            <div className={`h-10 ${block}`} />
            <div className={`h-56 ${block}`} />
          </div>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#f4f1ed] px-3 py-6 sm:px-6 lg:px-8">
        <div role="alert" className="mx-auto max-w-md rounded-2xl border border-[#e2d9d0] bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-[#282321]">Couldn’t load your Academic Mate profile</h1>
          <p className="mt-2 text-[13px] leading-5 text-[#6d6260]">{error ?? "Your Academic Mate profile could not be loaded."}</p>
          <button type="button" onClick={() => window.location.reload()} className={`mt-4 rounded-xl bg-[#7d1f2a] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#681923] ${FOCUS}`}>Try again</button>
        </div>
      </main>
    );
  }

  const { profile, user, student, experiences, qualifications, reviews, statistics } = data;
  const stats: { label: string; title: string; value: string; icon: IconName }[] = [
    { label: "Courses", title: "Courses supported", value: String(statistics.totalOfferings), icon: "book" },
    { label: "Rating", title: "Average rating", value: statistics.averageRating !== null ? statistics.averageRating.toFixed(1) : "—", icon: "star" },
    { label: "Reviews", title: "Reviews", value: String(statistics.totalReviews), icon: "user" },
    { label: "Experience", title: "Experience", value: experienceShort(profile.yearsExperience), icon: "briefcase" },
  ];

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  }

  return (
    <main className="min-h-screen bg-[#f4f1ed] px-3 py-3 pb-6 sm:px-6 sm:py-4 lg:px-8 lg:pb-8">
      <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-5">
        {/* Header */}
        <section className="overflow-hidden rounded-2xl border border-[#e2d9d0] bg-white shadow-sm lg:sticky lg:top-4">
          <div aria-hidden="true" className="relative h-20 overflow-hidden bg-linear-to-br from-[#8f2433] via-[#7d1f2a] to-[#4f121a] sm:h-24">
            <div className="absolute -right-10 -top-16 h-44 w-44 rounded-full border-20 border-white/6" />
            <div className="absolute -bottom-16 left-1/3 h-36 w-36 rounded-full border-16 border-white/5" />
          </div>
          <div className="px-4 pb-4">
            <div className="relative -mt-9 inline-block sm:-mt-10">
              {user.image ? (
                <Image src={user.image} alt={user.name} width={80} height={80} unoptimized className="h-[72px] w-[72px] rounded-full bg-white object-cover ring-4 ring-white sm:h-20 sm:w-20" />
              ) : (
                <div aria-hidden="true" className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#f2e9e4] text-2xl font-semibold text-[#7d1f2a] ring-4 ring-white sm:h-20 sm:w-20">{initials(user.name)}</div>
              )}
              <span className={`absolute bottom-1 right-1 block h-3 w-3 rounded-full ring-2 ring-white ${statusDot[profile.status]}`} title={academicMateStatusLabel[profile.status]} role="img" aria-label={academicMateStatusLabel[profile.status]} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-lg font-bold tracking-tight text-[#282321]">{user.name}</h1>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-medium ring-1 ring-inset ${verificationStyle[profile.verificationStatus]}`}>
                <Icon name={profile.verificationStatus === "VERIFIED" ? "check" : "shield"} className="h-3.5 w-3.5" />
                {verificationLabel[profile.verificationStatus]}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-[#3f3734]">{profile.headline || "Academic support and tutoring"}</p>

            {student ? (
              <ul className="mt-2 space-y-1 text-xs text-[#6d6260]">
                <li className="flex items-start gap-1.5"><Icon name="book" className="mt-px h-3.5 w-3.5 shrink-0 text-[#7d1f2a]" />{student.programme.name}, Year {student.programmeYear.yearNumber}</li>
                <li className="flex items-start gap-1.5"><Icon name="university" className="mt-px h-3.5 w-3.5 shrink-0 text-[#7d1f2a]" />{student.university.name}</li>
                {student.department && <li className="flex items-start gap-1.5"><Icon name="briefcase" className="mt-px h-3.5 w-3.5 shrink-0 text-[#7d1f2a]" />{student.department.name}</li>}
              </ul>
            ) : null}

            <dl className="mt-3 grid grid-cols-4 divide-x divide-[#eee6df] border-y border-[#eee6df] py-0.5">
              {stats.map((stat) => (
                <div key={stat.label} title={stat.title} className="flex min-w-0 flex-col items-center gap-0.5 px-1 py-1.5 text-center">
                  <Icon name={stat.icon} className="h-4 w-4 text-[#7d1f2a]" />
                  <dd className="mt-0.5 max-w-full truncate text-base font-semibold leading-none text-[#282321]">{stat.value}</dd>
                  <dt className="text-[11px] text-[#6d6260]">{stat.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Tabs */}
        <div className="mt-3 min-w-0 lg:mt-0">
          <div className="overflow-hidden rounded-xl border border-[#ece5de] bg-white">
            <div role="tablist" aria-label="Academic Mate profile sections" onKeyDown={onTabKeyDown} className="grid grid-cols-4 border-b border-[#e2d9d0]">
              {TABS.map((t) => {
                const selected = t.id === tab;
                return (
                  <button
                    key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`panel-${t.id}`}
                    tabIndex={selected ? 0 : -1} onClick={() => setTab(t.id)}
                    className={`relative px-1 py-2.5 text-[13px] font-semibold transition focus-visible:ring-inset ${FOCUS} ${selected ? "text-[#7d1f2a]" : "text-[#6d6260] hover:text-[#282321]"}`}
                  >
                    {t.label}
                    <span aria-hidden="true" className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full ${selected ? "bg-[#7d1f2a]" : "bg-transparent"}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-3">
            {tab === "about" && (
              <Surface>
                <Block title="About" icon="user">
                  <div className="space-y-3">
                    <Field label="Bio" value={profile.bio} />
                    <Field label="Teaching experience" value={profile.teachingExperience} />
                  </div>
                </Block>

                <Block title="Experience" icon="briefcase">
                  {experiences.length === 0 ? <Empty text="No experience has been added yet." /> : (
                    <ul className="space-y-3">
                      {experiences.map((experience) => (
                        <li key={experience.id}>
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                            <h3 className="text-[13px] font-semibold text-[#282321]">{experience.title}</h3>
                            {experience.startYear !== null && <span className="text-xs text-[#7a6f6a]">{experience.startYear} – {experience.endYear ?? "Present"}</span>}
                          </div>
                          {experience.organisation && <p className="mt-0.5 text-xs text-[#6d6260]">{experience.organisation}</p>}
                          {experience.description && <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-5 text-[#514844]">{experience.description}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Block>

                <Block title="Qualifications" icon="certificate">
                  {qualifications.length === 0 ? <Empty text="No qualifications have been added yet." /> : (
                    <ul className="space-y-3">
                      {qualifications.map((qualification) => (
                        <li key={qualification.id}>
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                            <h3 className="text-[13px] font-semibold text-[#282321]">{qualification.name}</h3>
                            {qualification.year !== null && <span className="text-xs text-[#7a6f6a]">{qualification.year}</span>}
                          </div>
                          {qualification.issuer && <p className="mt-0.5 text-xs text-[#6d6260]">{qualification.issuer}</p>}
                          {qualification.credentialUrl && (
                            <a href={qualification.credentialUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#7d1f2a] hover:underline hover:underline-offset-2">
                              View credential <Icon name="arrow" className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Block>
              </Surface>
            )}

            {tab === "courses" && (
              <Surface>
                <Block title="Courses I support" icon="book" aside={<span className="text-[11px] font-medium text-[#6d6260]">{data.offerings.length} {data.offerings.length === 1 ? "course" : "courses"}</span>}>
                  {sortedOfferings.length === 0 ? <Empty text="No courses have been added yet." /> : (
                    <ul className="space-y-2">
                      {sortedOfferings.map((offering) => (
                        <li key={offering.id} className="rounded-xl border border-[#ece5de] bg-[#fdfcfb] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-baseline gap-2">
                                <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-[#7d1f2a]">{offering.course.code}</span>
                                <h3 className="truncate text-[13px] font-semibold text-[#241f1c]">{offering.course.name}</h3>
                              </div>
                              {offering.title && <p className="mt-0.5 truncate text-xs text-[#6b625c]">{offering.title}</p>}
                            </div>
                            <p className="shrink-0 text-right">
                              <span className="block text-[13px] font-bold leading-5 text-[#241f1c]">{priceText(offering.rate, offering.currency, offering.rateType)}</span>
                              {formatRateType(offering.rateType) && <span className="block text-[11px] leading-4 text-[#6d6260]">{formatRateType(offering.rateType)}</span>}
                            </p>
                          </div>
                          {offering.description && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[#625b55]">{offering.description}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#4e4742]">
                            <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3 w-3 text-[#8a817a]" />{offering.sessionDurationMinutes} min session</span>
                            <span className={`inline-flex items-center gap-1 font-medium ${statusTone(offering.status)}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{formatStatus(offering.status)}</span>
                          </div>
                          {offering.rateType === "CUSTOM" && offering.rateDetails && (
                            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-4 text-[#6b625c]"><Icon name="info" className="mt-0.5 h-3 w-3 shrink-0 text-[#8a817a]" /><span>{offering.rateDetails}</span></p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Block>
              </Surface>
            )}

            {tab === "reviews" && (
              <Surface>
                <Block title="Reviews" icon="star" aside={statistics.totalReviews > 0 ? <span className="text-[11px] font-medium text-[#6d6260]">{reviewsLabel(statistics.totalReviews)}</span> : null}>
                  <RatingSummary average={statistics.averageRating} count={statistics.totalReviews} distribution={statistics.ratingDistribution} />
                  {reviews.length === 0 ? <Empty text="No reviews yet." /> : <ReviewerList reviews={reviews} reviewerStats={data.reviewerStats} />}
                </Block>
              </Surface>
            )}

            {tab === "availability" && (
              <Surface>
                <Block title="Weekly availability" icon="calendar">
                  {groupedAvailability.size === 0 ? <Empty text="No availability has been added yet." /> : (
                    <ul className="space-y-2.5">
                      {weekdayOrder.map((day) => {
                        const slots = groupedAvailability.get(day);
                        if (!slots || slots.length === 0) return null;
                        return (
                          <li key={day} className="flex items-start gap-2.5">
                            <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-xs font-semibold text-[#7d1f2a]" title={weekdayLabel[day]}>{weekdayLabel[day].slice(0, 3)}</span>
                            <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                              {slots.map((slot) => {
                                const offering = offeringById.get(slot.mateOfferingId);
                                return (
                                  <span key={slot.id} className="flex h-8 min-w-0 items-center justify-between gap-2 rounded-lg border border-[#ece5de] bg-[#fbf9f7] px-2.5 text-xs font-medium text-[#514844]">
                                    <span className="shrink-0 whitespace-nowrap tabular-nums">{formatTime(slot.startMinute)} – {formatTime(slot.endMinute)}</span>
                                    {offering && <span title={offering.course.name} className="shrink-0 whitespace-nowrap text-right text-[11px] font-semibold text-[#7d1f2a]">{offering.course.code}</span>}
                                  </span>
                                );
                              })}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Block>
              </Surface>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}