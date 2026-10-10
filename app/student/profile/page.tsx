"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";

type StudentStatus = "ACTIVE" | "GRADUATED" | "SUSPENDED" | "WITHDRAWN";

type StudentCourseStatus = "ENROLLED" | "COMPLETED" | "DROPPED" | "REPEATING";

type StudentCourse = {
  id: string;
  semester: number | null;
  status: StudentCourseStatus;
  isCompulsory: boolean;
  electiveGroup: {
    id: string;
    name: string;
    minSelections: number;
    maxSelections: number;
  } | null;
  course: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    credits: number | null;
  };
  academicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
  };
};

type StudentProfileResponse = {
  studentProfile: {
    id: string;
    studentId: string;
    gender: "MALE" | "FEMALE";
    status: StudentStatus;
    phoneNumber: string | null;
    bio: string | null;
    profileVisibility: ProfileVisibility;
    showStudentId: boolean;
    showPhoneNumber: boolean;
    createdAt: string;
    updatedAt: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  university: {
    id: string;
    code: string;
    name: string;
    slug: string;
  };
  academicMate: {
    id: string;
    status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
    verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  } | null;
  academic: {
    school: {
      id: string;
      code: string;
      name: string;
    };
    programme: {
      id: string;
      code: string;
      name: string;
      level: string;
      durationYears: number;
    };
    year: {
      id: string;
      yearNumber: number;
    };
    currentAcademicYear: {
      id: string;
      name: string;
      startDate: string;
      endDate: string;
      isCurrent: boolean;
    } | null;
    courses: StudentCourse[];
  };
};

// --- Styles and Labels ---

const statusLabel: Record<StudentStatus, string> = {
  ACTIVE: "Active",
  GRADUATED: "Graduated",
  SUSPENDED: "Suspended",
  WITHDRAWN: "Withdrawn",
};

const statusStyle: Record<StudentStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  GRADUATED: "bg-sky-50 text-sky-700 ring-sky-200/60",
  SUSPENDED: "bg-amber-50 text-amber-700 ring-amber-200/60",
  WITHDRAWN: "bg-stone-100 text-stone-700 ring-stone-200/60",
};

const courseStatusLabel: Record<StudentCourseStatus, string> = {
  ENROLLED: "Enrolled",
  COMPLETED: "Completed",
  DROPPED: "Dropped",
  REPEATING: "Repeating",
};

const visibilityLabel: Record<ProfileVisibility, string> = {
  PUBLIC: "Public Profile",
  MEMBERS_ONLY: "TXMate Members",
  PRIVATE: "Private Profile",
};

const iconPaths = {
  user: "M12 14.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm7.25 5.25a7.25 7.25 0 0 0-14.5 0",
  mail: "M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75",
  phone: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z",
  eye: "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  lock: "M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z",
  idCard: "M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z",
  university: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z",
  book: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
  pencil: "M16.862 3.487a2.25 2.25 0 0 1 3.182 3.182L8.25 18.462 3 21l2.538-5.25L16.862 3.487ZM14.25 6.75l3 3",
  academic: "M12 3 2.25 8.25 12 13.5l9.75-5.25L12 3Zm0 10.5v7.5m-6.75-5.25V12m13.5 0v3.75M5.25 12v3.75a9.75 9.75 0 0 0 13.5 0V12",
  logout: "M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5m5 5H3",
  badgeCheck: "M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z",
} as const;

function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof iconPaths; className?: string }) {

  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={iconPaths[name]} />
    </svg>
  );
}

// --- Enhanced Reusable UI Components ---

function Section({ title, icon, aside, children, className = "" }: { title: string; icon?: keyof typeof iconPaths; aside?: ReactNode; children: ReactNode; className?: string }) {

  return (
    <section className={`flex flex-col rounded-2xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-4 border-b border-[#f0ebe5] px-5 py-3.5 bg-[#faf8f6]/50">
        <div className="flex items-center gap-2.5">
          {icon && <Icon name={icon} className="h-4 w-4 text-[#8a7f7a]" />}
          <h2 className="text-sm font-bold tracking-tight text-[#282321]">{title}</h2>
        </div>
        {aside && <div>{aside}</div>}
      </div>
      <div className="flex-1 px-5 py-4">{children}</div>
    </section>
  );
}

function InfoItem({ icon, label, value, muted = false }: { icon: keyof typeof iconPaths; label: string; value: ReactNode; muted?: boolean }) {

  return (
    <div className="flex items-center gap-4 py-2.5 border-b border-[#f0ebe5] last:border-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f4f1ed] text-[#7d1f2a]">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a7f7a]">{label}</p>
        <div className={`mt-0.5 truncate text-[13px] ${muted ? "text-[#8a7f7a]" : "font-semibold text-[#282321]"}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

// --- Main Page Component ---

export default function StudentProfilePage() {
  const [data, setData] = useState<StudentProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "courses" | "privacy">("overview");
  useEffect(() => {
    const controller = new AbortController();
    async function loadProfile() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/student/me", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const contentType = response.headers.get("content-type") ?? "";
        const rawBody = await response.text();
        if (!contentType.includes("application/json")) throw new Error(`Expected a JSON response, but received ${contentType || "non-JSON content"}.`);
        let body: { error?: string } & Partial<StudentProfileResponse>;
        try { body = JSON.parse(rawBody); } catch { throw new Error("The profile service returned invalid JSON."); }
        if (!response.ok) throw new Error(body.error || "Unable to load your student profile.");
        if (!body.studentProfile || !body.user || !body.university || !body.academic) throw new Error("The profile service returned an incomplete profile.");
        setData(body as StudentProfileResponse);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load your student profile.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadProfile();
    return () => controller.abort();
  }, []);
  const sortedCourses = useMemo(() => {
    if (!data) return [];
    return [...data.academic.courses].sort((a, b) => {
      if (a.semester === null && b.semester !== null) return 1;
      if (a.semester !== null && b.semester === null) return -1;
      if (a.semester !== null && b.semester !== null && a.semester !== b.semester) return a.semester - b.semester;
      return a.course.code.localeCompare(b.course.code);
    });
  }, [data]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8f6f3] px-4 py-5 sm:px-6 sm:py-7 lg:px-8" aria-busy="true">
        <div className="mx-auto max-w-5xl animate-pulse motion-reduce:animate-none">
          <section role="status" aria-live="polite" aria-label="Loading student profile" className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm">
            <span className="sr-only">Loading your student profile...</span>
            <div className="relative h-28 overflow-hidden bg-gradient-to-br from-[#8f2433] via-[#7d1f2a] to-[#4f121a] sm:h-36">
              <div aria-hidden="true" className="absolute -right-7 -top-12 h-40 w-40 rounded-full border-[18px] border-white/[0.07] sm:-right-3 sm:-top-16 sm:h-52 sm:w-52 sm:border-[24px]" />
              <div aria-hidden="true" className="absolute -bottom-16 left-1/3 h-36 w-36 rounded-full border-[16px] border-white/[0.06] sm:h-44 sm:w-44" />
              <div className="absolute right-4 top-4 h-6 w-24 rounded-full bg-white/20 sm:right-5 sm:top-5 sm:w-28" />
            </div>
            <div className="px-4 pb-5 sm:px-7 sm:pb-6">
              <div className="relative z-10 -mt-10 flex flex-wrap items-end justify-between gap-3 sm:-mt-12">
                <div className="h-20 w-20 shrink-0 rounded-full bg-[#e9ddd8] ring-4 ring-white sm:h-24 sm:w-24" />
                <div className="mb-1 h-6 w-20 rounded-full bg-[#eee8e2]" />
              </div>
              <div className="mt-4">
                <div className="h-7 w-48 max-w-[75%] rounded-md bg-[#e8e0d8] sm:h-8 sm:w-60" />
                <div className="mt-2 h-4 w-60 max-w-full rounded bg-[#eee8e2]" />
                <div className="mt-2 h-3.5 w-52 max-w-full rounded bg-[#f0ebe5]" />
                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="h-7 w-28 rounded-full bg-[#f0ebe5]" />
                  <div className="h-7 w-36 rounded-full bg-[#f0ebe5]" />
                </div>
                <div className="mt-5 max-w-2xl">
                  <div className="h-2.5 w-12 rounded bg-[#e8e0d8]" />
                  <div className="mt-2 h-3 w-full max-w-xl rounded bg-[#eee8e2]" />
                  <div className="mt-2 h-3 w-4/5 max-w-lg rounded bg-[#f0ebe5]" />
                </div>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <div className="h-10 w-full rounded-lg border border-[#e2d9d0] bg-[#faf8f6] sm:w-32" />
                  <div className="h-10 w-full rounded-lg bg-[#ead7d9] sm:w-48" />
                </div>
              </div>
            </div>
          </section>
          <div className="mt-5 flex justify-center">
            <div className="flex w-full max-w-sm items-center justify-between gap-1 rounded-xl border border-[#e2d9d0] bg-white p-1.5 sm:w-auto sm:justify-center sm:gap-2">
              <div className="h-8 flex-1 rounded-lg bg-[#f1e7e5] sm:w-24 sm:flex-none" />
              <div className="h-8 flex-1 rounded-lg bg-[#f5f1ed] sm:w-28 sm:flex-none" />
              <div className="h-8 flex-1 rounded-lg bg-[#f5f1ed] sm:w-28 sm:flex-none" />
            </div>
          </div>
          <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2 sm:mt-5">
            <section className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-[#f0ebe5] bg-[#faf8f6]/70 px-4 py-3.5 sm:px-5">
                <div className="h-4 w-4 rounded bg-[#e8e0d8]" />
                <div className="h-3.5 w-36 rounded bg-[#e8e0d8]" />
              </div>
              <div className="px-4 py-2 sm:px-5">
                {[0, 1, 2, 3, 4].map((item) => (
                  <div key={item} className="flex items-center gap-3 border-b border-[#f0ebe5] py-3 last:border-0">
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-[#f1eae5]" />
                    <div className="min-w-0 flex-1">
                      <div className="h-2.5 w-20 rounded bg-[#eee8e2]" />
                      <div className="mt-2 h-3 w-3/4 max-w-56 rounded bg-[#f0ebe5]" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-[#f0ebe5] bg-[#faf8f6]/70 px-4 py-3.5 sm:px-5">
                <div className="h-4 w-4 rounded bg-[#e8e0d8]" />
                <div className="h-3.5 w-32 rounded bg-[#e8e0d8]" />
              </div>
              <div className="flex min-h-[230px] flex-col items-center justify-center px-5 py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#eadfda] bg-[#faf5f2]">
                  <div className="h-5 w-5 rounded-full bg-[#ead7d9]" />
                </div>
                <div className="mt-4 h-3.5 w-28 rounded bg-[#e8e0d8]" />
                <div className="mt-2 h-6 w-32 rounded-full bg-[#f3e8e9]" />
                <div className="mt-4 h-2.5 w-36 rounded bg-[#eee8e2]" />
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f8f6f3] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md w-full rounded-3xl bg-white p-8 text-center shadow-lg ring-1 ring-black/5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f6eaec] text-[#7d1f2a] mb-5">
            <Icon name="academic" className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#282321]">Profile Unavailable</h1>
          <p className="mt-2 text-[13px] leading-6 text-[#6d6260]">{error ?? "Your student profile could not be loaded."}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 w-full rounded-xl bg-[#7d1f2a] px-5 py-3 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#691923]"
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  const { studentProfile, user, university, academic } = data;
  const currentAcademicYear = academic.currentAcademicYear;

  return (
    <main className="min-h-screen bg-[#f8f6f3] px-4 py-6 sm:px-6 lg:px-8 pb-16">
      <div className="mx-auto max-w-5xl">
        {/* --- HERO PROFILE SECTION --- */}
        <section className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm">
          <div
            aria-hidden="true"
            className="relative h-32 overflow-hidden bg-gradient-to-br from-[#8f2433] via-[#7d1f2a] to-[#4f121a] sm:h-40"
          >
            <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full border-[26px] border-white/[0.06]" />
            <div className="absolute bottom-[-5rem] left-1/3 h-48 w-48 rounded-full border-[22px] border-white/[0.05]" />
            {/* Visibility pill */}
            <div className="absolute right-4 top-4 sm:right-5 sm:top-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ring-1 ring-white/30 backdrop-blur-md">
                <Icon name="eye" className="h-3 w-3 opacity-80" />
                {visibilityLabel[studentProfile.profileVisibility]}
              </span>
            </div>
          </div>
          <div className="px-5 pb-6 sm:px-8">
            <div className="relative z-10 -mt-12 flex items-end justify-between gap-4 sm:-mt-14">
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.name}
                  className="h-24 w-24 shrink-0 rounded-full bg-white object-cover ring-4 ring-white sm:h-28 sm:w-28"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[#f2e9e4] text-2xl font-semibold text-[#7d1f2a] ring-4 ring-white sm:h-28 sm:w-28 sm:text-3xl"
                >
                  {initials(user.name)}
                </div>
              )}
              <span className="mb-1 inline-flex items-center gap-2 rounded-full border border-[#e2d9d0] bg-white px-3 py-1 text-xs font-semibold text-[#3f3734]">
                <span
                  className={`h-2 w-2 rounded-full ${
                    studentProfile.status === "ACTIVE"
                      ? "bg-emerald-500"
                      : studentProfile.status === "SUSPENDED"
                        ? "bg-amber-500"
                        : studentProfile.status === "GRADUATED"
                          ? "bg-sky-500"
                          : "bg-stone-400"
                  }`}
                />
                {statusLabel[studentProfile.status]}
              </span>
            </div>
            <div className="mt-4">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight text-[#282321] sm:text-3xl">
                    {user.name}
                  </h1>
                  <p className="mt-1.5 text-[15px] text-[#3f3734]">
                    {academic.programme.name}
                    <span className="text-[#8a7f7a]"> · Year {academic.year.yearNumber}</span>
                  </p>
                  <p className="mt-1 text-sm text-[#6d6260]">
                    {university.name}
                    <span className="text-[#8a7f7a]"> · {academic.school.name}</span>
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f6f1ec] px-3 py-1 text-xs font-medium text-[#5f5551]">
                      <Icon name="eye" className="h-3.5 w-3.5" />
                      {visibilityLabel[studentProfile.profileVisibility]}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f6f1ec] px-3 py-1 text-xs font-medium text-[#5f5551]">
                      <Icon name="calendar" className="h-3.5 w-3.5" />
                      {currentAcademicYear?.name ?? "Academic year not assigned"}
                    </span>
                  </div>
                  {/* Bio Block */}
                  <div className="mt-5">
                    <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a7f7a]">
                      About
                    </h3>
                    {studentProfile.bio ? (
                      <p className="max-w-2xl text-[13px] leading-relaxed text-[#4b423e] text-balance">
                        {studentProfile.bio}
                      </p>
                    ) : (
                      <p className="text-[13px] italic text-[#8a7f7a]">
                        No bio has been provided yet.
                      </p>
                    )}
                  </div>
                </div>
                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:justify-end">
                  <a
                    href="/student/settings"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#6d6260] transition-colors hover:text-[#7d1f2a] focus-visible:outline-none focus-visible:underline"
                  >
                    <Icon name="pencil" className="h-4 w-4" />
                    Edit profile
                  </a>

                  <a
                    href={data.academicMate ? "/student/academic-mate" : "/student/academic-mate/edit"}
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#6d6260] transition-colors hover:text-[#7d1f2a] focus-visible:outline-none focus-visible:underline"
                  >
                    <Icon
                      name={data.academicMate ? "badgeCheck" : "academic"}
                      className="h-4 w-4"
                    />
                    {data.academicMate ? "Academic Mate profile" : "Become an Academic Mate"}
                  </a>
                </div>
                              </div>
            </div>
          </div>
        </section>
        {/* --- NAVIGATION TABS --- */}
        <div className="mt-6 mb-5 flex justify-center">
          <nav className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5" aria-label="Tabs">
            {[
              { id: "overview", label: "Overview", icon: "university" },
              { id: "courses", label: "Academic Record", icon: "book" },
              { id: "privacy", label: "Contact & Privacy", icon: "lock" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold transition-all duration-200 ${
                  activeTab === tab.id
                    ? "bg-[#f4f1ed] text-[#7d1f2a]"
                    : "text-[#8a7f7a] hover:bg-[#faf8f6] hover:text-[#282321]"
                }`}
              >
                <Icon name={tab.icon as any} className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
              </button>
            ))}
          </nav>
        </div>
        {/* --- TAB CONTENT --- */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === "overview" && (
            <div className="grid gap-5 md:grid-cols-2 items-stretch">
              <Section title="Institutional Details" className="h-full">
                <dl className="space-y-0">
                  <div className="flex items-center gap-3 border-b border-[#f0ebe5] py-3">
                    <Icon name="university" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <dt className="w-28 shrink-0 text-[13px] text-[#8a7f7a]">University</dt>
                    <dd className="text-[13px] text-[#282321]">{university.name}</dd>
                  </div>
                  <div className="flex items-center gap-3 border-b border-[#f0ebe5] py-3">
                    <Icon name="university" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <dt className="w-28 shrink-0 text-[13px] text-[#8a7f7a]">School</dt>
                    <dd className="text-[13px] text-[#282321]">{academic.school.name}</dd>
                  </div>
                  <div className="flex items-center gap-3 border-b border-[#f0ebe5] py-3">
                    <Icon name="book" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <dt className="w-28 shrink-0 text-[13px] text-[#8a7f7a]">Programme</dt>
                    <dd className="text-[13px] text-[#282321]">
                      {academic.programme.name} ({academic.programme.code})
                    </dd>
                  </div>
                  <div className="flex items-center gap-3 border-b border-[#f0ebe5] py-3">
                    <Icon name="academic" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <dt className="w-28 shrink-0 text-[13px] text-[#8a7f7a]">Degree Level</dt>
                    <dd className="text-[13px] text-[#282321]">
                      {titleCase(academic.programme.level)}
                    </dd>
                  </div>
                  <div className="flex items-center gap-3 py-3">
                    <Icon name="calendar" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <dt className="w-28 shrink-0 text-[13px] text-[#8a7f7a]">Total Duration</dt>
                    <dd className="text-[13px] text-[#282321]">
                      {academic.programme.durationYears} Years
                    </dd>
                  </div>
                </dl>
              </Section>
              <Section title="Academic Timeline" className="h-full">
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] rounded-xl bg-[#faf8f6] border border-dashed border-[#e2d9d0]">
                   <Icon name="calendar" className="h-7 w-7 text-[#d8cec5] mb-2.5" />
                   <p className="text-[13px] font-bold text-[#4b423e]">Academic Year</p>
                   <p className="mt-1 text-[11px] font-semibold text-[#7d1f2a] bg-[#f6eaec] px-2.5 py-0.5 rounded-full">
                     {currentAcademicYear?.name ?? "Unassigned"}
                   </p>
                   <p className="mt-3.5 text-[10px] font-bold uppercase tracking-wider text-[#8a7f7a]">
                     Year {academic.year.yearNumber} of {academic.programme.durationYears}
                   </p>
                </div>
              </Section>
            </div>
          )}
          {activeTab === "courses" && (
            <Section
              title="Course Enrollment"
              aside={
                <span className="text-sm text-[#6d6260]">
                  {sortedCourses.length} {sortedCourses.length === 1 ? "course" : "courses"}
                </span>
              }
            >
              {sortedCourses.length === 0 ? (
                <div className="py-8">
                  <p className="text-sm font-medium text-[#282321]">No Courses Found</p>
                  <p className="mt-1 text-sm text-[#8a7f7a]">
                    You have no academic courses assigned for this period.
                  </p>
                </div>
              ) : (
                <div>
                  {sortedCourses.map((item, index) => (
                    <div
                      key={item.id}
                      className={`py-4 ${
                        index !== sortedCourses.length - 1
                          ? "border-b border-[#eee7df]"
                          : ""
                      }`}
                    >
                      <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_180px_100px] sm:items-center sm:gap-4">
                        <p className="text-sm font-medium text-[#7d1f2a]">
                          {item.course.code}
                        </p>
                        <p className="text-sm font-medium text-[#282321]">
                          {item.course.name}
                        </p>
                        <p className="text-sm text-[#6d6260]">
                          {item.isCompulsory
                            ? "Compulsory"
                            : item.electiveGroup
                              ? `Elective (${item.electiveGroup.name})`
                              : "Elective"}
                        </p>
                        <p
                          className={`text-sm font-medium sm:text-right ${
                            item.status === "ENROLLED"
                              ? "text-[#7d1f2a]"
                              : item.status === "COMPLETED"
                                ? "text-emerald-700"
                                : item.status === "REPEATING"
                                  ? "text-amber-700"
                                  : "text-[#6d6260]"
                          }`}
                        >
                          {courseStatusLabel[item.status]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}
          {activeTab === "privacy" && (
            <div className="grid gap-5 md:grid-cols-2 items-stretch">
              <Section title="Contact Information" className="h-full">
                <div>
                  <div className="flex items-center gap-3 border-b border-[#f0ebe5] py-3">
                    <Icon name="mail" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <dt className="w-28 shrink-0 text-[13px] text-[#8a7f7a]">
                      Primary Email
                    </dt>
                    <dd className="min-w-0 text-[13px] text-[#282321] break-all">
                      {user.email}
                    </dd>
                  </div>
                  <div className="flex items-center gap-3 border-b border-[#f0ebe5] py-3">
                    <Icon name="phone" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <dt className="w-28 shrink-0 text-[13px] text-[#8a7f7a]">
                      Phone Number
                    </dt>
                    <dd
                      className={`min-w-0 text-[13px] ${
                        studentProfile.phoneNumber && studentProfile.showPhoneNumber
                          ? "text-[#282321]"
                          : "text-[#8a7f7a]"
                      }`}
                    >
                      {studentProfile.phoneNumber
                        ? studentProfile.showPhoneNumber
                          ? studentProfile.phoneNumber
                          : "Hidden from public"
                        : "Not provided"}
                    </dd>
                  </div>
                  <div className="flex items-center gap-3 py-3">
                    <Icon name="idCard" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <dt className="w-28 shrink-0 text-[13px] text-[#8a7f7a]">
                      Student ID
                    </dt>
                    <dd
                      className={`min-w-0 text-[13px] ${
                        studentProfile.showStudentId
                          ? "text-[#282321]"
                          : "text-[#8a7f7a]"
                      }`}
                    >
                      {studentProfile.showStudentId
                        ? studentProfile.studentId
                        : "Hidden from public"}
                    </dd>
                  </div>
                </div>
              </Section>
              <Section title="Privacy Configuration" className="h-full">
                <div>
                  <div className="flex items-center gap-3 border-b border-[#f0ebe5] py-3">
                    <Icon name="eye" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <dt className="w-28 shrink-0 text-[13px] text-[#8a7f7a]">
                      Profile Visibility
                    </dt>
                    <dd className="text-[13px] text-[#282321]">
                      {visibilityLabel[studentProfile.profileVisibility]}
                    </dd>
                  </div>
                  <div className="flex items-center gap-3 border-b border-[#f0ebe5] py-3">
                    <Icon name="lock" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <dt className="w-28 shrink-0 text-[13px] text-[#8a7f7a]">
                      ID Visibility
                    </dt>
                    <dd className="text-[13px] text-[#282321]">
                      {studentProfile.showStudentId
                        ? "Visible to Members"
                        : "Strictly Private"}
                    </dd>
                  </div>
                  <div className="flex items-center gap-3 py-3">
                    <Icon name="lock" className="h-4 w-4 shrink-0 text-[#8a7f7a]" />
                    <dt className="w-28 shrink-0 text-[13px] text-[#8a7f7a]">
                      Phone Visibility
                    </dt>
                    <dd className="text-[13px] text-[#282321]">
                      {studentProfile.showPhoneNumber
                        ? "Visible to Members"
                        : "Strictly Private"}
                    </dd>
                  </div>
                </div>
              </Section>
            </div>
          )}
        </div>
        {/* Global Footer */}
        <footer className="mt-12 text-center text-[10px] font-bold uppercase tracking-widest text-[#a39a95]">
          Account Active Since {formatDate(studentProfile.createdAt)}
        </footer>
      </div>
    </main>
  );
}
