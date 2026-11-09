"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { ReviewerList } from "@/components/student/academic-mate-profile/reviews-tab";
import RatingSummary from "@/components/student/rating-summary";
import { priceBasisText, priceText } from "@/lib/offering-price";

type Status = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
type Course = { id: string; code: string; name: string };

type Offering = {
  id: string; course: Course; title: string | null; description: string | null; rate: string; currency: string;
  sessionDurationMinutes: number; rateType: string; rateDetails: string | null; status: string;
  verificationStatus: VerificationStatus; isOutsideCurrentCurriculum: boolean;
};
type Availability = { id: string; mateOfferingId: string; day: string; startMinute: number; endMinute: number; timezone: string; isActive: boolean };
type Experience = { id: string; title?: string | null; organisation?: string | null; description?: string | null; startYear?: number | null; endYear?: number | null };
type Qualification = { id: string; name?: string | null; issuer?: string | null; year?: number | null; credentialUrl?: string | null };
type Review = { id: string; rating: number; comment: string | null; createdAt: string; reviewerUser: { id: string; name: string; image: string | null } };
type Student = {
  id: string; studentId?: string | null; gender?: string | null;
  university?: { id?: string; name?: string } | null; school?: { id?: string; name?: string } | null;
  programme?: { id?: string; name?: string } | null; programmeYear?: { id?: string; yearNumber?: number } | null;
  courses?: Array<{ id: string; course?: Course }>;
};
type ProfileData = {
  profile: {
    id: string; userId: string; studentProfileId: string | null; status: Status; verificationStatus: VerificationStatus;
    headline: string | null; bio: string | null; teachingExperience: string | null; yearsExperience: number | null;
    profileVisibility: ProfileVisibility; verifiedAt: string | null; createdAt: string; updatedAt: string;
  };
  user: { id: string; name: string; email?: string; image?: string | null };
  student: Student | null;
  offerings: Offering[]; availability: Availability[]; experiences: Experience[]; qualifications: Qualification[]; reviews: Review[];
  reviewerStats?: Record<string, { average: number | null; count: number }>;
  statistics?: { offerings?: number; activeOfferings?: number; availability?: number; experiences?: number; qualifications?: number; reviews?: number; totalReviews?: number; averageRating?: number | null; ratingDistribution?: Record<string, number> };
};
type ApiError = { error?: string };

const TABS = [
  { id: "about", label: "About" },
  { id: "courses", label: "Courses" },
  { id: "reviews", label: "Reviews" },
  { id: "availability", label: "Availability" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const MUTED = "text-[#6d6260]";
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2";
const LINK = `text-xs font-semibold text-[#7d1f2a] hover:underline underline-offset-2 ${FOCUS}`;
const BTN = `inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${FOCUS}`;
const BTN_PRIMARY = `${BTN} bg-[#7d1f2a] text-white shadow-sm shadow-[#7d1f2a]/15 hover:bg-[#681923]`;
const BTN_OUTLINE = `${BTN} border border-[#d8cec5] bg-white text-[#3d3631] hover:bg-[#faf8f6]`;

export default function AcademicMatePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("about");

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/student/academic-mate/profile", { method: "GET", cache: "no-store", headers: { Accept: "application/json" } });
        const body = (await response.json()) as ProfileData | ApiError;
        if (cancelled) return;
        if (!response.ok) throw new Error("error" in body && body.error ? body.error : "Unable to load your Academic Mate profile.");
        if (!("profile" in body)) throw new Error("The server returned an invalid Academic Mate profile.");
        setData(body);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load your Academic Mate profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <LoadingState />;

  if (error || !data) {
    return (
      <Shell>
        <div role="alert" className="mx-auto mt-4 max-w-md rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-800">
          <h1 className="text-lg font-semibold">Couldn’t load your profile</h1>
          <p className="mt-1 text-[13px]">{error || "Your Academic Mate profile could not be loaded."}</p>
        </div>
      </Shell>
    );
  }

  const { profile, offerings, availability, experiences, qualifications, reviews } = data;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
    <Shell>
      <div className="lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-5">
        <div className="space-y-3 lg:sticky lg:top-4">
          <ProfileHeader data={data} />
          <VerificationCard status={profile.verificationStatus} />
        </div>

        <div className="mt-3 min-w-0 lg:mt-0">
          <div className="overflow-hidden rounded-xl border border-[#ece5de] bg-white">
            <div role="tablist" aria-label="Academic Mate profile sections" onKeyDown={onKeyDown} className="grid grid-cols-4 border-b border-[#e2d9d0]">
              {TABS.map((t) => {
                const selected = t.id === tab;
                return (
                  <button
                    key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`panel-${t.id}`}
                    tabIndex={selected ? 0 : -1} onClick={() => setTab(t.id)}
                    className={`relative px-1 py-2.5 text-[13px] font-semibold transition focus-visible:ring-inset ${FOCUS} ${selected ? "text-[#7d1f2a]" : `${MUTED} hover:text-[#282321]`}`}
                  >
                    {t.label}
                    <span aria-hidden="true" className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full ${selected ? "bg-[#7d1f2a]" : "bg-transparent"}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-3">
            {tab === "about" && <AboutTab profile={profile} userName={data.user.name} experiences={experiences} qualifications={qualifications} />}
            {tab === "courses" && <CoursesTab offerings={offerings} />}
            {tab === "reviews" && <ReviewsTab reviews={reviews} reviewerStats={data.reviewerStats} statistics={data.statistics} />}
            {tab === "availability" && <AvailabilityTab availability={availability} offerings={offerings} />}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f4f1ed] text-[#282321] antialiased">
      <div className="mx-auto max-w-5xl px-3 py-3 pb-6 sm:px-6 sm:py-4 lg:px-8 lg:pb-8">{children}</div>
    </main>
  );
}

function ProfileHeader({ data }: { data: ProfileData }) {
  const { profile, user, student, offerings, availability, reviews } = data;
  const programme = [student?.programme?.name, student?.programmeYear?.yearNumber ? `Year ${student.programmeYear.yearNumber}` : null].filter(Boolean).join(", ");
  const rating = reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : "–";

  const stats: { label: string; title: string; value: string | number; icon: IconName }[] = [
    { label: "Courses", title: "Active courses", value: offerings.filter((o) => o.status === "ACTIVE").length, icon: "book" },
    { label: "Slots", title: "Weekly slots", value: availability.filter((a) => a.isActive).length, icon: "calendar" },
    { label: "Years", title: "Years tutoring", value: profile.yearsExperience ?? "–", icon: "briefcase" },
    { label: "Rating", title: "Average rating", value: rating, icon: "star" },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e2d9d0] bg-white shadow-sm">
      <div className="relative h-20 overflow-hidden bg-gradient-to-br from-[#8f2433] via-[#7d1f2a] to-[#4f121a] sm:h-24">
        <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full border-[20px] border-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-36 w-36 rounded-full border-[16px] border-white/[0.05]" />
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="relative -mt-9 shrink-0 sm:-mt-10">
            {user.image ? (
              <Image src={user.image} alt="" width={80} height={80} unoptimized className="h-[72px] w-[72px] rounded-full bg-white object-cover ring-4 ring-white sm:h-20 sm:w-20" />
            ) : (
              <div aria-hidden="true" className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#f2e9e4] text-2xl font-semibold text-[#7d1f2a] ring-4 ring-white sm:h-20 sm:w-20">
                {getInitials(user.name)}
              </div>
            )}
          </div>
            <div className="mt-4 flex items-center gap-3 text-xs">
                <Link href="/student/academic-mate/profile" className="inline-flex items-center gap-1 text-[#6b625e] hover:text-[#800020]">
                  <Icon name="eye" className="h-3.5 w-3.5" />Preview
                </Link>
                <Link href="/student/academic-mate/edit" className="inline-flex items-center gap-1 text-[#800020] hover:text-[#600018]">
                  <Icon name="edit" className="h-3.5 w-3.5" />Edit profile
                </Link>
              </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="text-lg font-bold tracking-tight">{user.name}</h1>
          <Pill value={profile.verificationStatus} />
        </div>
        {profile.headline && <p className="mt-1.5 text-[13px] leading-5 text-[#3f3734]">{profile.headline}</p>}

        <ul className={`mt-2 space-y-1 text-xs ${MUTED}`}>
          {programme && <MetaItem icon="cap">{programme}</MetaItem>}
          {student?.university?.name && <MetaItem icon="building">{student.university.name}</MetaItem>}
          <MetaItem icon="globe">{formatStatus(profile.profileVisibility)} visibility</MetaItem>
        </ul>

        <dl className="mt-3 grid grid-cols-4 divide-x divide-[#eee6df] border-y border-[#eee6df] py-0.5">
          {stats.map((s) => (
            <div key={s.label} title={s.title} className="flex min-w-0 flex-col items-center gap-0.5 px-1 py-1.5 text-center">
              <Icon name={s.icon} className="h-4 w-4 text-[#7d1f2a]" />
              <dd className="mt-0.5 text-base font-semibold leading-none">{s.value}</dd>
              <dt className={`text-[11px] ${MUTED}`}>{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function MetaItem({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      <Icon name={icon} className="mt-px h-3.5 w-3.5 shrink-0 text-[#7d1f2a]" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function VerificationCard({ status }: { status: VerificationStatus }) {
  const config = {
    VERIFIED: { title: "Verified", text: "Your profile has been verified.", cta: "View details", icon: "shieldcheck", tone: "bg-emerald-50 text-emerald-700" },
    PENDING: { title: "Under review", text: "Your request has been submitted and is awaiting review.", cta: "View status", icon: "clock", tone: "bg-amber-50 text-amber-700" },
    REJECTED: { title: "Not approved", text: "Your last request was rejected. Review the feedback and resubmit.", cta: "Review and resubmit", icon: "alert", tone: "bg-red-50 text-red-700" },
    UNVERIFIED: { title: "Not verified", text: "Submit your profile for verification to build trust with students.", cta: "Start verification", icon: "shield", tone: "bg-[#f1e4e6] text-[#7d1f2a]" },
  }[status] as { title: string; text: string; cta: string; icon: IconName; tone: string };

  return (
    <section className="rounded-xl border border-[#ece5de] bg-white p-3">
      <div className="flex items-start gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.tone}`}><Icon name={config.icon} /></span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-5">{config.title}</h2>
          <p className={`text-xs leading-4 ${MUTED}`}>{config.text}</p>
        </div>
      </div>
      <Link href="/student/academic-mate/verification" className={`mt-2.5 w-full ${status === "VERIFIED" || status === "PENDING" ? BTN_OUTLINE : BTN_PRIMARY}`}>
        {config.cta}
      </Link>
    </section>
  );
}

/** White surface grouping the blocks of one tab. */
function Surface({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-[#efe8e1] rounded-xl border border-[#ece5de] bg-white p-3 sm:p-4">{children}</div>;
}

function Block({ title, icon, href, action, children }: { title: string; icon: IconName; href?: string; action?: string; children: ReactNode }) {
  return (
    <section className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name={icon} className="h-4 w-4 text-[#7d1f2a]" />
          {title}
        </h2>
        {href && action && <Link href={href} className={LINK}>{action}</Link>}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className={`text-xs font-medium ${MUTED}`}>{label}</h3>
      <p className="mt-0.5 max-w-prose whitespace-pre-line break-words text-[13px] leading-5 text-[#3f3734]">{children}</p>
    </div>
  );
}

function Empty({ icon, text, href, label }: { icon: IconName; text: string; href: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-[#d8cec5] bg-[#fbf9f7] px-4 py-4 text-center">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7d1f2a]/10 text-[#7d1f2a]"><Icon name={icon} /></span>
      <p className={`mt-2 max-w-xs text-xs ${MUTED}`}>{text}</p>
      <Link href={href} className={`mt-2.5 ${BTN_PRIMARY}`}><Icon name="plus" className="h-3.5 w-3.5" />{label}</Link>
    </div>
  );
}

function AboutTab({ profile, userName, experiences, qualifications }: {
  profile: ProfileData["profile"]; userName: string; experiences: Experience[]; qualifications: Qualification[];
}) {
  const columns = [
    {
      title: "Experience", icon: "briefcase" as IconName, empty: "No experience added.",
      items: experiences.slice(0, 3).map((e) => ({ id: e.id, primary: e.title || "Academic experience", secondary: [e.organisation, e.startYear ? `${e.startYear}–${e.endYear ?? "present"}` : null].filter(Boolean).join(", ") })),
    },
    {
      title: "Qualifications", icon: "cap" as IconName, empty: "No qualifications added.",
      items: qualifications.slice(0, 3).map((q) => ({ id: q.id, primary: q.name || "Qualification", secondary: [q.issuer, q.year].filter(Boolean).join(", ") })),
    },
  ];

  return (
    <Surface>
      <Block title="About" icon="user" href="/student/academic-mate/edit" action="Edit">
        <div className="space-y-3">
          <Field label="Bio">{profile.bio || `${userName} hasn’t added a bio yet.`}</Field>
          <Field label="Teaching experience">{profile.teachingExperience || "No teaching experience added yet."}</Field>
        </div>
      </Block>

      <Block title="Experience and qualifications" icon="cap">
        <div className="grid gap-4 sm:grid-cols-2">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold">
                <Icon name={col.icon} className="h-3.5 w-3.5 text-[#7d1f2a]" />
                {col.title}
              </h3>
              {col.items.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {col.items.map((item) => (
                    <li key={item.id} className="rounded-lg border border-[#ece5de] bg-[#fbf9f7] px-3 py-2">
                      <p className="text-[13px] font-medium leading-5">{item.primary}</p>
                      {item.secondary && <p className={`text-xs ${MUTED}`}>{item.secondary}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`mt-2 rounded-lg border border-dashed border-[#d8cec5] px-3 py-2 text-xs ${MUTED}`}>{col.empty}</p>
              )}
            </div>
          ))}
        </div>
      </Block>
    </Surface>
  );
}

function CoursesTab({ offerings }: { offerings: Offering[] }) {
  return (
    <Surface>
      <Block title="Courses" icon="book" href="/student/academic-mate/offerings" action="Manage">
        {offerings.length > 0 ? (
          <ul className="space-y-2">
            {offerings.slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#ece5de] p-2.5 transition hover:border-[#d8cec5] hover:bg-[#fbf9f7]">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-[11px] font-bold text-[#7d1f2a]">{o.course.code}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold leading-5">{o.course.name}</p>
                    <p className={`flex flex-wrap items-center gap-x-2.5 text-[11px] leading-4 ${MUTED}`}>
                      <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3 w-3" />{o.sessionDurationMinutes} min</span>
                      {o.status !== "ACTIVE" && <span>{formatStatus(o.status)}</span>}
                      {o.isOutsideCurrentCurriculum && <span className="text-amber-700">Outside current curriculum</span>}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-right">
                  <span className="text-[13px] font-bold leading-5">{priceText(o.rate, o.currency, o.rateType)}</span>
                  {priceBasisText(o.rateType, o.rate) && <span className={`block text-[11px] leading-4 ${MUTED}`}>{formatStatus(o.rateType)}</span>}
                </p>
              </li>
            ))}
            {offerings.length > 5 && (
              <li className="pt-0.5"><Link href="/student/academic-mate/offerings" className={LINK}>View all {offerings.length} courses</Link></li>
            )}
          </ul>
        ) : (
          <Empty icon="book" text="You haven’t added any courses yet." href="/student/academic-mate/offerings" label="Add a course" />
        )}
      </Block>
    </Surface>
  );
}

function ReviewsTab({ reviews, reviewerStats, statistics }: { reviews: Review[]; reviewerStats?: ProfileData["reviewerStats"]; statistics?: ProfileData["statistics"] }) {
  // The totals come from the database; the list below is only the newest reviews.
  const count = statistics?.totalReviews ?? reviews.length;
  const average = statistics?.averageRating ?? (reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null);
  return (
    <Surface>
      <Block title="Reviews" icon="star">
        {reviews.length > 0 ? (
          <div className="space-y-3">
            <RatingSummary average={average} count={count} distribution={statistics?.ratingDistribution} />
            <ReviewerList reviews={reviews} reviewerStats={reviewerStats} />
          </div>
        ) : (
          <p className={`text-[13px] ${MUTED}`}>Reviews appear here after you complete tutoring sessions.</p>
        )}
      </Block>
    </Surface>
  );
}

function AvailabilityTab({ availability, offerings }: { availability: Availability[]; offerings: Offering[] }) {
  const active = availability.filter((a) => a.isActive);
  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  return (
    <Surface>
      <Block title="Availability" icon="calendar" href="/student/academic-mate/availability" action="Manage">
        {active.length > 0 ? (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {active.slice(0, 6).map((a) => {
              const offering = offeringById.get(a.mateOfferingId);
              return (
                <li key={a.id} className="flex items-center gap-2.5 rounded-lg border border-[#ece5de] bg-[#fbf9f7] px-2.5 py-1.5">
                  <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded-md bg-white text-xs font-semibold text-[#7d1f2a] ring-1 ring-[#e2d9d0]">
                    {formatDay(a.day).slice(0, 3)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
                    <p className="text-xs font-medium tabular-nums">{formatMinutes(a.startMinute)} – {formatMinutes(a.endMinute)}</p>
                    {offering && (
                      <span title={offering.course.name} className="border-l border-[#e2d9d0] pl-2 text-[11px] font-semibold text-[#7d1f2a]">{offering.course.code}</span>
                    )}
                  </div>
                </li>
              );
            })}
            {active.length > 6 && <li className={`text-xs ${MUTED} sm:col-span-2`}>+{active.length - 6} more</li>}
          </ul>
        ) : (
          <Empty icon="calendar" text="No availability set. Students can’t request sessions yet." href="/student/academic-mate/availability" label="Set availability" />
        )}
      </Block>
    </Surface>
  );
}

function Pill({ value }: { value: string }) {
  const tone =
    value === "VERIFIED" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : value === "PENDING" || value === "UNVERIFIED" ? "bg-amber-50 text-amber-700 ring-amber-200"
    : "bg-red-50 text-red-700 ring-red-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-medium ring-1 ring-inset ${tone}`}>
      <Icon name={value === "VERIFIED" ? "shieldcheck" : "shield"} className="h-3.5 w-3.5" />
      {formatStatus(value)}
    </span>
  );
}

const ICONS = {
  back: "M10 19l-7-7m0 0l7-7m-7 7h18",
  arrow: "M5 12h14m-6-6l6 6-6 6",
  logout: "M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5m5 5H3",
  edit: "M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z",
  eye: "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  user: "M20 21a8 8 0 00-16 0M12 13a4 4 0 100-8 4 4 0 000 8z",
  book: "M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z",
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  briefcase: "M5 7h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2zM8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18",
  cap: "M12 3L2.5 8 12 13l9.5-5L12 3zM6 10.5V16c3 2 9 2 12 0v-5.5M21.5 8v6",
  shield: "M12 3l8 3v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6l8-3z",
  shieldcheck: "M12 3l8 3v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6l8-3zM9 12l2 2 4-4",
  alert: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  star: "M12 3.8l2.5 5.1 5.6.8-4 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-4 5.6-.8L12 3.8z",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
  building: "M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M16 9h2a2 2 0 012 2v10M2 21h20M8 7h4M8 11h4M8 15h4",
  plus: "M12 5v14M5 12h14",
} as const;

type IconName = keyof typeof ICONS;

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ICONS[name]} />
    </svg>
  );
}

function LoadingState() {
  const block = "animate-pulse rounded-xl border border-[#e2d9d0] bg-white";
  return (
    <Shell>
      <div className="lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-5">
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
    </Shell>
  );
}

function formatStatus(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDay(day: string) {
  return day.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}