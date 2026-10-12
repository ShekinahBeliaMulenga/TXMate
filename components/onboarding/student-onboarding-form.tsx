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
  | "building"
  | "school"
  | "layers"
  | "cap"
  | "calendar"
  | "id"
  | "user"
  | "phone"
  | "book"
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
    case "building":
      return (
        <svg {...props}>
          <path d="M4 21V5l8-2v18M12 9h8v12M3 21h18M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01" />
        </svg>
      );
    case "school":
      return (
        <svg {...props}>
          <path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5" />
        </svg>
      );
    case "layers":
      return (
        <svg {...props}>
          <path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5" />
        </svg>
      );
    case "cap":
      return (
        <svg {...props}>
          <path d="m2.5 9 9.5-5 9.5 5-9.5 5-9.5-5ZM6.5 11.2v5.2c3.6 2.7 7.4 2.7 11 0v-5.2" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      );
    case "id":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="11" r="2" />
          <path d="M6 16c.6-1.6 2-2 3-2s2.4.4 3 2M15 10h3M15 14h3" />
        </svg>
      );
    case "user":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "phone":
      return (
        <svg {...props}>
          <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case "book":
      return (
        <svg {...props}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22Z" />
          <path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H20" />
        </svg>
      );
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

/* ---------- animations (respects reduced motion) ---------- */

const ANIMATIONS = `
@keyframes ob-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes ob-fade{from{opacity:0}to{opacity:1}}
@keyframes ob-draw{to{stroke-dashoffset:0}}
@keyframes ob-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes ob-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
@keyframes ob-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
.ob-rise{opacity:0;animation:ob-rise .55s cubic-bezier(.2,.8,.2,1) forwards}
.ob-fade{animation:ob-fade .5s ease both}
.ob-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:ob-draw .7s ease forwards}
.ob-pop{animation:ob-pop .5s cubic-bezier(.2,.8,.2,1) both}
.ob-shake{animation:ob-shake .4s ease}
.ob-skeleton{background:linear-gradient(90deg,#f3eee8 25%,#faf7f3 50%,#f3eee8 75%);background-size:200% 100%;animation:ob-shimmer 1.4s linear infinite}
@media (prefers-reduced-motion:reduce){.ob-rise,.ob-fade,.ob-draw,.ob-pop,.ob-shake,.ob-skeleton{animation:none!important;opacity:1;stroke-dashoffset:0}}
`;

/* ---------- shared actions (plain text with icons) ---------- */

function AccountActions() {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[#eee7df] pt-6">
      <Link
        href="/student/dashboard"
        className="group inline-flex items-center gap-2 text-sm font-semibold text-[#7d1f2a] transition-colors hover:text-[#4f1019] focus:outline-none focus-visible:underline"
      >
        <Icon name="dashboard" />
        Continue to dashboard
        <Icon
          name="arrow"
          className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
        />
      </Link>

      <Link
        href="/login"
        className="group inline-flex items-center gap-2 text-sm font-medium text-[#625954] transition-colors hover:text-[#7d1f2a] focus:outline-none focus-visible:underline"
      >
        <Icon name="login" />
        Go to login
      </Link>
    </div>
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

  useEffect(() => {
    if (!universityId) {
      setSettings(null);
      setSchools([]);

      return;
    }

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
    if (!schoolId) {
      setDepartments([]);
      setDepartmentId("");
      setProgrammes([]);
      return;
    }

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
    if (!departmentId) {
      setProgrammes([]);
      return;
    }

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
    if (!programmeId) {
      setYears([]);

      return;
    }

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
    if (!programmeYearId) {
      setProgrammeCourses([]);
      setSelectedElectiveCourseIds([]);

      return;
    }

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
      <section className="ob-rise rounded-xl border border-[#ded6cb] bg-white p-6 shadow-sm sm:p-8">
        <style>{ANIMATIONS}</style>
        <div className="flex items-start gap-4">
          <span className="ob-pop flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#f4e9ea] text-[#7d1f2a]">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-semibold text-[#2d1b1b]">
              Your profile is already set up.
            </h2>
            <p className="mt-2 text-[#6d6260]">
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
      <section className="rounded-xl border border-[#ded6cb] bg-white p-6 shadow-sm sm:p-8">
        <style>{ANIMATIONS}</style>

        <div className="flex flex-col gap-5 border-b border-[#eee7df] pb-6 sm:flex-row sm:items-center">
          <svg
            viewBox="0 0 52 52"
            aria-hidden="true"
            className="h-14 w-14 shrink-0"
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
              style={{ animationDelay: "0.5s" }}
            />
          </svg>

          <div className="ob-rise" style={{ animationDelay: "0.6s" }}>
            <p className="text-sm font-semibold text-[#7d1f2a]">
              Profile completed
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-[#2d1b1b]">
              You&apos;re ready to use TXMate, {userName.split(" ")[0]}.
            </h2>
            <p className="mt-2 text-[#6d6260]">
              Your academic profile has been created and your selected
              programme courses have been assigned for {success.academicYear}.
            </p>
          </div>
        </div>

        <div className="pt-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[#2d1b1b]">
            <Icon name="book" className="h-5 w-5 text-[#7d1f2a]" />
            Your courses
          </h3>

          <div className="mt-4 divide-y divide-[#eee7df] border-y border-[#eee7df]">
            {success.courses.map((item, index) => (
              <div
                className="ob-rise flex items-center justify-between gap-4 py-4"
                style={{ animationDelay: `${0.8 + index * 0.06}s` }}
                key={item.id}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#2d1b1b]">
                    {item.course.code}
                  </p>
                  <p className="text-sm text-[#6d6260]">{item.course.name}</p>
                </div>

                <span
                  className={`shrink-0 text-xs font-medium ${
                    item.isCompulsory ? "text-[#7d1f2a]" : "text-[#8b807d]"
                  }`}
                >
                  {item.isCompulsory ? "Compulsory" : "Elective"}
                </span>
              </div>
            ))}
          </div>
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

  const steps: { label: string; icon: IconName; done: boolean }[] = [
    { label: "Academic", icon: "cap", done: academicDone },
    { label: "Personal", icon: "id", done: personalDone },
    { label: "Courses", icon: "book", done: coursesDone },
    { label: "Confirm", icon: "shield", done: informationConfirmed },
  ];
  const completedSteps = steps.filter((step) => step.done).length;

  return (
    <div className="space-y-5">
      <style>{ANIMATIONS}</style>

      <div className="ob-fade rounded-xl border border-[#ded6cb] bg-white p-4 shadow-sm sm:p-5">
        <ol className="grid grid-cols-4 gap-2">
          {steps.map((step) => (
            <li
              key={step.label}
              className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-all duration-500 ${
                  step.done
                    ? "border-[#7d1f2a] bg-[#7d1f2a] text-white"
                    : "border-[#ded6cb] text-[#9b918d]"
                }`}
              >
                <Icon name={step.done ? "check" : step.icon} />
              </span>
              <span
                className={`text-xs font-semibold transition-colors duration-500 ${
                  step.done ? "text-[#2d1b1b]" : "text-[#9b918d]"
                }`}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>

        <div
          className="mt-4 h-1 overflow-hidden rounded bg-[#f0ebe5]"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={completedSteps}
        >
          <div
            className="h-full bg-gradient-to-r from-[#7d1f2a] to-[#f5b324] transition-all duration-700 ease-out"
            style={{ width: `${(completedSteps / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="ob-rise overflow-hidden rounded-xl border border-[#ded6cb] bg-white shadow-sm"
        style={{ animationDelay: "0.08s" }}
      >
        <div className="space-y-8 p-4 sm:p-8">
          <section>
            <SectionHeader
              icon="cap"
              title="Academic details"
              subtitle="Select the academic structure that matches your current enrolment."
            />

            <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
              <Field label="University" icon="building" required>
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

              <Field label="School" icon="school" required>
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

              <Field label="Department" icon="layers" required>
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

              <Field label="Programme" icon="cap" required>
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

              <Field label="Year of study" icon="calendar" required>
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
          </section>

          <section className="border-t border-[#eee7df] pt-8">
            <SectionHeader
              icon="id"
              title="Personal details"
              subtitle="Only the information needed to establish your academic profile is required."
            />

            {/*
              Fields are stacked one after the other. The Student ID hint changes
              length once a university is chosen, so it reserves two lines to keep
              the fields below it from moving.
            */}
            <div className="grid grid-cols-1 gap-5">
              <Field
                label="Student ID"
                icon="id"
                required
                reserveHint
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
                icon="user"
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
                icon="phone"
                hint="Optional. Zambian mobile number, kept private by default."
                error={showPhoneError ? phoneError : undefined}
              >
                <div className="flex w-full min-w-0">
                  <span className="inline-flex h-12 shrink-0 items-center gap-2 rounded-l-lg border border-r-0 border-[#d9d0c8] bg-[#fcfaf7] px-2.5 text-base font-medium sm:px-3 md:h-11 md:text-sm text-[#2d1b1b]">
                    <ZambiaFlag className="h-4 w-6 shrink-0 rounded-[3px] shadow-sm ring-1 ring-black/10" />
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
                    className={`h-12 min-w-0 flex-1 rounded-r-lg border bg-white px-3 text-base text-[#2d1b1b] sm:px-4 md:h-11 md:text-sm placeholder:text-[#9b918d] outline-none transition disabled:cursor-not-allowed disabled:bg-[#f5f2ee] ${
                      showPhoneError
                        ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                        : "border-[#d9d0c8] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10"
                    }`}
                  />
                </div>
              </Field>
            </div>
          </section>

          {programmeYearId && (
            <section className="ob-rise border-t border-[#eee7df] pt-8">
              <SectionHeader
                icon="book"
                title="Programme courses"
                subtitle="Compulsory courses are included automatically. Select the electives that you actually take."
              />

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
                <p className="text-sm text-[#6d6260]">
                  No courses are configured for this programme year.
                </p>
              ) : (
                <div className="space-y-8">
                  {compulsoryCourses.length > 0 && (
                    <div>
                      <div className="mb-3">
                        <h3 className="font-semibold text-[#2d1b1b]">
                          Compulsory courses
                        </h3>
                        <p className="mt-1 text-sm text-[#8b807d]">
                          These courses are automatically assigned to students
                          in this programme year.
                        </p>
                      </div>

                      <div className="divide-y divide-[#eee7df] border-y border-[#eee7df]">
                        {compulsoryCourses.map((item, index) => (
                          <div
                            key={item.id}
                            className="ob-rise flex items-center justify-between gap-4 py-4"
                            style={{ animationDelay: `${index * 0.05}s` }}
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-[#2d1b1b]">
                                {item.course.code}
                              </p>
                              <p className="text-sm text-[#6d6260]">
                                {item.course.name}
                              </p>
                            </div>

                            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[#7d1f2a]">
                              <Icon name="check" className="h-3.5 w-3.5" />
                              Included
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {electiveGroups.length > 0 && (
                    <div>
                      <div className="mb-4">
                        <h3 className="font-semibold text-[#2d1b1b]">
                          Electives
                        </h3>
                        <p className="mt-1 text-sm text-[#8b807d]">
                          Select the courses you are actually taking.
                        </p>
                      </div>

                      <div className="space-y-6">
                        {electiveGroups.map((group) => {
                          const groupCourses = electiveCourses.filter(
                            (course) => course.electiveGroup?.id === group.id
                          );
                          const selectedCount = getGroupSelectedCount(group.id);
                          const maxReached =
                            selectedCount >= group.maxSelections;

                          return (
                            <div
                              key={group.id}
                              className="overflow-hidden rounded-lg border border-[#ded6cb]"
                            >
                              <div className="border-b border-[#eee7df] bg-[#fcfaf7] px-5 py-4">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <h4 className="font-semibold text-[#2d1b1b]">
                                      {group.name}
                                    </h4>
                                    <p className="text-sm text-[#6d6260]">
                                      Choose{" "}
                                      {group.minSelections ===
                                      group.maxSelections
                                        ? group.minSelections
                                        : `${group.minSelections} to ${group.maxSelections}`}{" "}
                                      {group.maxSelections === 1
                                        ? "course"
                                        : "courses"}
                                      .
                                    </p>
                                  </div>

                                  <span className="text-sm font-medium tabular-nums text-[#7d1f2a]">
                                    {selectedCount} / {group.maxSelections}{" "}
                                    selected
                                  </span>
                                </div>
                              </div>

                              <div className="divide-y divide-[#eee7df]">
                                {groupCourses.map((item) => {
                                  const selected =
                                    selectedElectiveCourseIds.includes(
                                      item.course.id
                                    );
                                  const disabled = !selected && maxReached;

                                  return (
                                    <label
                                      key={item.id}
                                      className={`flex items-start gap-4 px-5 py-4 transition-all duration-200 ${
                                        disabled
                                          ? "cursor-not-allowed opacity-50"
                                          : "cursor-pointer hover:bg-[#fcfaf7]"
                                      } ${
                                        selected
                                          ? "bg-[#fbf4f4] shadow-[inset_3px_0_0_#7d1f2a]"
                                          : ""
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() =>
                                          toggleElectiveCourse(item)
                                        }
                                        disabled={submitting || disabled}
                                        className="mt-1 h-4 w-4 accent-[#7d1f2a]"
                                      />

                                      <span className="min-w-0">
                                        <span className="block font-semibold text-[#2d1b1b]">
                                          {item.course.code}
                                        </span>
                                        <span className="mt-1 block text-sm text-[#6d6260]">
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
                      <p className="text-sm text-[#6d6260]">
                        There are no elective courses configured for this
                        programme year.
                      </p>
                    )}
                </div>
              )}
            </section>
          )}

          <section className="border-t border-[#eee7df] pt-8">
            <SectionHeader
              icon="shield"
              title="Confirmation"
              subtitle="One last check before your profile is created."
            />

            <div className="rounded-lg border border-[#ded6cb] bg-[#fcfaf7] px-5 py-4">
              <label className="flex cursor-pointer items-start gap-3">
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
                <span className="text-sm leading-6 text-[#4f4441]">
                  I confirm that the information I have provided is accurate
                  and belongs to me. I understand that providing false or
                  misleading information may result in my TXMate account being
                  restricted or deactivated.
                </span>
              </label>
            </div>
          </section>

          {error && (
            <div
              key={error}
              role="alert"
              className="ob-shake flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-[#eee7df] bg-[#fcfaf7] px-4 py-5 sm:px-8">
          <p className="text-xs text-[#8b807d]">
            {completedSteps} of {steps.length} steps complete
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
            className="group inline-flex items-center gap-2 text-sm font-semibold text-[#7d1f2a] transition-colors hover:text-[#4f1019] focus:outline-none focus-visible:underline disabled:cursor-not-allowed disabled:text-[#b3a8a3]"
          >
            {submitting ? (
              <>
                <Icon name="spinner" />
                Creating profile...
              </>
            ) : (
              <>
                Complete onboarding
                <Icon
                  name="arrow"
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 group-disabled:translate-x-0"
                />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#f4e9ea] text-[#7d1f2a]">
        <Icon name={icon} />
      </span>
      <div>
        <h2 className="text-xl font-semibold text-[#2d1b1b]">{title}</h2>
        <p className="mt-1 text-sm text-[#6d6260]">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  required,
  hint,
  error,
  reserveHint,
  children,
}: {
  label: string;
  icon?: IconName;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Always reserve two lines for the hint so the row never changes height. */
  reserveHint?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="flex items-center gap-2 text-sm font-semibold text-[#392a29]">
        {icon ? <Icon name={icon} className="h-4 w-4 text-[#9a2a38]" /> : null}
        {label}
        {required ? (
          <span className="text-[#7d1f2a]" aria-hidden="true">
            *
          </span>
        ) : null}
      </span>
      <span className="mt-2 block">{children}</span>
      {hint !== undefined ? (
        <span
          className={`mt-1.5 block text-xs leading-5 ${
            reserveHint ? "min-h-10" : "min-h-5"
          } ${error ? "text-red-700" : "text-[#8b807d]"}`}
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
        className={`h-12 w-full appearance-none rounded-lg border border-[#d9d0c8] bg-white pl-4 pr-10 text-base text-[#2d1b1b] md:h-11 md:text-sm outline-none transition focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10 disabled:cursor-not-allowed disabled:bg-[#f5f2ee] ${className}`}
      >
        {children}
      </select>
      <Icon
        name="chevron"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b918d]"
      />
    </span>
  );
}

const inputClassName =
  "h-12 w-full rounded-lg border border-[#d9d0c8] bg-white px-4 text-base text-[#2d1b1b] md:h-11 md:text-sm placeholder:text-[#9b918d] outline-none transition focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10 disabled:cursor-not-allowed disabled:bg-[#f5f2ee]";