"use client";

import { formatPhone } from "@/lib/phone";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type Course = {
  id: string;
  semester: number | null;
  course: { id: string; code: string; name: string };
  academicYear: { name: string; isCurrent: boolean };
};

type StudentProfile = {
  studentProfile: {
    id: string;
    gender: "MALE" | "FEMALE";
    bio: string | null;
    studentId: string | null;
    phoneNumber: string | null;
  };
  user: { name: string; image: string | null };
  university: { name: string; code: string };
  programme: {
    name: string;
    code: string;
    level: string;
    school: { name: string; code: string };
    department: { name: string; code: string } | null;
  };
  programmeYear: { yearNumber: number };
  courses: Course[];
};

type ApiResponse = { profile?: StudentProfile; error?: string };

// --- Icons ---

const iconPaths = {
  phone: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z",
  user: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  idCard: "M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z",
  university: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z",
  book: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
  academic: "M12 3 2.25 8.25 12 13.5l9.75-5.25L12 3Zm0 10.5v7.5m-6.75-5.25V12m13.5 0v3.75M5.25 12v3.75a9.75 9.75 0 0 0 13.5 0V12",
  arrowLeft: "M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18",
} as const;

type IconName = keyof typeof iconPaths;

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={iconPaths[name]} />
    </svg>
  );
}

// --- Reusable UI Components ---

function Section({ title, icon, aside, children, className = "" }: { title: string; icon?: IconName; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 ${className}`}>
      <div className="flex items-center justify-between gap-4 border-b border-[#f0ebe5] bg-[#faf8f6]/50 px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="flex items-center gap-2.5">
          {icon && <Icon name={icon} className="h-4 w-4 text-[#8a7f7a]" />}
          <h2 className="text-[13px] font-bold tracking-tight text-[#282321]">{title}</h2>
        </div>
        {aside && <div>{aside}</div>}
      </div>
      <div className="flex-1 px-3 py-1 sm:px-4 sm:py-2">{children}</div>
    </section>
  );
}

/** One label/value line. Must sit inside a <dl>. The last row in a list drops its divider. */
function DetailRow({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#f0ebe5] py-2 last:border-0 sm:gap-3 sm:py-2.5">
      <Icon name={icon} className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
      <dt className="w-28 shrink-0 whitespace-nowrap text-[11px] text-[#8a7f7a] sm:w-28 sm:text-xs">{label}</dt>
      <dd className="min-w-0 break-words text-[11px] sm:text-xs text-[#282321]">{children}</dd>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Profile photo, or the person's initials when there is no photo (or it fails to load). */
function Avatar({ name, image }: { name: string; image: string | null }) {
  const [failed, setFailed] = useState(false);
  const size = "h-18 w-18 sm:h-20 sm:w-20";
  return image && !failed ? (
    <Image src={image} alt={name} width={96} height={96} unoptimized onError={() => setFailed(true)} className={`${size} shrink-0 rounded-full bg-white object-cover ring-4 ring-white sm:ring-4`} />
  ) : (
    <div aria-hidden="true" className={`${size} flex shrink-0 select-none items-center justify-center rounded-full bg-[#f4eceb] text-lg font-semibold tracking-wide text-[#7d1f2a] ring-2 ring-white sm:text-3xl sm:ring-4`}>
      {initials(name)}
    </div>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Go back"
      className="group mb-2 inline-flex h-8 w-8 sm:mb-3 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white text-[#6d6260] shadow-sm ring-1 ring-black/5 transition-all duration-200 hover:-translate-x-0.5 hover:text-[#7d1f2a] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 active:scale-95"
    >
      <Icon name="arrowLeft" className="h-4 w-4 transition-transform sm:h-[18px] sm:w-[18px] duration-200 group-hover:-translate-x-0.5" />
    </button>
  );
}

/* Skeleton pieces. They copy the real layout so nothing jumps when the content arrives. */

function SkeletonRow() {
  return (
    <div className="border-b border-[#f0ebe5] py-2 last:border-0 sm:py-2.5">
      <div className="flex h-5 items-center gap-3">
        <div className="h-4 w-4 shrink-0 rounded bg-[#e8e0d8]" />
        <div className="w-24 shrink-0"><div className="h-3 w-20 rounded bg-[#eee8e2]" /></div>
        <div className="h-3 w-40 max-w-full rounded bg-[#f0ebe5]" />
      </div>
    </div>
  );
}

function SkeletonTab({ active, width }: { active?: boolean; width: string }) {
  const tone = active ? "bg-[#e2d4d0]" : "bg-[#eee8e2]";
  return (
    <div className={`flex h-8 w-[92px] items-center gap-1.5 rounded-lg px-3.5 ${width} ${active ? "bg-[#f4f1ed]" : ""}`}>
      <div className={`h-3.5 w-3.5 shrink-0 rounded ${tone}`} />
      <div className={`h-3 flex-1 rounded ${tone}`} />
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <main className="min-h-screen bg-[#f4f1ed] px-3 py-3 pb-8 sm:px-6 sm:py-4" aria-busy="true">
      <div className="mx-auto max-w-3xl animate-pulse motion-reduce:animate-none">
        <span role="status" aria-live="polite" className="sr-only">Loading student profile...</span>

        <div aria-hidden="true" className="mb-4 h-5 w-16 rounded bg-[#e8e0d8]" />

        {/* Hero */}
        <section aria-hidden="true" className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm">
          <div className="relative h-16 overflow-hidden bg-gradient-to-br from-[#8f2433] via-[#7d1f2a] to-[#4f121a] sm:h-28">
            <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full border-[26px] border-white/[0.06]" />
            <div className="absolute bottom-[-5rem] left-1/3 h-48 w-48 rounded-full border-[22px] border-white/[0.05]" />
          </div>
          <div className="px-3 pb-3 sm:px-6 sm:pb-4">
            <div className="relative z-10 -mt-8 flex items-end justify-between gap-4 sm:-mt-12">
              <div className="h-24 w-24 shrink-0 rounded-full bg-[#e9ddd8] ring-4 ring-white sm:h-28 sm:w-28" />
            </div>
            <div className="mt-4">
              <div className="h-8 w-48 max-w-[75%] rounded-md bg-[#e8e0d8] sm:h-9 sm:w-60" />
              <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3">
                <div className="h-6 w-28 rounded-full bg-[#f0ebe5]" />
                <div className="h-6 w-40 rounded-full bg-[#f0ebe5]" />
              </div>
              <div className="mt-5 max-w-2xl">
                <div className="mb-1.5 h-2.5 w-12 rounded bg-[#e8e0d8]" />
                <div className="h-3 w-full rounded bg-[#eee8e2]" />
                <div className="mt-2 h-3 w-4/5 rounded bg-[#f0ebe5]" />
              </div>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div aria-hidden="true" className="mb-3 mt-3 flex justify-center sm:mb-4 sm:mt-4">
          <div className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5">
            <SkeletonTab active width="sm:w-[108px]" />
            <SkeletonTab width="sm:w-[150px]" />
          </div>
        </div>

        {/* Overview tab */}
        <section aria-hidden="true" className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="flex items-center border-b border-[#f0ebe5] bg-[#faf8f6]/50 px-3 py-2 sm:px-4 sm:py-2.5">
            <div className="flex h-5 items-center"><div className="h-3.5 w-36 rounded bg-[#e8e0d8]" /></div>
          </div>
          <div className="px-3 py-1 sm:px-4 sm:py-2">
            {Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)}
          </div>
        </section>
      </div>
    </main>
  );
}

// --- Tabs ---

type TabId = "overview" | "courses" | "contact";

const TAB_DEFS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "university" },
  { id: "courses", label: "Current Courses", icon: "book" },
  { id: "contact", label: "Contact", icon: "phone" },
];

// --- Main Page Component ---

export default function StudentMateProfilePage() {
  const { studentProfileID } = useParams<{ studentProfileID: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/student/mates/${encodeURIComponent(studentProfileID)}`, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
      const body = (await response.json().catch(() => ({}))) as ApiResponse;
      if (!response.ok) throw new Error(body.error || "This student profile is not available.");
      if (!body.profile) throw new Error("This student profile is not available.");
      setProfile(body.profile);
    } catch (cause) {
      if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) return;
      setError(cause instanceof Error ? cause.message : "Unable to load this student profile.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [studentProfileID]);

  useEffect(() => {
    const controller = new AbortController();
    void loadProfile(controller.signal); // eslint-disable-line react-hooks/set-state-in-effect
    return () => controller.abort();
  }, [loadProfile]);

  const sortedCourses = useMemo(() => {
    if (!profile) return [];
    return [...profile.courses].sort((a, b) => {
      if (a.semester === null && b.semester !== null) return 1;
      if (a.semester !== null && b.semester === null) return -1;
      if (a.semester !== null && b.semester !== null && a.semester !== b.semester) return a.semester - b.semester;
      return a.course.code.localeCompare(b.course.code);
    });
  }, [profile]);

  if (loading) return <ProfileSkeleton />;

  if (error || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f6f3] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg ring-1 ring-black/5">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f6eaec] text-[#7d1f2a]">
            <Icon name="academic" className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#282321]">Student Profile Unavailable</h1>
          <p role="alert" className="mt-2 text-[13px] leading-6 text-[#6d6260]">{error || "This student profile is not available."}</p>
          <button
            type="button"
            onClick={() => void loadProfile()}
            className="mt-6 w-full rounded-xl bg-[#7d1f2a] px-5 py-3 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#681923]"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-3 w-full rounded-xl px-5 py-3 text-[13px] font-bold text-[#6d6260] transition hover:bg-[#faf8f6] hover:text-[#7d1f2a]"
          >
            Go back
          </button>
        </div>
      </main>
    );
  }

  const { studentProfile, user, university, programme, programmeYear } = profile;
  const bio = studentProfile.bio?.trim() ?? "";
  const hasContact = Boolean(studentProfile.studentId || studentProfile.phoneNumber);
  const tabs = TAB_DEFS.filter((tab) => tab.id !== "contact" || hasContact);
  const currentTab: TabId = tabs.some((tab) => tab.id === activeTab) ? activeTab : "overview";
  const currentYearName = sortedCourses.find((c) => c.academicYear.isCurrent)?.academicYear.name ?? sortedCourses[0]?.academicYear.name ?? null;
  const chip = "inline-flex items-center gap-1.5 rounded-full bg-[#f6f1ec] px-2.5 py-0.5 text-[11px] font-medium text-[#5f5551]";

  return (
    <main className="min-h-screen bg-[#f4f1ed] px-3 py-3 pb-8 sm:px-6 sm:py-4">
      <div className="mx-auto max-w-3xl">
        <BackButton onClick={() => router.back()} />

        {/* --- HERO PROFILE SECTION --- */}
        <section className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm">
          <div aria-hidden="true" className="relative h-16 overflow-hidden bg-gradient-to-br from-[#8f2433] via-[#7d1f2a] to-[#4f121a] sm:h-28">
            <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full border-[26px] border-white/[0.06]" />
            <div className="absolute bottom-[-5rem] left-1/3 h-48 w-48 rounded-full border-[22px] border-white/[0.05]" />
          </div>
          <div className="px-3 pb-3 sm:px-6 sm:pb-4">
            <div className="relative z-10 -mt-8 flex items-end justify-between gap-4 sm:-mt-12">
              <Avatar name={user.name} image={user.image} />
            </div>
            <div className="mt-2 min-w-0 sm:mt-4">
              <h1 className="break-words text-base font-semibold tracking-tight text-[#282321] sm:text-2xl">{user.name}</h1>
              <p className="mt-0.5 text-xs text-[#3f3734] sm:mt-1 sm:text-[13px]">
                {programme.name}
                <span className="text-[#8a7f7a]"> · Year {programmeYear.yearNumber}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3">
                <span className={chip}><Icon name="academic" className="h-3.5 w-3.5" />{programme.code}</span>
                <span className={chip}><Icon name="calendar" className="h-3.5 w-3.5" />{currentYearName ?? `Year ${programmeYear.yearNumber}`}</span>
              </div>
              <div className="mt-3 sm:mt-4">
                <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#8a7f7a]">About</h3>
                {bio ? (
                  <p className="max-w-2xl whitespace-pre-wrap text-[11px] leading-relaxed sm:text-xs text-[#4b423e]">{bio}</p>
                ) : (
                  <p className="text-xs italic text-[#8a7f7a]">No bio has been provided yet.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* --- NAVIGATION TABS --- */}
        <div className="mb-3 mt-3 flex justify-center sm:mb-4 sm:mt-4">
          <nav className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={currentTab === tab.id ? "true" : undefined}
                className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold sm:px-3 sm:py-1.5 sm:text-xs transition-all duration-200 ${
                  currentTab === tab.id ? "bg-[#f4f1ed] text-[#7d1f2a]" : "text-[#8a7f7a] hover:bg-[#faf8f6] hover:text-[#282321]"
                }`}
              >
                <Icon name={tab.icon} className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* --- TAB CONTENT --- */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {currentTab === "overview" && (
            <Section title="Academic Details">
              <dl>
                <DetailRow icon="university" label="University">{university.name}</DetailRow>
                <DetailRow icon="university" label="School">{programme.school.name}</DetailRow>
                {programme.department && <DetailRow icon="academic" label="Department">{programme.department.name}</DetailRow>}
                <DetailRow icon="book" label="Programme">{programme.name} ({programme.code})</DetailRow>
                <DetailRow icon="academic" label="Degree Level">{titleCase(programme.level)}</DetailRow>
                <DetailRow icon="calendar" label="Year of Study">Year {programmeYear.yearNumber}</DetailRow>
                <DetailRow icon="user" label="Gender">{studentProfile.gender === "MALE" ? "Male" : "Female"}</DetailRow>
              </dl>
            </Section>
          )}

          {currentTab === "courses" && (
            <Section
              title="Currently Enrolled Courses"
              aside={<span className="text-xs text-[#6d6260]">{sortedCourses.length} {sortedCourses.length === 1 ? "course" : "courses"}</span>}
            >
              {sortedCourses.length === 0 ? (
                <div className="py-5">
                  <p className="text-sm font-medium text-[#282321]">No Courses Found</p>
                  <p className="mt-1 text-sm text-[#8a7f7a]">No current course enrolments are listed.</p>
                </div>
              ) : (
                <div>
                  {sortedCourses.map(({ id, course, semester, academicYear }) => (
                    <div key={id} className="border-b border-[#eee7df] py-2 last:border-0 sm:py-2.5">
                      <div className="grid gap-1 sm:grid-cols-[96px_minmax(0,1fr)_190px] sm:items-center sm:gap-4">
                        <p className="text-[11px] font-semibold text-[#7d1f2a] sm:text-xs">{course.code}</p>
                        <p className="text-[11px] font-medium text-[#282321] sm:text-xs">{course.name}</p>
                        <p className="text-[10px] text-[#6d6260] sm:text-right sm:text-xs">
                          {academicYear.name}
                          {semester ? ` · Semester ${semester}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {currentTab === "contact" && hasContact && (
            <Section title="Contact Information">
              <dl>
                {studentProfile.phoneNumber && <DetailRow icon="phone" label="Phone Number">{formatPhone(studentProfile.phoneNumber)}</DetailRow>}
                {studentProfile.studentId && <DetailRow icon="idCard" label="Student ID">{studentProfile.studentId}</DetailRow>}
              </dl>
            </Section>
          )}
        </div>
      </div>
    </main>
  );
}