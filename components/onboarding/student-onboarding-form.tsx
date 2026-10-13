"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type University = {
  id: string;
  code: string;
  name: string;
  slug: string;
};

type UniversitySettings = {
  studentIdMinLength: number;
  studentIdMaxLength: number;
  studentIdPrefix: string | null;
  studentIdPattern: string | null;
  requireUniversityEmail: boolean;
  universityEmailDomain: string | null;
};

type School = {
  id: string;
  code: string;
  name: string;
};

type Department = {
  id: string;
  code: string;
  name: string;
};

type Programme = {
  id: string;
  code: string;
  name: string;
  level: string;
  durationYears: number | null;
};

type ProgrammeYear = {
  id: string;
  yearNumber: number;
};

type ElectiveGroup = {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
};

type ProgrammeCourse = {
  id: string;
  semester: number | null;
  isCompulsory: boolean;
  electiveGroup: ElectiveGroup | null;
  course: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    credits: string | number | null;
    isActive?: boolean;
  };
};

type SuccessCourse = {
  id: string;
  semester: number | null;
  isCompulsory: boolean;
  electiveGroup: ElectiveGroup | null;
  course: {
    id: string;
    code: string;
    name: string;
  };
};

type Props = {
  userName: string;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();

  if (!response.ok) {
    if (contentType.includes("application/json")) {
      try {
        const data = JSON.parse(rawBody) as { error?: string };

        throw new Error(
          data.error || `Request failed with status ${response.status}.`
        );
      } catch (error) {
        if (error instanceof Error && error.message) {
          throw error;
        }
      }
    }

    throw new Error(
      `Request failed with status ${response.status}. Check that the API route exists.`
    );
  }

  if (!contentType.includes("application/json")) {
    throw new Error(
      `Expected a JSON response from ${url}, but received ${
        contentType || "non-JSON content"
      }.`
    );
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw new Error(`The server returned invalid JSON from ${url}.`);
  }
}

/*
 * Zambian mobile numbers: +260 followed by 9 digits.
 * National format is 0XX XXX XXXX where XX is 95/96/97 (Zamtel/MTN/Airtel),
 * 75/76/77 or 55/56/57. The leading 0 is replaced by +260.
 */
const ZAMBIA_MOBILE_PATTERN = /^[579][567]\d{7}$/;

function normalizeZambianInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("260")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 9);
}

function formatZambianNumber(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 9)]
    .filter(Boolean)
    .join(" ");
}

function getPhoneError(digits: string): string {
  if (!digits) {
    return "";
  }

  if (digits.length < 9) {
    return "Enter all 9 digits, for example 97 123 4567.";
  }

  if (!ZAMBIA_MOBILE_PATTERN.test(digits)) {
    return "Enter a valid Zambian mobile number, for example 097 123 4567.";
  }

  return "";
}

function ZambiaFlag({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 30 20"
      role="img"
      aria-label="Zambia flag"
      className={className}
    >
      <rect width="30" height="20" fill="#198a00" />
      <rect x="21" y="10" width="3" height="10" fill="#de2010" />
      <rect x="24" y="10" width="3" height="10" fill="#000000" />
      <rect x="27" y="10" width="3" height="10" fill="#ef7d00" />
      <path
        d="M25.5 2.6l1.3 1.5 2.4-.9-1.4 2.1 1.2 1.4-2.2-.2-1.3 1.7-1.3-1.7-2.2.2 1.2-1.4-1.4-2.1 2.4.9z"
        fill="#ef7d00"
      />
    </svg>
  );
}

/* ---------- icons ---------- */

type IconName =
  | "check"
  | "arrow"
  | "login"
  | "dashboard"
  | "alert"
  | "shield"
  | "spinner"
  | "chevron";

function Icon({
  name,
  className = "h-4 w-4",
}: {
  name: IconName;
  className?: string;
}) {
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
    case "check":
      return (
        <svg {...props}>
          <path d="m5 12 4.5 4.5L19 7" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...props}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "login":
      return (
        <svg {...props}>
          <path d="M10 17l5-5-5-5M15 12H3M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
        </svg>
      );
    case "dashboard":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="8" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="15" width="7" height="6" rx="1" />
        </svg>
      );
    case "alert":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "spinner":
      return (
        <svg {...props} className={`${className} animate-spin`}>
          <path d="M12 3a9 9 0 1 0 9 9" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...props}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
  }
}

/* ---------- motion (subtle, and disabled for reduced-motion users) ---------- */

const ANIMATIONS = `
@keyframes ob-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes ob-fade{from{opacity:0}to{opacity:1}}
@keyframes ob-draw{to{stroke-dashoffset:0}}
@keyframes ob-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
.ob-rise{opacity:0;animation:ob-rise .4s cubic-bezier(.2,.8,.2,1) forwards}
.ob-fade{animation:ob-fade .35s ease both}
.ob-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:ob-draw .6s ease forwards}
.ob-skeleton{background:linear-gradient(90deg,#f5f5f4 25%,#fafaf9 50%,#f5f5f4 75%);background-size:200% 100%;animation:ob-shimmer 1.4s linear infinite}
@media (prefers-reduced-motion:reduce){.ob-rise,.ob-fade,.ob-draw,.ob-skeleton{animation:none!important;opacity:1;stroke-dashoffset:0}}
`;

/* ---------- shared pieces ---------- */

const primaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#7d1f2a] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#651822] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#7d1f2a]/20 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none";

const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-stone-300/50";

const inputClassName =
  "h-12 w-full rounded-lg border border-stone-300 bg-white px-3.5 text-base text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-[#7d1f2a] focus:ring-4 focus:ring-[#7d1f2a]/10 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 md:h-11 md:text-sm";

function AccountActions() {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-8">
      <Link href="/login" className={secondaryButtonClass}>
        <Icon name="login" />
        Go to login
      </Link>
      <Link href="/student/dashboard" className={primaryButtonClass}>
        <Icon name="dashboard" />
        Continue to dashboard
        <Icon name="arrow" />
      </Link>
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`grid gap-6 px-5 py-8 sm:px-8 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10 ${className}`}
    >
      <div>
        <h2 className="text-base font-semibold text-stone-900">{title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-stone-500">
          {description}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  reserveHint,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Reserve two lines for the hint so the layout never shifts. */
  reserveHint?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="text-sm font-medium text-stone-800">
        {label}
        {required ? (
          <span className="ml-0.5 text-[#7d1f2a]" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-stone-400">
            Optional
          </span>
        )}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {hint !== undefined || error ? (
        <span
          className={`mt-1.5 block text-xs leading-5 ${
            reserveHint ? "min-h-10" : "min-h-5"
          } ${error ? "text-red-700" : "text-stone-500"}`}
        >
          {error || hint}
        </span>
      ) : null}
    </label>
  );
}

function Select({
  children,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select
        {...props}
        className={`h-12 w-full appearance-none rounded-lg border border-stone-300 bg-white pl-3.5 pr-10 text-base text-stone-900 outline-none transition focus:border-[#7d1f2a] focus:ring-4 focus:ring-[#7d1f2a]/10 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 md:h-11 md:text-sm ${className}`}
      >
        {children}
      </select>
      <Icon
        name="chevron"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
      />
    </span>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "accent" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        tone === "accent"
          ? "bg-[#7d1f2a]/[0.07] text-[#7d1f2a]"
          : "bg-stone-100 text-stone-600"
      }`}
    >
      {children}
    </span>
  );
}

export default function StudentOnboardingForm({ userName }: Props) {
  const [universities, setUniversities] = useState<University[]>([]);
  const [settings, setSettings] = useState<UniversitySettings | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [years, setYears] = useState<ProgrammeYear[]>([]);
  const [programmeCourses, setProgrammeCourses] = useState<ProgrammeCourse[]>(
    []
  );

  const [universityId, setUniversityId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [programmeId, setProgrammeId] = useState("");
  const [programmeYearId, setProgrammeYearId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [gender, setGender] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [selectedElectiveCourseIds, setSelectedElectiveCourseIds] = useState<
    string[]
  >([]);
  const [informationConfirmed, setInformationConfirmed] = useState(false);

  const [loadingUniversities, setLoadingUniversities] = useState(true);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [alreadyOnboarded, setAlreadyOnboarded] = useState(false);
  const [success, setSuccess] = useState<{
    academicYear: string;
    courses: SuccessCourse[];
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUniversities() {
      try {
        setLoadingUniversities(true);
        setError("");

        const data = await getJson<{
          universities: University[];
        }>("/api/universities");

        if (!controller.signal.aborted) {
          setUniversities(data.universities);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(
            err instanceof Error ? err.message : "Unable to load universities."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingUniversities(false);
        }
      }
    }

    void loadUniversities();

    return () => controller.abort();
  }, []);

  /*
   * The dependent lists below are cleared by the change handlers
   * (handleUniversityChange, handleSchoolChange, ...), so these effects only
   * need to fetch. Resetting state inside an effect is not needed.
   */
  useEffect(() => {
    if (!universityId) return;

    const controller = new AbortController();

    async function loadUniversityData() {
      try {
        setError("");
        setLoadingSchools(true);

        const [settingsData, schoolsData] = await Promise.all([
          getJson<{ settings: UniversitySettings }>(
            `/api/universities/${encodeURIComponent(
              universityId
            )}/onboarding-settings`
          ),
          getJson<{ schools: School[] }>(
            `/api/universities/${encodeURIComponent(universityId)}/schools`
          ),
        ]);

        if (!controller.signal.aborted) {
          setSettings(settingsData.settings);
          setSchools(schoolsData.schools);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSettings(null);
          setSchools([]);

          setError(
            err instanceof Error ? err.message : "Unable to load university."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSchools(false);
        }
      }
    }

    void loadUniversityData();

    return () => controller.abort();
  }, [universityId]);

  useEffect(() => {
    if (!schoolId) return;

    const controller = new AbortController();

    async function loadDepartments() {
      try {
        setError("");
        setLoadingDepartments(true);

        const data = await getJson<{
          departments: Department[];
        }>(`/api/schools/${encodeURIComponent(schoolId)}/departments`);

        if (!controller.signal.aborted) {
          setDepartments(data.departments);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setDepartments([]);
          setError(
            err instanceof Error ? err.message : "Unable to load departments."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDepartments(false);
        }
      }
    }

    void loadDepartments();

    return () => controller.abort();
  }, [schoolId]);

  useEffect(() => {
    if (!departmentId) return;

    const controller = new AbortController();

    async function loadProgrammes() {
      try {
        setError("");
        setLoadingProgrammes(true);

        const data = await getJson<{
          programmes: Programme[];
        }>(`/api/departments/${encodeURIComponent(departmentId)}/programmes`);

        if (!controller.signal.aborted) {
          setProgrammes(data.programmes);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setProgrammes([]);
          setError(
            err instanceof Error ? err.message : "Unable to load programmes."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingProgrammes(false);
        }
      }
    }

    void loadProgrammes();

    return () => controller.abort();
  }, [departmentId]);

  useEffect(() => {
    if (!programmeId) return;

    const controller = new AbortController();

    async function loadYears() {
      try {
        setError("");
        setLoadingYears(true);

        const data = await getJson<{
          years: ProgrammeYear[];
        }>(`/api/programmes/${encodeURIComponent(programmeId)}/years`);

        if (!controller.signal.aborted) {
          setYears(data.years);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setYears([]);

          setError(
            err instanceof Error
              ? err.message
              : "Unable to load programme years."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingYears(false);
        }
      }
    }

    void loadYears();

    return () => controller.abort();
  }, [programmeId]);

  useEffect(() => {
    if (!programmeYearId) return;

    const controller = new AbortController();

    async function loadCourses() {
      try {
        setError("");
        setLoadingCourses(true);
        setSelectedElectiveCourseIds([]);

        const data = await getJson<{
          programmeCourses: ProgrammeCourse[];
        }>(
          `/api/programme-years/${encodeURIComponent(programmeYearId)}/courses`
        );

        if (!controller.signal.aborted) {
          setProgrammeCourses(data.programmeCourses);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setProgrammeCourses([]);
          setSelectedElectiveCourseIds([]);

          setError(
            err instanceof Error ? err.message : "Unable to load courses."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingCourses(false);
        }
      }
    }

    void loadCourses();

    return () => controller.abort();
  }, [programmeYearId]);

  // Bring the result screens into view after submitting.
  useEffect(() => {
    if (success || alreadyOnboarded) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [success, alreadyOnboarded]);

  const phoneError = getPhoneError(phoneNumber);
  const showPhoneError =
    phoneError !== "" && (phoneTouched || phoneNumber.length >= 9);

  const studentIdHint = useMemo(() => {
    if (!settings) {
      return "";
    }

    const lengthText =
      settings.studentIdMinLength === settings.studentIdMaxLength
        ? `${settings.studentIdMinLength} characters`
        : `${settings.studentIdMinLength} to ${settings.studentIdMaxLength} characters`;

    return settings.studentIdPrefix
      ? `Enter ${lengthText}, starting with ${settings.studentIdPrefix}.`
      : `Enter ${lengthText}.`;
  }, [settings]);

  const electiveGroups = useMemo(() => {
    const groups = new Map<string, ElectiveGroup>();

    for (const item of programmeCourses) {
      if (item.isCompulsory || !item.electiveGroup) {
        continue;
      }

      groups.set(item.electiveGroup.id, item.electiveGroup);
    }

    return Array.from(groups.values());
  }, [programmeCourses]);

  const compulsoryCourses = useMemo(
    () => programmeCourses.filter((course) => course.isCompulsory),
    [programmeCourses]
  );

  const electiveCourses = useMemo(
    () =>
      programmeCourses.filter(
        (course) => !course.isCompulsory && course.electiveGroup
      ),
    [programmeCourses]
  );

  function getGroupSelectedCount(groupId: string) {
    const courseIdsInGroup = new Set(
      electiveCourses
        .filter((course) => course.electiveGroup?.id === groupId)
        .map((course) => course.course.id)
    );

    return selectedElectiveCourseIds.filter((id) => courseIdsInGroup.has(id))
      .length;
  }

  function toggleElectiveCourse(course: ProgrammeCourse) {
    if (!course.electiveGroup) {
      return;
    }

    const courseId = course.course.id;
    const group = course.electiveGroup;
    const alreadySelected = selectedElectiveCourseIds.includes(courseId);

    if (alreadySelected) {
      setSelectedElectiveCourseIds((current) =>
        current.filter((id) => id !== courseId)
      );
      setError("");

      return;
    }

    const currentGroupCount = getGroupSelectedCount(group.id);

    if (currentGroupCount >= group.maxSelections) {
      setError(
        `${group.name}: select no more than ${group.maxSelections} course${
          group.maxSelections === 1 ? "" : "s"
        }.`
      );

      return;
    }

    setSelectedElectiveCourseIds((current) => [...current, courseId]);
    setError("");
  }

  function resetBelowUniversity() {
    setSchoolId("");
    setProgrammeId("");
    setProgrammeYearId("");
    setSchools([]);
    setProgrammes([]);
    setYears([]);
    setProgrammeCourses([]);
    setSelectedElectiveCourseIds([]);
    setSettings(null);
    setDepartmentId("");
    setDepartments([]);
  }

  function handleUniversityChange(value: string) {
    setUniversityId(value);
    resetBelowUniversity();
    setStudentId("");
    setError("");
    setSuccess(null);
  }

  function handleSchoolChange(value: string) {
    setSchoolId(value);
    setDepartmentId("");
    setProgrammeId("");
    setProgrammeYearId("");

    setDepartments([]);
    setProgrammes([]);
    setYears([]);
    setProgrammeCourses([]);
    setSelectedElectiveCourseIds([]);

    setError("");
    setSuccess(null);
  }

  function handleDepartmentChange(value: string) {
    setDepartmentId(value);
    setProgrammeId("");
    setProgrammeYearId("");

    setProgrammes([]);
    setYears([]);
    setProgrammeCourses([]);
    setSelectedElectiveCourseIds([]);

    setError("");
    setSuccess(null);
  }

  function handleProgrammeChange(value: string) {
    setProgrammeId(value);
    setProgrammeYearId("");
    setYears([]);
    setProgrammeCourses([]);
    setSelectedElectiveCourseIds([]);
    setError("");
    setSuccess(null);
  }

  function handleYearChange(value: string) {
    setProgrammeYearId(value);
    setProgrammeCourses([]);
    setSelectedElectiveCourseIds([]);
    setError("");
    setSuccess(null);
  }

  function validateElectiveSelections(): string | null {
    for (const group of electiveGroups) {
      const selectedCount = getGroupSelectedCount(group.id);

      if (selectedCount < group.minSelections) {
        return `${group.name}: select at least ${group.minSelections} course${
          group.minSelections === 1 ? "" : "s"
        }.`;
      }

      if (selectedCount > group.maxSelections) {
        return `${group.name}: select no more than ${
          group.maxSelections
        } course${group.maxSelections === 1 ? "" : "s"}.`;
      }
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess(null);

    if (
      !universityId ||
      !schoolId ||
      !departmentId ||
      !programmeId ||
      !programmeYearId ||
      !studentId ||
      !gender ||
      !informationConfirmed
    ) {
      setError(
        informationConfirmed
          ? "Complete all required fields before continuing."
          : "Please confirm that the information you have provided is accurate before continuing."
      );

      return;
    }

    if (phoneError) {
      setPhoneTouched(true);
      setError(phoneError);

      return;
    }

    const electiveError = validateElectiveSelections();

    if (electiveError) {
      setError(electiveError);

      return;
    }

    if (programmeCourses.length === 0 && !loadingCourses) {
      setError("No courses are configured for this programme year.");

      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/onboarding/student", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          universityId,
          schoolId,
          departmentId,
          programmeId,
          programmeYearId,
          studentId,
          gender,
          phoneNumber: phoneNumber ? `+260${phoneNumber}` : undefined,
          selectedElectiveCourseIds,
          informationConfirmed,
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      const rawBody = await response.text();

      if (!contentType.includes("application/json")) {
        throw new Error(
          `Expected a JSON response from the onboarding service, but received ${
            contentType || "non-JSON content"
          } with status ${response.status}.`
        );
      }

      let data: {
        error?: string;
        academicYear?: {
          name: string;
        };
        courses?: SuccessCourse[];
      };

      try {
        data = JSON.parse(rawBody);
      } catch {
        throw new Error("The onboarding service returned invalid JSON.");
      }

      if (!response.ok) {
        // The account already finished onboarding (for example in another tab).
        if (
          response.status === 409 &&
          data.error?.toLowerCase().includes("already has a student profile")
        ) {
          setAlreadyOnboarded(true);

          return;
        }

        throw new Error(data.error || "Unable to complete onboarding.");
      }

      setSuccess({
        academicYear: data.academicYear?.name ?? "Current academic year",
        courses: data.courses ?? [],
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete onboarding."
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------- result screens ---------- */

  if (alreadyOnboarded) {
    return (
      <section className="ob-rise overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <style>{ANIMATIONS}</style>

        <div className="flex items-start gap-4 px-5 py-8 sm:px-8">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7d1f2a]/[0.07] text-[#7d1f2a]">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-stone-900">
              Your profile is already set up
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-stone-600">
              This account has already completed onboarding, so there is
              nothing more to fill in.
            </p>
          </div>
        </div>

        <AccountActions />
      </section>
    );
  }

  if (success) {
    return (
      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <style>{ANIMATIONS}</style>

        <div className="flex items-start gap-4 border-b border-stone-200 px-5 py-8 sm:px-8">
          <svg
            viewBox="0 0 52 52"
            aria-hidden="true"
            className="h-11 w-11 shrink-0"
          >
            <circle
              cx="26"
              cy="26"
              r="24"
              fill="none"
              stroke="#7d1f2a"
              strokeWidth="2"
              pathLength={1}
              className="ob-draw"
            />
            <path
              d="m15 27 8 8 15-17"
              fill="none"
              stroke="#7d1f2a"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className="ob-draw"
              style={{ animationDelay: "0.4s" }}
            />
          </svg>

          <div className="ob-rise" style={{ animationDelay: "0.5s" }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#7d1f2a]">
              Profile completed
            </p>
            <h2 className="mt-1 text-xl font-semibold text-stone-900">
              You&apos;re ready to use TXMate, {userName.split(" ")[0]}.
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-stone-600">
              Your academic profile has been created and your programme
              courses have been assigned for {success.academicYear}.
            </p>
          </div>
        </div>

        <div className="px-5 py-6 sm:px-8">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-semibold text-stone-900">
              Your courses
            </h3>
            <span className="text-xs tabular-nums text-stone-500">
              {success.courses.length}{" "}
              {success.courses.length === 1 ? "course" : "courses"}
            </span>
          </div>

          <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200">
            {success.courses.map((item, index) => (
              <li
                className="ob-rise flex items-center justify-between gap-4 px-4 py-3"
                style={{ animationDelay: `${0.6 + index * 0.04}s` }}
                key={item.id}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900">
                    {item.course.code}
                  </p>
                  <p className="truncate text-sm text-stone-500">
                    {item.course.name}
                  </p>
                </div>

                <Badge tone={item.isCompulsory ? "accent" : "neutral"}>
                  {item.isCompulsory ? "Compulsory" : "Elective"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <AccountActions />
      </section>
    );
  }

  /* ---------- progress ---------- */

  const academicDone = Boolean(
    universityId && schoolId && departmentId && programmeId && programmeYearId
  );
  const personalDone = Boolean(studentId && gender && !phoneError);
  const coursesDone =
    Boolean(programmeYearId) &&
    !loadingCourses &&
    programmeCourses.length > 0 &&
    validateElectiveSelections() === null;

  const steps: { label: string; done: boolean }[] = [
    { label: "Academic", done: academicDone },
    { label: "Personal", done: personalDone },
    { label: "Courses", done: coursesDone },
    { label: "Confirm", done: informationConfirmed },
  ];
  const completedSteps = steps.filter((step) => step.done).length;
  const currentStep = steps.findIndex((step) => !step.done);

  return (
    <div className="space-y-4">
      <style>{ANIMATIONS}</style>

      <nav
        aria-label="Onboarding progress"
        className="ob-fade rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm sm:px-8"
      >
        <ol className="flex items-center">
          {steps.map((step, index) => {
            const isCurrent = index === currentStep;
            const isLast = index === steps.length - 1;

            return (
              <li
                key={step.label}
                aria-current={isCurrent ? "step" : undefined}
                className={`flex items-center ${isLast ? "" : "flex-1"}`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors duration-300 ${
                      step.done
                        ? "border-[#7d1f2a] bg-[#7d1f2a] text-white"
                        : isCurrent
                          ? "border-[#7d1f2a] bg-white text-[#7d1f2a]"
                          : "border-stone-300 bg-white text-stone-400"
                    }`}
                  >
                    {step.done ? (
                      <Icon name="check" className="h-3.5 w-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={`hidden text-sm font-medium transition-colors duration-300 sm:inline ${
                      step.done || isCurrent
                        ? "text-stone-900"
                        : "text-stone-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </span>

                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={`mx-3 h-px flex-1 transition-colors duration-500 sm:mx-4 ${
                      step.done ? "bg-[#7d1f2a]" : "bg-stone-200"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <form
        onSubmit={handleSubmit}
        className="ob-rise overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
        style={{ animationDelay: "0.05s" }}
      >
        <div className="divide-y divide-stone-200">
          <FormSection
            title="Academic details"
            description="Select the academic structure that matches your current enrolment."
          >
            <div className="grid grid-cols-1 items-start gap-x-5 gap-y-5 sm:grid-cols-2">
              <Field label="University" required className="sm:col-span-2">
                <Select
                  value={universityId}
                  onChange={(event) =>
                    handleUniversityChange(event.target.value)
                  }
                  disabled={loadingUniversities || submitting}
                >
                  <option value="">
                    {loadingUniversities
                      ? "Loading universities..."
                      : "Select university"}
                  </option>
                  {universities.map((university) => (
                    <option key={university.id} value={university.id}>
                      {university.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="School" required>
                <Select
                  value={schoolId}
                  onChange={(event) => handleSchoolChange(event.target.value)}
                  disabled={!universityId || loadingSchools || submitting}
                >
                  <option value="">
                    {!universityId
                      ? "Select university first"
                      : loadingSchools
                        ? "Loading schools..."
                        : "Select school"}
                  </option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Department" required>
                <Select
                  value={departmentId}
                  onChange={(event) =>
                    handleDepartmentChange(event.target.value)
                  }
                  disabled={!schoolId || loadingDepartments || submitting}
                >
                  <option value="">
                    {!schoolId
                      ? "Select school first"
                      : loadingDepartments
                        ? "Loading departments..."
                        : "Select department"}
                  </option>

                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Programme" required className="sm:col-span-2">
                <Select
                  value={programmeId}
                  onChange={(event) =>
                    handleProgrammeChange(event.target.value)
                  }
                  disabled={!departmentId || loadingProgrammes || submitting}
                >
                  <option value="">
                    {!departmentId
                      ? "Select department first"
                      : loadingProgrammes
                        ? "Loading programmes..."
                        : "Select programme"}
                  </option>
                  {programmes.map((programme) => (
                    <option key={programme.id} value={programme.id}>
                      {programme.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Year of study" required>
                <Select
                  value={programmeYearId}
                  onChange={(event) => handleYearChange(event.target.value)}
                  disabled={!programmeId || loadingYears || submitting}
                >
                  <option value="">
                    {!programmeId
                      ? "Select programme first"
                      : loadingYears
                        ? "Loading years..."
                        : "Select year"}
                  </option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      Year {year.yearNumber}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </FormSection>

          <FormSection
            title="Personal details"
            description="Only the information needed to establish your academic profile is required."
          >
            {/*
              The Student ID hint changes length once a university is chosen,
              so it reserves two lines to keep the fields below it in place.
            */}
            <div className="grid grid-cols-1 items-start gap-x-5 gap-y-5 sm:grid-cols-2">
              <Field
                label="Student ID"
                required
                reserveHint
                className="sm:col-span-2"
                hint={
                  studentIdHint || "Select your university to see the ID format."
                }
              >
                <input
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  maxLength={settings?.studentIdMaxLength ?? 50}
                  inputMode={
                    settings?.studentIdPattern?.includes("\\d")
                      ? "numeric"
                      : "text"
                  }
                  autoComplete="off"
                  disabled={!universityId || submitting}
                  placeholder={
                    settings?.studentIdPrefix
                      ? `${settings.studentIdPrefix}...`
                      : "Enter student ID"
                  }
                  className={inputClassName}
                />
              </Field>

              <Field
                label="Gender"
                required
                hint="Select the option that applies to you."
              >
                <Select
                  value={gender}
                  onChange={(event) => setGender(event.target.value)}
                  disabled={submitting}
                >
                  <option value="">Select gender</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </Select>
              </Field>

              <Field
                label="Phone number"
                hint="Zambian mobile number. Kept private by default."
                error={showPhoneError ? phoneError : undefined}
              >
                <div className="flex w-full min-w-0">
                  <span className="inline-flex h-12 shrink-0 items-center gap-2 rounded-l-lg border border-r-0 border-stone-300 bg-stone-50 px-3 text-base font-medium text-stone-700 md:h-11 md:text-sm">
                    <ZambiaFlag className="h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-black/10" />
                    +260
                  </span>
                  <input
                    value={formatZambianNumber(phoneNumber)}
                    onChange={(event) =>
                      setPhoneNumber(normalizeZambianInput(event.target.value))
                    }
                    onBlur={() => setPhoneTouched(true)}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    aria-invalid={showPhoneError}
                    disabled={submitting}
                    placeholder="97 123 4567"
                    className={`h-12 min-w-0 flex-1 rounded-r-lg border bg-white px-3.5 text-base text-stone-900 outline-none transition placeholder:text-stone-400 disabled:cursor-not-allowed disabled:bg-stone-100 md:h-11 md:text-sm ${
                      showPhoneError
                        ? "border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
                        : "border-stone-300 focus:border-[#7d1f2a] focus:ring-4 focus:ring-[#7d1f2a]/10"
                    }`}
                  />
                </div>
              </Field>
            </div>
          </FormSection>

          {programmeYearId && (
            <FormSection
              title="Programme courses"
              description="Compulsory courses are included automatically. Select the electives you actually take."
              className="ob-rise"
            >
              {loadingCourses ? (
                <div className="space-y-3" aria-busy="true">
                  <p className="sr-only">Loading courses...</p>
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="ob-skeleton h-14 rounded-lg"
                      style={{ animationDelay: `${item * 0.12}s` }}
                    />
                  ))}
                </div>
              ) : programmeCourses.length === 0 ? (
                <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                  No courses are configured for this programme year.
                </p>
              ) : (
                <div className="space-y-8">
                  {compulsoryCourses.length > 0 && (
                    <div>
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-stone-900">
                          Compulsory courses
                        </h3>
                        <p className="mt-0.5 text-sm text-stone-500">
                          Automatically assigned to students in this programme
                          year.
                        </p>
                      </div>

                      <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200">
                        {compulsoryCourses.map((item, index) => (
                          <li
                            key={item.id}
                            className="ob-rise flex items-center justify-between gap-4 px-4 py-3"
                            style={{ animationDelay: `${index * 0.03}s` }}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-stone-900">
                                {item.course.code}
                              </p>
                              <p className="truncate text-sm text-stone-500">
                                {item.course.name}
                              </p>
                            </div>

                            <Badge tone="accent">Included</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {electiveGroups.length > 0 && (
                    <div>
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-stone-900">
                          Electives
                        </h3>
                        <p className="mt-0.5 text-sm text-stone-500">
                          Select the courses you are actually taking.
                        </p>
                      </div>

                      <div className="space-y-4">
                        {electiveGroups.map((group) => {
                          const groupCourses = electiveCourses.filter(
                            (course) => course.electiveGroup?.id === group.id
                          );
                          const selectedCount = getGroupSelectedCount(group.id);
                          const maxReached =
                            selectedCount >= group.maxSelections;
                          const minMet = selectedCount >= group.minSelections;

                          return (
                            <div
                              key={group.id}
                              className="overflow-hidden rounded-lg border border-stone-200"
                            >
                              <div className="flex flex-col gap-1.5 border-b border-stone-200 bg-stone-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <h4 className="text-sm font-semibold text-stone-900">
                                    {group.name}
                                  </h4>
                                  <p className="text-xs text-stone-500">
                                    Choose{" "}
                                    {group.minSelections === group.maxSelections
                                      ? group.minSelections
                                      : `${group.minSelections} to ${group.maxSelections}`}{" "}
                                    {group.maxSelections === 1
                                      ? "course"
                                      : "courses"}
                                    .
                                  </p>
                                </div>

                                <span
                                  className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums ${
                                    minMet
                                      ? "border-[#7d1f2a]/20 bg-[#7d1f2a]/[0.05] text-[#7d1f2a]"
                                      : "border-stone-300 bg-white text-stone-600"
                                  }`}
                                >
                                  {selectedCount} of {group.maxSelections}{" "}
                                  selected
                                </span>
                              </div>

                              <div className="divide-y divide-stone-200">
                                {groupCourses.map((item) => {
                                  const selected =
                                    selectedElectiveCourseIds.includes(
                                      item.course.id
                                    );
                                  const disabled = !selected && maxReached;

                                  return (
                                    <label
                                      key={item.id}
                                      className={`flex items-start gap-3.5 px-4 py-3 transition-colors duration-150 ${
                                        disabled
                                          ? "cursor-not-allowed opacity-50"
                                          : "cursor-pointer hover:bg-stone-50"
                                      } ${
                                        selected ? "bg-[#7d1f2a]/[0.04]" : ""
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() =>
                                          toggleElectiveCourse(item)
                                        }
                                        disabled={submitting || disabled}
                                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#7d1f2a]"
                                      />

                                      <span className="min-w-0">
                                        <span className="block text-sm font-semibold text-stone-900">
                                          {item.course.code}
                                        </span>
                                        <span className="block text-sm text-stone-500">
                                          {item.course.name}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {electiveCourses.length === 0 &&
                    compulsoryCourses.length > 0 && (
                      <p className="text-sm text-stone-500">
                        There are no elective courses configured for this
                        programme year.
                      </p>
                    )}
                </div>
              )}
            </FormSection>
          )}

          <FormSection
            title="Confirmation"
            description="One last check before your profile is created."
          >
            <label className="flex cursor-pointer items-start gap-3.5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-4 transition-colors hover:border-stone-300">
              <input
                type="checkbox"
                checked={informationConfirmed}
                onChange={(event) => {
                  setInformationConfirmed(event.target.checked);
                  setError("");
                }}
                disabled={submitting}
                className="mt-1 h-4 w-4 shrink-0 accent-[#7d1f2a]"
              />
              <span className="text-sm leading-6 text-stone-700">
                I confirm that the information I have provided is accurate and
                belongs to me. I understand that providing false or misleading
                information may result in my TXMate account being restricted or
                deactivated.
              </span>
            </label>
          </FormSection>
        </div>

        {error && (
          <div className="border-t border-stone-200 px-5 py-4 sm:px-8">
            <div
              key={error}
              role="alert"
              className="ob-fade flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-stone-200 bg-stone-50 px-5 py-4 sm:px-8">
          <p className="text-sm tabular-nums text-stone-500">
            <span className="font-semibold text-stone-800">
              {completedSteps}
            </span>{" "}
            of {steps.length} steps complete
          </p>

          <button
            type="submit"
            disabled={
              submitting ||
              loadingUniversities ||
              loadingSchools ||
              loadingProgrammes ||
              loadingYears ||
              loadingCourses ||
              !universityId ||
              !schoolId ||
              !programmeId ||
              !programmeYearId ||
              !informationConfirmed
            }
            className={primaryButtonClass}
          >
            {submitting ? (
              <>
                <Icon name="spinner" />
                Creating profile...
              </>
            ) : (
              <>
                Complete onboarding
                <Icon name="arrow" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}