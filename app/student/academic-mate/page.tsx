"use client";

import { useEffect, useState } from "react";
import Link from "next/link";


type Status = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";

type Course = { id: string; code: string; name: string };

type Offering = {
  id: string;
  course: Course;
  title: string | null;
  description: string | null;
  rate: string;
  currency: string;
  sessionDurationMinutes: number;
  rateType: string;
  rateDetails: string | null;
  status: string;
  verificationStatus: VerificationStatus;
  isOutsideCurrentCurriculum: boolean;
};

type Availability = {
  id: string;
  mateOfferingId: string;
  day: string;
  startMinute: number;
  endMinute: number;
  timezone: string;
  isActive: boolean;
};

type Experience = {
  id: string;
  title?: string | null;
  organisation?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type Qualification = {
  id: string;
  title?: string | null;
  institution?: string | null;
  description?: string | null;
  year?: number | null;
};

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

type Student = {
  id: string;
  studentId?: string | null;
  gender?: string | null;
  university?: { id?: string; name?: string } | null;
  school?: { id?: string; name?: string } | null;
  programme?: { id?: string; name?: string } | null;
  programmeYear?: { id?: string; yearNumber?: number } | null;
  courses?: Array<{ id: string; course?: Course }>;
};

type ProfileData = {
  profile: {
    id: string;
    userId: string;
    studentProfileId: string | null;
    status: Status;
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
  user: { id: string; name: string; email?: string; image?: string | null };
  student: Student | null;
  offerings: Offering[];
  availability: Availability[];
  experiences: Experience[];
  qualifications: Qualification[];
  reviews: Review[];
  statistics?: {
    offerings?: number;
    activeOfferings?: number;
    availability?: number;
    experiences?: number;
    qualifications?: number;
    reviews?: number;
  };
};

type ApiError = { error?: string };

const ACCENT = "text-[#7d1f2a]";
const LINK = `text-sm font-medium ${ACCENT} hover:underline underline-offset-4`;
const MUTED = "text-[#6b625c]";

export default function AcademicMatePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/student/academic-mate/profile", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        const body = (await response.json()) as ProfileData | ApiError;
        if (cancelled) return;

        if (!response.ok) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Unable to load your Academic Mate profile."
          );
        }
        if (!("profile" in body)) {
          throw new Error("The server returned an invalid Academic Mate profile.");
        }

        setData(body);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load your Academic Mate profile."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingState />;


  if (error || !data) {
    return (
      <Shell>
        <div role="alert" className="mt-8 rounded-md border border-red-200 bg-red-50 px-5 py-4 text-red-800">
          <h1 className="font-semibold">Couldn’t load your profile</h1>
          <p className="mt-1 text-sm">
            {error || "Your Academic Mate profile could not be loaded."}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      
      <ProfileHeader data={data} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
        <div className="min-w-0 space-y-6">
          <AboutSection profile={data.profile} userName={data.user.name} />
          <CoursesSection offerings={data.offerings} />
          <BackgroundSection
            experiences={data.experiences}
            qualifications={data.qualifications}
          />
          <ReviewsSection reviews={data.reviews} />
        </div>

        <aside className="min-w-0 space-y-6">
          <VerificationSection status={data.profile.verificationStatus} />
          <AvailabilitySection availability={data.availability} offerings={data.offerings} />
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f4f1ed] text-[#241f1c] antialiased">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </main>
  );
}

function ProfileHeader({ data }: { data: ProfileData }) {
  const { profile, user, student, offerings, availability, reviews } = data;

  const programme = [
    student?.programme?.name,
    student?.programmeYear?.yearNumber ? `Year ${student.programmeYear.yearNumber}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const rating = reviews.length
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : "–";

  const stats: { label: string; value: string | number; icon: IconName }[] = [
    { label: "Active courses", value: offerings.filter((o) => o.status === "ACTIVE").length, icon: "book" },
    { label: "Weekly slots", value: availability.filter((a) => a.isActive).length, icon: "calendar" },
    { label: "Years tutoring", value: profile.yearsExperience ?? "–", icon: "briefcase" },
    { label: "Average rating", value: rating, icon: "star" },
  ];

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm">
      <div className="relative h-28 overflow-hidden bg-gradient-to-br from-[#8f2433] via-[#7d1f2a] to-[#4f121a] sm:h-32">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full border-[26px] border-white/[0.06]" />
        <div className="pointer-events-none absolute bottom-[-5rem] left-1/3 h-48 w-48 rounded-full border-[22px] border-white/[0.05]" />
      </div>

      <div className="px-5 pb-6 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="relative z-10 -mt-12 flex items-end gap-4 sm:-mt-14">
            {user.image ? (
              <img src={user.image} alt="" className="h-24 w-24 rounded-full object-cover ring-4 ring-white sm:h-28 sm:w-28" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#f1e4e6] text-2xl font-semibold text-[#7d1f2a] ring-4 ring-white sm:h-28 sm:w-28 sm:text-3xl">
                {getInitials(user.name)}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Link
              href="/student/academic-mate/profile"
              className="inline-flex items-center gap-2  px-4 py-2 text-sm font-medium text-[#3d3631] hover:bg-[#faf8f6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30"
            >
              <Icon name="eye" />
              Preview
            </Link>
            <Link
              href="/student/academic-mate/edit"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#3d3631]  hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2"
            >
              <Icon name="edit" />
              Edit profile
            </Link>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{user.name}</h1>
            <Pill value={profile.verificationStatus} />
          </div>

          {profile.headline && (
            <p className="mt-1.5 max-w-2xl text-s text-[#3d3631]">{profile.headline}</p>
          )}

          <ul className={`mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm ${MUTED}`}>
            {programme && (
              <li className="inline-flex items-center gap-1.5">
                <Icon name="cap" className="h-4 w-4 text-[#7d1f2a]" />
                {programme}
              </li>
            )}
            {student?.university?.name && (
              <li className="inline-flex items-center gap-1.5">
                <Icon name="building" className="h-4 w-4 text-[#7d1f2a]" />
                {student.university.name}
              </li>
            )}
            <li className="inline-flex items-center gap-1.5">
              <Icon name="globe" className="h-4 w-4 text-[#7d1f2a]" />
              {formatStatus(profile.profileVisibility)} visibility
            </li>
          </ul>
        </div>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-y divide-[#ece5de] border-t border-[#ece5de] bg-[#fbf9f7] sm:grid-cols-4 sm:divide-y-0">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-[#7d1f2a]">
              <Icon name={stat.icon} className="h-5 w-5" />
            </span>
            <div>
              <dd className="text-xl font-semibold leading-none">{stat.value}</dd>
              <dt className={`mt-1 text-xs ${MUTED}`}>{stat.label}</dt>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AboutSection({
  profile,
  userName,
}: {
  profile: ProfileData["profile"];
  userName: string;
}) {
  return (
    <Section title="About" icon="user" href="/student/academic-mate/edit" action="Edit">
      <div className="space-y-5">
        <Field label="Bio">
          {profile.bio || `${userName} hasn’t added a bio yet.`}
        </Field>
        <Field label="Teaching experience">
          {profile.teachingExperience || "No teaching experience added yet."}
        </Field>
      </div>
    </Section>
  );
}

function CoursesSection({ offerings }: { offerings: Offering[] }) {
  return (
    <Section title="Courses" icon="book" href="/student/academic-mate/offerings" action="Manage">
      {offerings.length > 0 ? (
        <ul className="space-y-2.5">
          {offerings.slice(0, 5).map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-4 rounded-lg border border-[#ece5de] px-4 py-3 transition hover:border-[#d8cec5] hover:bg-[#fbf9f7]">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-[11px] font-bold text-[#7d1f2a]">
                  {o.course.code}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{o.course.name}</p>
                  <p className={`mt-0.5 flex flex-wrap items-center gap-x-3 text-xs ${MUTED}`}>
                    <span className="inline-flex items-center gap-1">
                      <Icon name="clock" className="h-3.5 w-3.5" />
                      {o.sessionDurationMinutes} min
                    </span>
                    {o.status !== "ACTIVE" && <span>{formatStatus(o.status)}</span>}
                    {o.isOutsideCurrentCurriculum && (
                      <span className="text-amber-700">Outside current curriculum</span>
                    )}
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-right text-sm">
                <span className="font-semibold">{formatRate(o.rate, o.currency)}</span>
                <span className={`block text-xs ${MUTED}`}>{formatStatus(o.rateType)}</span>
              </p>
            </li>
          ))}
          {offerings.length > 5 && (
            <li className="pt-1">
              <Link href="/student/academic-mate/offerings" className={LINK}>
                View all {offerings.length} courses
              </Link>
            </li>
          )}
        </ul>
      ) : (
        <Empty icon="book" text="You haven’t added any courses yet." href="/student/academic-mate/offerings" label="Add a course" />
      )}
    </Section>
  );
}

function BackgroundSection({
  experiences,
  qualifications,
}: {
  experiences: Experience[];
  qualifications: Qualification[];
}) {
  const columns = [
    {
      title: "Experience",
      icon: "briefcase" as IconName,
      empty: "No experience added.",
      items: experiences.slice(0, 3).map((e) => ({
        id: e.id,
        primary: e.title || "Academic experience",
        secondary: e.organisation,
      })),
    },
    {
      title: "Qualifications",
      icon: "cap" as IconName,
      empty: "No qualifications added.",
      items: qualifications.slice(0, 3).map((q) => ({
        id: q.id,
        primary: q.title || "Qualification",
        secondary: [q.institution, q.year].filter(Boolean).join(", "),
      })),
    },
  ];

  return (
    <Section title="Experience and qualifications" icon="cap">
      <div className="grid gap-6 sm:grid-cols-2">
        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Icon name={col.icon} className="h-4 w-4 text-[#7d1f2a]" />
              {col.title}
            </h3>
            {col.items.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {col.items.map((item) => (
                  <li key={item.id} className="rounded-lg border border-[#ece5de] bg-[#fbf9f7] px-3.5 py-2.5">
                    <p className="text-sm font-medium">{item.primary}</p>
                    {item.secondary && (
                      <p className={`text-xs ${MUTED}`}>{item.secondary}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`mt-3 rounded-lg border border-dashed border-[#d8cec5] px-3.5 py-3 text-sm ${MUTED}`}>{col.empty}</p>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function ReviewsSection({ reviews }: { reviews: Review[] }) {
  const average =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
    <Section title="Reviews" icon="star">
      {reviews.length > 0 ? (
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold">{average.toFixed(1)}</span>
            <Stars value={Math.round(average)} />
            <span className={`text-sm ${MUTED}`}>
              {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
            </span>
          </div>

          <ul className="mt-4 divide-y divide-[#ece5de]">
            {reviews.slice(0, 3).map((r) => (
              <li key={r.id} className="py-3.5 first:pt-0 last:pb-0">
                <Stars value={r.rating} />
                {r.comment && (
                  <p className="mt-1.5 break-words text-sm leading-6 text-[#4e4742]">{r.comment}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={`text-sm ${MUTED}`}>
          Reviews appear here after you complete tutoring sessions.
        </p>
      )}
    </Section>
  );
}

function VerificationSection({ status }: { status: VerificationStatus }) {
  const config = {
    VERIFIED: { title: "Verified", text: "Your profile has been verified.", cta: "View details", icon: "shieldcheck", tone: "bg-emerald-50 text-emerald-700" },
    PENDING: { title: "Under review", text: "Your request has been submitted and is awaiting review.", cta: "View status", icon: "clock", tone: "bg-amber-50 text-amber-700" },
    REJECTED: { title: "Not approved", text: "Your last request was rejected. Review the feedback and resubmit.", cta: "Review and resubmit", icon: "alert", tone: "bg-red-50 text-red-700" },
    UNVERIFIED: { title: "Not verified", text: "Submit your profile for verification to build trust with students.", cta: "Start verification", icon: "shield", tone: "bg-[#f1e4e6] text-[#7d1f2a]" },
  }[status] as { title: string; text: string; cta: string; icon: IconName; tone: string };

  return (
    <Section title="Verification" icon="shield">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.tone}`}>
          <Icon name={config.icon} className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">{config.title}</p>
          <p className={`mt-0.5 text-sm leading-6 ${MUTED}`}>{config.text}</p>
        </div>
      </div>
      <Link
        href="/student/academic-mate/verification"
        className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 ${
          status === "VERIFIED" || status === "PENDING"
            ? "border border-[#d8cec5] text-[#3d3631] hover:bg-[#faf8f6]"
            : "bg-[#7d1f2a] text-white hover:bg-[#681923]"
        }`}
      >
        {config.cta}
        
      </Link>
    </Section>
  );
}

function AvailabilitySection({
  availability,
  offerings,
}: {
  availability: Availability[];
  offerings: Offering[];
}) {
  const active = availability.filter((a) => a.isActive);
  const offeringById = new Map(offerings.map((o) => [o.id, o]));

  return (
    <Section title="Availability" icon="calendar" href="/student/academic-mate/availability" action="Manage">
      {active.length > 0 ? (
        <ul className="space-y-2">
          {active.slice(0, 6).map((a) => {
            const offering = offeringById.get(a.mateOfferingId);
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-lg bg-[#fbf9f7] px-3 py-2.5">
                <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-md bg-white text-xs font-semibold text-[#7d1f2a] ring-1 ring-[#e2d9d0]">
                  {formatDay(a.day).slice(0, 3)}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="text-sm font-medium tabular-nums">
                    {formatMinutes(a.startMinute)} – {formatMinutes(a.endMinute)}
                  </p>
                  {offering && (
                    <span
                      title={offering.course.name}
                      className="inline-flex items-center gap-1 border-l border-[#e2d9d0] pl-2 text-xs font-semibold text-[#7d1f2a]"
                    >
                      {offering.course.code}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
          {active.length > 6 && <li className={`pt-1 text-xs ${MUTED}`}>+{active.length - 6} more</li>}
        </ul>
      ) : (
        <Empty icon="calendar" text="No availability set. Students can’t request sessions yet." href="/student/academic-mate/availability" label="Set availability" />
      )}
    </Section>
  );
}

function Section({
  title,
  icon,
  href,
  action,
  children,
}: {
  title: string;
  icon: IconName;
  href?: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[#ece5de] bg-[#fbf9f7] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-[#7d1f2a]">
            <Icon name={icon} />
          </span>
          <h2 className="text-[15px] font-semibold">{title}</h2>
        </div>
        {href && action && (
          <Link href={href} className={LINK}>
            {action}
          </Link>
        )}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={`text-xs font-medium ${MUTED}`}>{label}</h3>
      <p className="mt-1 max-w-prose whitespace-pre-line break-words text-sm leading-6 text-[#3d3631]">
        {children}
      </p>
    </div>
  );
}

function Empty({ icon, text, href, label }: { icon: IconName; text: string; href: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-[#d8cec5] bg-[#fbf9f7] px-4 py-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7d1f2a]/10 text-[#7d1f2a]">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className={`mt-3 max-w-xs text-sm ${MUTED}`}>{text}</p>
      <Link href={href} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#7d1f2a] px-3.5 py-1.5 text-sm font-medium text-white hover:bg-[#681923]">
        <Icon name="plus" className="h-4 w-4" />
        {label}
      </Link>
    </div>
  );
}

function Pill({ value }: { value: string }) {
  const tone =
    value === "VERIFIED"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : value === "PENDING" || value === "UNVERIFIED"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-red-50 text-red-700 ring-red-200";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tone}`}>
      <Icon name={value === "VERIFIED" ? "shieldcheck" : "shield"} className="h-3.5 w-3.5" />
      {formatStatus(value)}
    </span>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${i < value ? "text-amber-500" : "text-[#d8cec5]"}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 3.8l2.5 5.1 5.6.8-4 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-4 5.6-.8L12 3.8z" />
        </svg>
      ))}
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
  return (
    <Shell>
      <div className="h-6 w-40 animate-pulse rounded bg-[#e2d9d0]" />
      <div className="mt-10 flex items-center gap-5">
        <div className="h-20 w-20 animate-pulse rounded-full bg-[#e2d9d0]" />
        <div className="space-y-2">
          <div className="h-7 w-56 animate-pulse rounded bg-[#e2d9d0]" />
          <div className="h-4 w-72 animate-pulse rounded bg-[#e2d9d0]" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <div className="h-48 animate-pulse rounded-lg bg-[#e2d9d0]" />
          <div className="h-64 animate-pulse rounded-lg bg-[#e2d9d0]" />
        </div>
        <div className="space-y-6">
          <div className="h-36 animate-pulse rounded-lg bg-[#e2d9d0]" />
          <div className="h-48 animate-pulse rounded-lg bg-[#e2d9d0]" />
        </div>
      </div>
    </Shell>
  );
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRate(rate: string, currency: string) {
  const numeric = Number(rate);
  if (!Number.isFinite(numeric)) return `${currency} ${rate}`;
  return `${currency} ${numeric.toLocaleString("en-ZM", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDay(day: string) {
  return day.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}