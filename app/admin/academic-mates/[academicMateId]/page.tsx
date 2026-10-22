"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

type ProfileStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

type ProfileData = {
  id: string;
  userId: string;
  studentProfileId: string | null;
  status: ProfileStatus;
  verificationStatus: VerificationStatus;
  headline: string | null;
  bio: string | null;
  teachingExperience: string | null;
  yearsExperience: number | null;
  profileVisibility: "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
  verifiedAt: string | null;
  verifiedByAdmin: {
    id: string;
    name: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

type UserData = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

type StudentData = {
  id: string;
  studentId: string;
  gender: "MALE" | "FEMALE";
  status: "ACTIVE" | "GRADUATED" | "SUSPENDED" | "WITHDRAWN";

  programme: {
    id: string;
    code: string;
    name: string;
    school: {
      id: string;
      code: string;
      name: string;
    };
    department: {
      id: string;
      code: string;
      name: string;
    } | null;
  };
  programmeYear: {
    id: string;
    yearNumber: number;
  };
  courses: Array<{
    id: string;
    status: "ENROLLED" | "COMPLETED" | "DROPPED" | "REPEATING";
    semester: number | null;
    course: {
      id: string;
      code: string;
      name: string;
    };
  }>;
};

type Offering = {
  id: string;
  course: {
    id: string;
    code: string;
    name: string;
  };
  title: string | null;
  description: string | null;
  rate: string;
  currency: string;
  sessionDurationMinutes: number;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  verificationStatus: VerificationStatus;
  rateType:
    | "PER_SESSION"
    | "PER_HOUR"
    | "PER_WEEK"
    | "PER_MONTH"
    | "PER_COURSE"
    | "CUSTOM";
  rateDetails: string | null;
  createdAt: string;
  updatedAt: string;
  topics: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
};

type Availability = {
  id: string;
  day:
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY";
  startMinute: number;
  endMinute: number;
  timezone: string;
  isActive: boolean;
  offering: {
    id: string;
    course: {
      code: string;
      name: string;
    };
  };
};

type Experience = {
  id: string;
  title: string;
  organisation: string | null;
  description: string | null;
  startYear: number | null;
  endYear: number | null;
  createdAt: string;
};

type Qualification = {
  id: string;
  name: string;
  issuer: string | null;
  year: number | null;
  credentialUrl: string | null;
  createdAt: string;
};

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
};

type VerificationHistory = {
  id: string;
  status: VerificationStatus;
  notes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  reviewedByAdmin: {
    id: string;
    name: string;
  } | null;
};

type DetailResponse = {
  profile: ProfileData;
  user: UserData;
  university: {
    id: string;
    code: string;
    name: string;
  };
  student: StudentData | null;
  offerings: Offering[];
  availability: Availability[];
  experiences: Experience[];
  qualifications: Qualification[];
  reviews: Review[];
  verificationHistory: VerificationHistory[];
};

const DAY_LABELS: Record<Availability["day"], string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

/* The review is split into focused views. Only one is shown at a time. */
const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "academic", label: "Academic record" },
  { id: "profile", label: "Profile" },
  { id: "offerings", label: "Courses offered" },
  { id: "background", label: "Background" },
  { id: "availability", label: "Availability" },
  { id: "reviews", label: "Reviews" },
  { id: "history", label: "History" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-1";

/* Height of one sidebar item (h-10 = 40px) plus the 4px gap between items. */
const NAV_STEP = 44;

/*
 * Motion is kept to moments that respond to the admin's actions:
 * switching sections, opening a dialog, new messages, and the progress ring.
 * All of it is disabled for people who prefer reduced motion.
 */
const MOTION_CSS = `
@keyframes am-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes am-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes am-pop { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes am-drop { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
@keyframes am-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.am-rise { animation: am-rise .36s cubic-bezier(.2,.7,.2,1) both; }
.am-fade { animation: am-fade .2s ease-out both; }
.am-pop { animation: am-pop .26s cubic-bezier(.2,.8,.2,1) both; }
.am-drop { animation: am-drop .28s cubic-bezier(.2,.7,.2,1) both; }
.am-shimmer {
  background: linear-gradient(90deg, #e7e5e4 25%, #f5f5f4 50%, #e7e5e4 75%);
  background-size: 200% 100%;
  animation: am-shimmer 1.5s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .am-rise, .am-fade, .am-pop, .am-drop, .am-shimmer { animation: none !important; }
}
`;

function MotionStyles() {
  return <style>{MOTION_CSS}</style>;
}

/* Inline SVG icons (24px grid, stroke style). No extra dependency needed. */
type IconProps = {
  className?: string;
  strokeWidth?: number;
  filled?: boolean;
};

function IconBase({
  className = "h-4 w-4",
  strokeWidth = 1.75,
  filled = false,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

function IconOverview(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </IconBase>
  );
}

function IconAcademic(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </IconBase>
  );
}

function IconProfile(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </IconBase>
  );
}

function IconCourses(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </IconBase>
  );
}

function IconBackground(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </IconBase>
  );
}

function IconAvailability(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </IconBase>
  );
}

function IconStar(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
    </IconBase>
  );
}

function IconHistory(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </IconBase>
  );
}

function IconCheck(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 6 9 17l-5-5" />
    </IconBase>
  );
}

function IconX(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </IconBase>
  );
}

function IconExternal(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </IconBase>
  );
}

function IconAlert(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </IconBase>
  );
}

function IconLogout(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5m5 5H3" />
    </IconBase>
  );
}

const SECTION_ICONS: Record<SectionId, typeof IconOverview> = {
  overview: IconOverview,
  academic: IconAcademic,
  profile: IconProfile,
  offerings: IconCourses,
  background: IconBackground,
  availability: IconAvailability,
  reviews: IconStar,
  history: IconHistory,
};

function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;

  return `${displayHour}:${String(mins).padStart(2, "0")} ${suffix}`;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-ZM", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return DATE_FORMATTER.format(date);
}

const RATE_TYPE_LABEL: Record<Offering["rateType"], string> = {
  PER_SESSION: "session",
  PER_HOUR: "hour",
  PER_WEEK: "week",
  PER_MONTH: "month",
  PER_COURSE: "course",
  CUSTOM: "",
};

function formatRate(
  rate: string,
  currency: string,
  rateType: Offering["rateType"]
) {
  const amount = Number(rate);

  if (!Number.isFinite(amount)) {
    return `${currency} ${rate}`;
  }

  if (amount === 0) {
    return "Free";
  }

  const suffix = RATE_TYPE_LABEL[rateType];

  return suffix
    ? `${currency} ${amount.toLocaleString("en-ZM")} / ${suffix}`
    : `${currency} ${amount.toLocaleString("en-ZM")}`;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function labelFor(value: string) {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const STATUS_TONE: Record<
  string,
  { dot: string; light: string; dark: string }
> = {
  PENDING: {
    dot: "bg-amber-500",
    light: "text-amber-800",
    dark: "text-amber-300",
  },
  VERIFIED: {
    dot: "bg-emerald-500",
    light: "text-emerald-800",
    dark: "text-emerald-300",
  },
  REJECTED: {
    dot: "bg-red-500",
    light: "text-red-800",
    dark: "text-red-300",
  },
  UNVERIFIED: {
    dot: "bg-stone-400",
    light: "text-stone-600",
    dark: "text-stone-300",
  },
  ACTIVE: {
    dot: "bg-emerald-500",
    light: "text-emerald-800",
    dark: "text-emerald-300",
  },
  INACTIVE: {
    dot: "bg-stone-400",
    light: "text-stone-600",
    dark: "text-stone-300",
  },
  SUSPENDED: {
    dot: "bg-red-500",
    light: "text-red-800",
    dark: "text-red-300",
  },
  GRADUATED: {
    dot: "bg-sky-500",
    light: "text-sky-800",
    dark: "text-sky-300",
  },
  WITHDRAWN: {
    dot: "bg-stone-400",
    light: "text-stone-600",
    dark: "text-stone-300",
  },
};

function StatusBadge({
  status,
  onDark = false,
}: {
  status: VerificationStatus | ProfileStatus | StudentData["status"];
  onDark?: boolean;
}) {
  const style = STATUS_TONE[status] ?? STATUS_TONE.UNVERIFIED;

  return (
    <span
      className={`inline-flex items-center gap-2 text-sm font-medium ${
        onDark ? style.dark : style.light
      }`}
    >
      <span className="relative flex h-2 w-2">
        {status === "PENDING" && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden ${style.dot}`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${style.dot}`}
        />
      </span>
      {labelFor(status)}
    </span>
  );
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function TopBar({
  label,
  onSignOut,
  signingOut,
}: {
  label: string;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <Link
        href="/admin/academic-mates"
        className={`text-sm font-medium text-[#7d1f2a] hover:underline ${FOCUS_RING}`}
      >
        {label}
      </Link>

      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className={`inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900 disabled:opacity-60 ${FOCUS_RING}`}
      >
        <IconLogout />
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 text-[15px] text-stone-900">{children}</dd>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-stone-500">{children}</p>;
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-stone-900">{children}</h3>;
}

function SectionNav({
  items,
  activeId,
  onSelect,
  variant,
}: {
  items: Array<{ id: SectionId; label: string; count?: number }>;
  activeId: SectionId;
  onSelect: (id: SectionId) => void;
  variant: "sidebar" | "tabs";
}) {
  const activeIdx = Math.max(
    0,
    items.findIndex((item) => item.id === activeId)
  );

  if (variant === "tabs") {
    return (
      <nav
        aria-label="Review sections"
        className="sticky top-0 z-20 -mx-4 mb-6 border-b border-stone-200 bg-[#f7f6f4]/90 backdrop-blur-md sm:-mx-6 xl:hidden"
      >
        <ul className="flex overflow-x-auto px-4 sm:px-6">
          {items.map((item) => {
            const active = item.id === activeId;
            const Icon = SECTION_ICONS[item.id];

            return (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={`relative inline-flex items-center gap-2 whitespace-nowrap px-3 py-3 text-sm transition-colors duration-200 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:bg-[#7d1f2a] after:transition-transform after:duration-300 motion-reduce:after:transition-none ${FOCUS_RING} ${
                    active
                      ? "font-semibold text-[#7d1f2a] after:scale-x-100"
                      : "text-stone-600 after:scale-x-0 hover:text-stone-900"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Review sections" className="sticky top-8">
      <ul className="relative flex flex-col gap-1">
        {/* Sliding highlight that follows the active item */}
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 h-10 w-full rounded-lg bg-white shadow-sm shadow-stone-900/5 ring-1 ring-stone-200 transition-transform duration-300 ease-[cubic-bezier(.3,.7,.2,1)] motion-reduce:transition-none"
          style={{ transform: `translateY(${activeIdx * NAV_STEP}px)` }}
        >
          <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r bg-[#7d1f2a]" />
        </span>

        {items.map((item) => {
          const active = item.id === activeId;
          const Icon = SECTION_ICONS[item.id];

          return (
            <li key={item.id} className="relative z-10">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 w-full items-center justify-between rounded-lg px-4 text-left text-sm transition-colors duration-200 ${FOCUS_RING} ${
                  active
                    ? "font-semibold text-[#7d1f2a]"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </span>

                {item.count !== undefined && item.count > 0 && (
                  <span className="text-xs tabular-nums text-stone-400">
                    {item.count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ChecklistItem({
  label,
  complete,
  index,
}: {
  label: string;
  complete: boolean;
  index: number;
}) {
  return (
    <li
      className="am-rise flex items-center gap-3 text-[15px]"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          complete
            ? "bg-emerald-100 text-emerald-700"
            : "border border-stone-300"
        }`}
      >
        {complete && <IconCheck className="h-3 w-3" strokeWidth={3} />}
      </span>

      <span className={complete ? "text-stone-800" : "text-stone-500"}>
        {label}
        <span className="sr-only">
          {complete ? " (complete)" : " (missing)"}
        </span>
      </span>
    </li>
  );
}

export default function AcademicMateVerificationDetailPage() {
  const params = useParams<{
    academicMateId: string;
  }>();

  const academicMateId = params.academicMateId;

  const [data, setData] = useState<DetailResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [decision, setDecision] = useState<"VERIFIED" | "REJECTED" | null>(
    null
  );

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [success, setSuccess] = useState("");

  const [activeSection, setActiveSection] = useState<SectionId>("overview");

  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    try {
      setSigningOut(true);

      const result = await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.replace("/login");
          },
        },
      });

      if (result?.error) {
        throw new Error(result.error.message);
      }
    } catch {
      setSigningOut(false);
      setError("Unable to sign out. Please try again.");
    }
  }

  const abortRef = useRef<AbortController | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);

  const loadProfile = useCallback(
    async (showLoading = true) => {
      /* Cancel any request still in flight so an old response can never
         overwrite a newer one. */
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (showLoading) {
          setLoading(true);
        }

        setError("");

        const response = await fetch(
          `/api/admin/academic-mates/verification/${academicMateId}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const json = await readJson<DetailResponse | { error?: string }>(
          response
        );

        if (!response.ok) {
          throw new Error(
            json && "error" in json && json.error
              ? json.error
              : "Unable to load the Academic Mate profile."
          );
        }

        if (!json || !("profile" in json)) {
          throw new Error("The server returned an invalid response.");
        }

        setData(json);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load the Academic Mate profile."
        );
      } finally {
        if (showLoading && abortRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [academicMateId]
  );

  useEffect(() => {
    void loadProfile(); // eslint-disable-line react-hooks/set-state-in-effect

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [loadProfile]);

  const currentCurriculumCourseIds = useMemo(() => {
    if (!data?.student) {
      return new Set<string>();
    }

    return new Set(data.student.courses.map((course) => course.course.id));
  }, [data]);

  /* Derived values are memoised so typing in the notes box does not
     recompute them on every keystroke. */
  const derived = useMemo(() => {
    if (!data) {
      return null;
    }

    const {
      profile,
      student,
      offerings,
      availability,
      experiences,
      qualifications,
      reviews,
      verificationHistory,
    } = data;

    const averageRating =
      reviews.length > 0
        ? (
            reviews.reduce((sum, review) => sum + review.rating, 0) /
            reviews.length
          ).toFixed(1)
        : null;

    const checklist = [
      {
        label: "Active student profile",
        complete: student?.status === "ACTIVE",
      },
      {
        label: "Headline provided",
        complete: Boolean(profile.headline?.trim()),
      },
      {
        label: "Biography provided",
        complete: Boolean(profile.bio?.trim()),
      },
      {
        label: "Active offering",
        complete: offerings.some((offering) => offering.status === "ACTIVE"),
      },
      {
        label: "Academic identity",
        complete: Boolean(student?.programme && student.programmeYear),
      },
    ];

    const sectionCounts: Partial<Record<SectionId, number>> = {
      academic: student?.courses.length ?? 0,
      offerings: offerings.length,
      background: experiences.length + qualifications.length,
      availability: availability.length,
      reviews: reviews.length,
      history: verificationHistory.length,
    };

    const navItems = SECTIONS.map((section) => ({
      id: section.id,
      label: section.label,
      count: sectionCounts[section.id],
    }));

    return { averageRating, checklist, navItems };
  }, [data]);

  /* Close the confirmation dialog with Escape. */
  useEffect(() => {
    if (!decision || submitting) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDecision(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [decision, submitting]);

  function goToSection(id: SectionId) {
    setActiveSection(id);

    /* If the top of the pane has scrolled out of view, bring it back. */
    const pane = paneRef.current;

    if (pane && pane.getBoundingClientRect().top < 0) {
      pane.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function submitDecision() {
    if (!decision || submitting) {
      return;
    }

    if (decision === "REJECTED" && !notes.trim()) {
      setError("A reason is required when rejecting an application.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/admin/academic-mates/verification/${academicMateId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            decision,
            notes: notes.trim() || null,
          }),
        }
      );

      const json = await readJson<{ message?: string; error?: string }>(
        response
      );

      if (!response.ok) {
        throw new Error(json?.error ?? "Unable to process the verification.");
      }

      setSuccess(json?.message ?? "Verification decision saved.");

      setDecision(null);
      setNotes("");

      await loadProfile(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to process the verification."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f6f4] text-stone-900">
        <MotionStyles />

        <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="am-shimmer h-4 w-40 rounded" />

          <div className="mt-6 flex items-center gap-4">
            <div className="am-shimmer h-12 w-12 rounded-full" />
            <div className="am-shimmer h-8 w-64 rounded" />
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="am-shimmer h-[28rem] rounded-2xl" />
            <div className="am-shimmer h-72 rounded-2xl" />
          </div>
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="min-h-screen bg-[#f7f6f4] text-stone-900">
        <MotionStyles />

        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <TopBar
            label="Back to Academic Mates"
            onSignOut={handleSignOut}
            signingOut={signingOut}
          />

          <div
            role="alert"
            className="am-pop mt-6 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm shadow-stone-900/5"
          >
            <h1 className="text-lg font-semibold">Unable to load applicant</h1>

            <p className="mt-2 text-sm text-stone-600">{error}</p>

            <button
              type="button"
              onClick={() => void loadProfile()}
              className={`mt-5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 active:scale-[0.98] ${FOCUS_RING}`}
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!data || !derived) {
    return null;
  }

  const {
    profile,
    user,
    university,
    student,
    offerings,
    availability,
    experiences,
    qualifications,
    reviews,
    verificationHistory,
  } = data;

  const isPending = profile.verificationStatus === "PENDING";

  const { averageRating, checklist, navItems } = derived;

  const activeIndex = SECTIONS.findIndex(
    (section) => section.id === activeSection
  );
  const previousSection = activeIndex > 0 ? SECTIONS[activeIndex - 1] : null;
  const nextSection =
    activeIndex < SECTIONS.length - 1 ? SECTIONS[activeIndex + 1] : null;

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[#f7f6f4] text-stone-900">
      <MotionStyles />

      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="am-rise pb-6">
          <TopBar
            label="Academic Mate Verification"
            onSignOut={handleSignOut}
            signingOut={signingOut}
          />

          <div className="overflow-hidden rounded-2xl border border-[#6f1c27] bg-[#7d1f2a] text-white shadow-md shadow-[#7d1f2a]/20">
            <div className="flex flex-col gap-6 px-6 py-7 sm:px-8 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                {user.image ? (
                  <Image
                    src={user.image}
                    alt="" width={64} height={64} unoptimized
                    className="h-16 w-16 rounded-full border-2 border-white/30 object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-lg font-semibold"
                  >
                    {initials(user.name)}
                  </div>
                )}

                <div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <h1 className="text-2xl font-semibold">{user.name}</h1>

                    <StatusBadge status={profile.verificationStatus} onDark />
                  </div>

                  <p className="mt-1 text-sm text-white/75">
                    Academic Mate verification
                  </p>
                </div>
              </div>

              <div className="text-left md:text-right">
                <p className="text-sm text-white/60">University</p>
                <p className="mt-1 font-medium">{university.name}</p>
                <p className="text-sm text-white/70">{university.code}</p>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="am-drop mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="am-drop mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            {success}
          </div>
        )}

        {/* Tabs for small and medium screens */}
        <SectionNav
          items={navItems}
          activeId={activeSection}
          onSelect={goToSection}
          variant="tabs"
        />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[200px_minmax(0,1fr)_300px]">
          {/* Sidebar navigation for wide screens */}
          <div className="hidden xl:block">
            <SectionNav
              items={navItems}
              activeId={activeSection}
              onSelect={goToSection}
              variant="sidebar"
            />
          </div>

          {/* One section at a time */}
          <div
            id="review-pane"
            ref={paneRef}
            className="min-w-0 scroll-mt-16 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm shadow-stone-900/5"
          >
            <section
              key={activeSection}
              aria-labelledby="pane-title"
              className="am-rise px-6 py-8 sm:px-10 sm:py-10"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2
                  id="pane-title"
                  className="text-xl font-semibold tracking-tight"
                >
                  {SECTIONS[activeIndex].label}
                </h2>

                {activeSection === "reviews" && averageRating && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7d1f2a]">
                    <IconStar filled strokeWidth={1.5} className="h-4 w-4" />
                    {averageRating} average
                  </span>
                )}
              </div>

              <div className="mt-8">
                {activeSection === "overview" && (
                  <div className="space-y-10">
                    <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                      <Field label="University">
                        {university.name}
                        <span className="block text-sm text-stone-500">
                          {university.code}
                        </span>
                      </Field>

                      <Field label="Email">
                        <span className="break-all">{user.email}</span>
                      </Field>

                      <Field label="Student ID">
                        {student ? student.studentId : "No linked profile"}
                      </Field>

                      <Field label="Programme">
                        {student ? (
                          <>
                            {student.programme.name}
                            <span className="block text-sm text-stone-500">
                              Year {student.programmeYear.yearNumber}
                            </span>
                          </>
                        ) : (
                          "Not available"
                        )}
                      </Field>

                      <Field label="Applied">
                        {formatDate(profile.createdAt)}
                      </Field>

                      <Field label="Profile status">
                        <StatusBadge status={profile.status} />
                      </Field>
                    </dl>

                    <div>
                      <SubHeading>Checklist</SubHeading>

                      <ul className="mt-4 space-y-3">
                        {checklist.map((item, index) => (
                          <ChecklistItem
                            key={item.label}
                            label={item.label}
                            complete={item.complete}
                            index={index}
                          />
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {activeSection === "academic" && (
                  <div className="space-y-10">
                    {student ? (
                      <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                        <Field label="Student ID">{student.studentId}</Field>

                        <Field label="Student status">
                          <StatusBadge status={student.status} />
                        </Field>

                        <Field label="Gender">
                          {student.gender === "MALE" ? "Male" : "Female"}
                        </Field>

                        <Field label="School">
                          {student.programme.school.name}
                        </Field>
                        
                        <Field label="Department">
                          {student.programme.department?.name ?? "Not assigned"}
                        </Field>

                        <Field label="Programme">
                          {student.programme.name}
                          <span className="block text-sm text-stone-500">
                            {student.programme.code}
                          </span>
                        </Field>

                        <Field label="Programme year">
                          Year {student.programmeYear.yearNumber}
                        </Field>
                      </dl>
                    ) : (
                      <EmptyState>
                        No linked student profile was found.
                      </EmptyState>
                    )}

                    <div>
                      <SubHeading>Current courses</SubHeading>

                      {student && student.courses.length > 0 ? (
                        <ul className="mt-3 divide-y divide-stone-100">
                          {student.courses.map((course) => (
                            <li
                              key={course.id}
                              className="-mx-3 flex items-baseline gap-4 rounded-lg px-3 py-3 text-[15px] transition-colors duration-150 hover:bg-stone-50"
                            >
                              <span className="w-24 shrink-0 font-medium">
                                {course.course.code}
                              </span>
                              <span className="text-stone-600">
                                {course.course.name}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-3">
                          <EmptyState>
                            No current course enrolments found.
                          </EmptyState>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeSection === "profile" && (
                  <dl className="space-y-8">
                    <div>
                      <dt className="text-sm text-stone-500">Headline</dt>
                      <dd className="mt-1 text-lg font-medium">
                        {profile.headline || "No headline provided."}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-sm text-stone-500">About</dt>
                      <dd className="mt-2 max-w-prose whitespace-pre-wrap text-[15px] leading-7 text-stone-700">
                        {profile.bio || "No biography provided."}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-sm text-stone-500">
                        Teaching experience
                      </dt>
                      <dd className="mt-2 max-w-prose whitespace-pre-wrap text-[15px] leading-7 text-stone-700">
                        {profile.teachingExperience || "Not provided."}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-sm text-stone-500">
                        Years of experience
                      </dt>
                      <dd className="mt-1 text-[15px]">
                        {profile.yearsExperience === null
                          ? "Not provided"
                          : `${profile.yearsExperience} ${
                              profile.yearsExperience === 1 ? "year" : "years"
                            }`}
                      </dd>
                    </div>
                  </dl>
                )}

                {activeSection === "offerings" &&
                  (offerings.length === 0 ? (
                    <EmptyState>
                      No Academic Mate offerings have been added.
                    </EmptyState>
                  ) : (
                    <ul className="divide-y divide-stone-200">
                      {offerings.map((offering) => {
                        const outside = !currentCurriculumCourseIds.has(
                          offering.course.id
                        );

                        return (
                          <li
                            key={offering.id}
                            className="py-7 first:pt-0 last:pb-0"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-[15px] font-semibold">
                                  {offering.course.code}
                                  <span className="ml-2 font-normal text-stone-600">
                                    {offering.course.name}
                                  </span>
                                </p>

                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                                  <StatusBadge
                                    status={offering.verificationStatus}
                                  />

                                  {outside && (
                                    <span className="inline-flex items-center gap-1.5 text-sm text-amber-800">
                                      <IconAlert className="h-4 w-4" />
                                      Outside current curriculum
                                    </span>
                                  )}
                                </div>
                              </div>

                              <p className="text-[15px] font-medium tabular-nums sm:text-right">
                                {formatRate(
                                  offering.rate,
                                  offering.currency,
                                  offering.rateType
                                )}
                                <span className="block text-sm font-normal text-stone-500">
                                  {offering.sessionDurationMinutes} minutes
                                </span>
                              </p>
                            </div>

                            {offering.title && (
                              <p className="mt-4 text-[15px] font-medium">
                                {offering.title}
                              </p>
                            )}

                            {offering.description && (
                              <p className="mt-1 max-w-prose text-[15px] leading-7 text-stone-600">
                                {offering.description}
                              </p>
                            )}

                            {offering.rateDetails && (
                              <p className="mt-2 text-sm text-stone-500">
                                {offering.rateDetails}
                              </p>
                            )}

                            {offering.topics.length > 0 && (
                              <p className="mt-3 text-sm text-stone-500">
                                Topics:{" "}
                                {offering.topics
                                  .map((topic) => topic.name)
                                  .join(", ")}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ))}

                {activeSection === "background" && (
                  <div className="space-y-12">
                    <div>
                      <SubHeading>Experience</SubHeading>

                      {experiences.length === 0 ? (
                        <div className="mt-3">
                          <EmptyState>
                            No experience entries have been provided.
                          </EmptyState>
                        </div>
                      ) : (
                        <ul className="mt-4 space-y-7">
                          {experiences.map((experience) => (
                            <li key={experience.id}>
                              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                                <p className="text-[15px] font-medium">
                                  {experience.title}
                                  {experience.organisation && (
                                    <span className="font-normal text-stone-600">
                                      , {experience.organisation}
                                    </span>
                                  )}
                                </p>

                                {(experience.startYear ||
                                  experience.endYear) && (
                                  <p className="text-sm tabular-nums text-stone-500">
                                    {experience.startYear}
                                    {experience.startYear && experience.endYear
                                      ? " - "
                                      : ""}
                                    {experience.endYear}
                                  </p>
                                )}
                              </div>

                              {experience.description && (
                                <p className="mt-2 max-w-prose whitespace-pre-wrap text-[15px] leading-7 text-stone-600">
                                  {experience.description}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <SubHeading>Qualifications</SubHeading>

                      {qualifications.length === 0 ? (
                        <div className="mt-3">
                          <EmptyState>
                            No qualifications have been provided.
                          </EmptyState>
                        </div>
                      ) : (
                        <ul className="mt-3 divide-y divide-stone-100">
                          {qualifications.map((qualification) => (
                            <li
                              key={qualification.id}
                              className="-mx-3 flex flex-col gap-1 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-stone-50 sm:flex-row sm:items-baseline sm:justify-between"
                            >
                              <p className="text-[15px]">
                                <span className="font-medium">
                                  {qualification.name}
                                </span>

                                {(qualification.issuer ||
                                  qualification.year) && (
                                  <span className="text-stone-600">
                                    , {qualification.issuer}
                                    {qualification.issuer && qualification.year
                                      ? ", "
                                      : ""}
                                    {qualification.year}
                                  </span>
                                )}
                              </p>

                              {qualification.credentialUrl && (
                                <a
                                  href={qualification.credentialUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`inline-flex items-center gap-1.5 text-sm font-medium text-[#7d1f2a] hover:underline ${FOCUS_RING}`}
                                >
                                  View credential
                                  <IconExternal className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {activeSection === "availability" &&
                  (availability.length === 0 ? (
                    <EmptyState>No availability has been provided.</EmptyState>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[30rem] text-left text-[15px]">
                        <thead>
                          <tr className="border-b border-stone-200 text-sm text-stone-500">
                            <th scope="col" className="py-2 pr-4 font-normal">
                              Day
                            </th>
                            <th scope="col" className="py-2 pr-4 font-normal">
                              Time
                            </th>
                            <th scope="col" className="py-2 pr-4 font-normal">
                              Course
                            </th>
                            <th scope="col" className="py-2 font-normal">
                              Status
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-stone-100">
                          {availability.map((item) => (
                            <tr
                              key={item.id}
                              className="transition-colors duration-150 hover:bg-stone-50"
                            >
                              <td className="py-3 pr-4 font-medium">
                                {DAY_LABELS[item.day]}
                              </td>
                              <td className="py-3 pr-4 tabular-nums text-stone-700">
                                {formatTime(item.startMinute)} -{" "}
                                {formatTime(item.endMinute)}
                                <span className="block text-xs text-stone-400">
                                  {item.timezone}
                                </span>
                              </td>
                              <td className="py-3 pr-4">
                                {item.offering.course.code}
                              </td>
                              <td className="py-3">
                                <StatusBadge
                                  status={item.isActive ? "ACTIVE" : "INACTIVE"}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                {activeSection === "reviews" &&
                  (reviews.length === 0 ? (
                    <EmptyState>No reviews yet.</EmptyState>
                  ) : (
                    <ul className="divide-y divide-stone-200">
                      {reviews.map((review) => (
                        <li key={review.id} className="py-5 first:pt-0">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-[15px] font-medium">
                              {review.reviewerName}
                            </p>

                            <span
                              role="img"
                              className="inline-flex items-center gap-0.5"
                              aria-label={`${review.rating} out of 5`}
                            >
                              {Array.from({ length: 5 }, (_, starIndex) => (
                                <IconStar
                                  key={starIndex}
                                  filled={
                                    starIndex <
                                    Math.max(0, Math.min(5, review.rating))
                                  }
                                  strokeWidth={1.5}
                                  className={`h-4 w-4 ${
                                    starIndex <
                                    Math.max(0, Math.min(5, review.rating))
                                      ? "text-[#7d1f2a]"
                                      : "text-stone-300"
                                  }`}
                                />
                              ))}
                            </span>
                          </div>

                          {review.comment && (
                            <p className="mt-2 max-w-prose text-[15px] leading-7 text-stone-600">
                              {review.comment}
                            </p>
                          )}

                          <p className="mt-2 text-sm text-stone-400">
                            {formatDate(review.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ))}

                {activeSection === "history" &&
                  (verificationHistory.length === 0 ? (
                    <EmptyState>No verification history exists.</EmptyState>
                  ) : (
                    <ol className="space-y-7">
                      {verificationHistory.map((entry) => (
                        <li key={entry.id}>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <StatusBadge status={entry.status} />

                            <span className="text-sm text-stone-400">
                              {formatDate(entry.createdAt)}
                            </span>
                          </div>

                          {entry.notes && (
                            <p className="mt-2 max-w-prose whitespace-pre-wrap text-[15px] leading-7 text-stone-700">
                              {entry.notes}
                            </p>
                          )}

                          {entry.reviewedByAdmin && (
                            <p className="mt-1 text-sm text-stone-500">
                              Reviewed by {entry.reviewedByAdmin.name}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  ))}
              </div>
            </section>

            {/* Previous / next */}
            <div className="flex items-center justify-between border-t border-stone-100 bg-stone-50/60 px-6 py-4 sm:px-10">
              {previousSection ? (
                <button
                  type="button"
                  onClick={() => goToSection(previousSection.id)}
                  className={`rounded-lg px-2 py-1 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 ${FOCUS_RING}`}
                >
                  {previousSection.label}
                </button>
              ) : (
                <span />
              )}

              {nextSection ? (
                <button
                  type="button"
                  onClick={() => goToSection(nextSection.id)}
                  className={`rounded-lg px-2 py-1 text-sm font-medium text-[#7d1f2a] hover:underline ${FOCUS_RING}`}
                >
                  {nextSection.label}
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>

          {/* Decision */}
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm shadow-stone-900/5">
              <h2 className="text-sm font-semibold">Decision</h2>

              {isPending ? (
                <>
                  <label
                    htmlFor="verification-notes"
                    className="mt-4 block text-sm text-stone-700"
                  >
                    Notes
                  </label>

                  <textarea
                    id="verification-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={2000}
                    rows={5}
                    placeholder="Required when rejecting"
                    className="mt-1.5 w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/15"
                  />

                  <p className="mt-1 text-right text-xs tabular-nums text-stone-400">
                    {notes.length} / 2000
                  </p>

                  <div className="mt-4 grid gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setDecision("VERIFIED")}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#7d1f2a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#681923] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
                    >
                      <IconCheck className="h-4 w-4" strokeWidth={2.25} />
                      Verify Academic Mate
                    </button>

                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setDecision("REJECTED")}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-red-800 transition hover:bg-red-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
                    >
                      <IconX className="h-4 w-4" strokeWidth={2.25} />
                      Reject application
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
                  <StatusBadge status={profile.verificationStatus} />

                  {profile.verifiedAt && (
                    <p>
                      Verified on {formatDate(profile.verifiedAt)}
                      {profile.verifiedByAdmin
                        ? ` by ${profile.verifiedByAdmin.name}`
                        : ""}
                      .
                    </p>
                  )}

                  <p>
                    This application has already been processed. A new
                    submission will be required before it can be reviewed again.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {decision && (
        <div
          className="am-fade fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 px-4 backdrop-blur-sm"
          onClick={() => {
            if (!submitting) {
              setDecision(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-dialog-title"
            onClick={(event) => event.stopPropagation()}
            className="am-pop w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 id="decision-dialog-title" className="text-lg font-semibold">
              {decision === "VERIFIED"
                ? "Verify Academic Mate?"
                : "Reject Academic Mate?"}
            </h2>

            <p className="mt-2 text-sm leading-6 text-stone-600">
              {decision === "VERIFIED"
                ? "This will mark the Academic Mate profile as verified and record you as the reviewing administrator."
                : "This will reject the application. The applicant will need to correct the issue and submit again."}
            </p>

            {decision === "REJECTED" && !notes.trim() && (
              <div className="am-drop mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                A rejection reason is required. Close this dialog and add notes.
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setDecision(null)}
                className={`rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 active:scale-[0.98] disabled:opacity-50 ${FOCUS_RING}`}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  submitting || (decision === "REJECTED" && !notes.trim())
                }
                onClick={() => void submitDecision()}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} ${
                  decision === "VERIFIED"
                    ? "bg-[#7d1f2a] hover:bg-[#681923]"
                    : "bg-red-800 hover:bg-red-900"
                }`}
              >
                {submitting
                  ? "Processing..."
                  : decision === "VERIFIED"
                  ? "Confirm verification"
                  : "Confirm rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
