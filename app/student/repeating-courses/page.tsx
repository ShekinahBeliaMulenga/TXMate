"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Course = {
  id: string;
  code: string;
  name: string;
  programmeYears: number[];
};

type CourseStatus = "ENROLLED" | "COMPLETED" | "DROPPED" | "REPEATING";
type CourseFilter = "ALL" | "ENROLLED" | "NOT_TAKING" | "REPEATING";
type SortOption = "COURSE_ASC" | "COURSE_DESC" | "NAME_ASC" | "SEMESTER_ASC" | "STATUS";
type CourseAction = "REPEAT" | "STOP_REPEATING";

type AcademicYear = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
};

type StudentCourse = {
  id: string;
  courseId: string;
  status: CourseStatus;
  semester: number | null;
  course: Course;
};

type CoursesResponse = {
  academicYear: AcademicYear;
  currentAcademicYearId: string;
  academicYears: AcademicYear[];
  programmeYears: number[];
  courses: Course[];
  yearCourses: StudentCourse[];
  error?: string;
};

type ApiResponse = { message?: string; error?: string };

type Confirmation = {
  course: Course;
  currentStatus: CourseStatus | null;
  action: CourseAction;
};

const FILTERS: { value: CourseFilter; label: string }[] = [
  { value: "ENROLLED", label: "Enrolled" },
  { value: "NOT_TAKING", label: "Not taking" },
  { value: "REPEATING", label: "Repeating" },
];

/* The tab the page opens on, and the one every reset returns to. */
const DEFAULT_FILTER: CourseFilter = "ENROLLED";

/* Students only see three states: Enrolled, Repeating, Not taking.
   Dropped, completed and unrecorded courses all read as "Not taking". */
function formatStatus(status: CourseStatus | null) {
  if (status === "REPEATING") return "Repeating";
  if (status === "ENROLLED") return "Enrolled";
  return "Not taking";
}

function statusTone(status: CourseStatus | null) {
  switch (status) {
    case "REPEATING":
      return { pill: "bg-amber-50 text-amber-900", dot: "bg-amber-500" };
    case "ENROLLED":
      return { pill: "bg-emerald-50 text-emerald-900", dot: "bg-emerald-500" };
    default:
      return { pill: "bg-stone-100 text-stone-600", dot: "bg-stone-400" };
  }
}

function matchesFilter(filter: CourseFilter, status: CourseStatus | null) {
  switch (filter) {
    case "ALL":
      return true;
    case "ENROLLED":
      return status === "ENROLLED";
    case "REPEATING":
      return status === "REPEATING";
    case "NOT_TAKING":
      return status !== "ENROLLED" && status !== "REPEATING";
  }
}

function statusRank(status: CourseStatus | null) {
  if (status === "REPEATING") return 0;
  if (status === "ENROLLED") return 1;
  return 2;
}

async function readApiResponse<T>(response: Response): Promise<T & ApiResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error("The service returned an unexpected response.");
  }

  const body = (await response.json()) as T & ApiResponse;

  if (!response.ok) {
    throw new Error(body.error || "The request could not be completed.");
  }

  return body;
}

function StatusBadge({ status }: { status: CourseStatus | null }) {
  const tone = statusTone(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${tone.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {formatStatus(status)}
    </span>
  );
}

const fieldClass =
  "h-11 w-full rounded-xl border border-[#e3ddd6] bg-white px-3 text-sm text-[#1f1a17] outline-none transition placeholder:text-[#a39a94] hover:border-[#d3cac1] focus:border-[#7d1f2a] focus:ring-4 focus:ring-[#7d1f2a]/10 disabled:opacity-60 lg:h-10";
const labelClass = "mb-1.5 block text-xs font-medium text-[#7a6f6a]";

export default function RepeatingCoursesPage() {
  const [data, setData] = useState<CoursesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedProgrammeYear, setSelectedProgrammeYear] = useState("ALL");
  const [filter, setFilter] = useState<CourseFilter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<SortOption>("COURSE_ASC");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  /* Each load cancels the previous one, so a slow old response
     can never overwrite the year the student just picked. */
  const loadCourses = useCallback(async (yearId?: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const query = yearId ? `?academicYearId=${encodeURIComponent(yearId)}` : "";
      const response = await fetch(`/api/student/repeating-courses${query}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await readApiResponse<CoursesResponse>(response);

      setData(body);
      setSelectedYearId(yearId ?? body.currentAcademicYearId);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load your course records.",
      );
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCourses(); // eslint-disable-line react-hooks/set-state-in-effect
    return () => abortRef.current?.abort();
  }, [loadCourses]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const recordsByCourse = useMemo(() => {
    const result = new Map<string, StudentCourse>();
    for (const record of data?.yearCourses ?? []) result.set(record.courseId, record);
    return result;
  }, [data]);

  const canEdit = data?.academicYear.isCurrent ?? false;

  const selectedYearName =
    data?.academicYears.find((year) => year.id === selectedYearId)?.name ??
    data?.academicYear.name ??
    "the selected academic year";

  const visibleCourses = useMemo(() => {
    if (!data) return [];
    const source = data.academicYear.isCurrent
      ? data.courses
      : data.yearCourses.map((record) => record.course);
    return Array.from(new Map(source.map((course) => [course.id, course])).values());
  }, [data]);

  const programmeYearFilteredCourses = useMemo(() => {
    if (selectedProgrammeYear === "ALL") return visibleCourses;
    const yearNumber = Number(selectedProgrammeYear);
    return visibleCourses.filter((course) => course.programmeYears.includes(yearNumber));
  }, [visibleCourses, selectedProgrammeYear]);

  const counts = useMemo(() => {
    const result: Record<CourseFilter, number> = {
      ALL: programmeYearFilteredCourses.length,
      ENROLLED: 0,
      NOT_TAKING: 0,
      REPEATING: 0,
    };

    for (const course of programmeYearFilteredCourses) {
      const status = recordsByCourse.get(course.id)?.status ?? null;
      if (status === "ENROLLED") result.ENROLLED += 1;
      else if (status === "REPEATING") result.REPEATING += 1;
      else result.NOT_TAKING += 1;
    }

    return result;
  }, [programmeYearFilteredCourses, recordsByCourse]);

  const repeatingCount = useMemo(
    () => (data?.yearCourses ?? []).filter((record) => record.status === "REPEATING").length,
    [data],
  );

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();

    const result = programmeYearFilteredCourses.filter((course) => {
      const matchesSearch =
        !query || `${course.code} ${course.name}`.toLowerCase().includes(query);
      const status = recordsByCourse.get(course.id)?.status ?? null;
      return matchesSearch && matchesFilter(filter, status);
    });

    return result.sort((a, b) => {
      const recordA = recordsByCourse.get(a.id);
      const recordB = recordsByCourse.get(b.id);

      switch (sort) {
        case "COURSE_DESC":
          return b.code.localeCompare(a.code);
        case "NAME_ASC":
          return a.name.localeCompare(b.name);
        case "SEMESTER_ASC": {
          const semesterA = recordA?.semester ?? Number.MAX_SAFE_INTEGER;
          const semesterB = recordB?.semester ?? Number.MAX_SAFE_INTEGER;
          return semesterA - semesterB || a.code.localeCompare(b.code);
        }
        case "STATUS":
          return (
            statusRank(recordA?.status ?? null) - statusRank(recordB?.status ?? null) ||
            a.code.localeCompare(b.code)
          );
        default:
          return a.code.localeCompare(b.code);
      }
    });
  }, [programmeYearFilteredCourses, recordsByCourse, search, filter, sort]);

  function openConfirmation(course: Course, trigger: HTMLElement) {
    if (!canEdit || pendingCourseId) return;

    const currentStatus = recordsByCourse.get(course.id)?.status ?? null;

    triggerRef.current = trigger;
    setConfirmation({
      course,
      currentStatus,
      action: currentStatus === "REPEATING" ? "STOP_REPEATING" : "REPEAT",
    });
    setAcknowledged(false);
    setDialogError(null);
    setError(null);
    setNotice("");
  }

  const closeConfirmation = useCallback(() => {
    if (pendingCourseId) return;
    setConfirmation(null);
    setAcknowledged(false);
    setDialogError(null);
    triggerRef.current?.focus();
  }, [pendingCourseId]);

  async function confirmStatusChange() {
    if (!confirmation || !acknowledged || pendingCourseId || !canEdit) return;

    const { course, action } = confirmation;

    setPendingCourseId(course.id);
    setDialogError(null);

    try {
      const response = await fetch("/api/student/repeating-courses", {
        method: action === "REPEAT" ? "POST" : "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ courseId: course.id }),
      });
      const body = await readApiResponse<ApiResponse>(response);

      setConfirmation(null);
      setAcknowledged(false);
      setNotice(body.message ?? "The course status has been updated.");
      triggerRef.current?.focus();
      await loadCourses(selectedYearId);
    } catch (cause) {
      setDialogError(
        cause instanceof Error
          ? cause.message
          : "Unable to update the course status.",
      );
    } finally {
      setPendingCourseId(null);
    }
  }

  useEffect(() => {
    if (!confirmation) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeConfirmation();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirmation, closeConfirmation]);

  function clearFilters() {
    setSearch("");
    setFilter(DEFAULT_FILTER);
    setSelectedProgrammeYear("ALL");
    setSort("COURSE_ASC");
  }

  const hasFilters =
    Boolean(search.trim()) ||
    filter !== DEFAULT_FILTER ||
    selectedProgrammeYear !== "ALL" ||
    sort !== "COURSE_ASC";

  /* Shown on the mobile "Filters" button so hidden options are never a surprise. */
  const activeFilterCount =
    (selectedProgrammeYear !== "ALL" ? 1 : 0) +
    (sort !== "COURSE_ASC" ? 1 : 0) +
    (data && !canEdit ? 1 : 0);

  const targetStatus: CourseStatus | null = !confirmation
    ? null
    : confirmation.action === "REPEAT"
      ? "REPEATING"
      : "DROPPED";

  return (
    <main className="min-h-screen bg-[#faf9f7] px-4 py-6 text-[#1f1a17] sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Repeating courses
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#756b65]">
            Review your current course status.
          </p>
          {data && (
            <p className="mt-1 text-sm text-[#756b65]">
              {selectedYearName}:{" "}
              <span className="font-semibold text-[#7d1f2a]">{repeatingCount}</span>{" "}
              {repeatingCount === 1 ? "course" : "courses"} marked as repeating
            </p>
          )}
        </header>

        {/* Search and filters. On phones, search stays visible and the rest folds away. */}
        <section aria-label="Search and filter courses" className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="course-search" className={labelClass}>
                Search course
              </label>
              <div className="relative">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a39a94]"
                >
                  <circle cx="9" cy="9" r="5.5" />
                  <path d="M13.5 13.5 17 17" />
                </svg>
                <input
                  id="course-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Course code or name"
                  className={`${fieldClass} pl-9`}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-controls="more-filters"
              className="relative inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-[#e3ddd6] bg-white px-3.5 text-sm font-medium text-[#4d4541] transition hover:border-[#d3cac1] lg:hidden"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className="h-4 w-4"
              >
                <path d="M3 6h9M16 6h1M3 14h1M8 14h9" />
                <circle cx="14" cy="6" r="2" />
                <circle cx="6" cy="14" r="2" />
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#7d1f2a] px-1.5 text-[11px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          <div
            id="more-filters"
            className={`${filtersOpen ? "grid" : "hidden"} gap-3 sm:grid-cols-3 lg:contents`}
          >
            <div>
              <label htmlFor="academic-year-filter" className={labelClass}>
                Academic year
              </label>
              <select
                id="academic-year-filter"
                value={selectedYearId}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedYearId(value);
                  setFilter(DEFAULT_FILTER);
                  setNotice("");
                  setError(null);
                  void loadCourses(value);
                }}
                disabled={!data}
                className={fieldClass}
              >
                {(data?.academicYears ?? []).map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                    {year.isCurrent ? " (Current)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="programme-year-filter" className={labelClass}>
                Programme year
              </label>
              <select
                id="programme-year-filter"
                value={selectedProgrammeYear}
                onChange={(event) => setSelectedProgrammeYear(event.target.value)}
                className={fieldClass}
              >
                <option value="ALL">All years</option>
                {(data?.programmeYears ?? []).map((year) => (
                  <option key={year} value={String(year)}>
                    Year {year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="course-sort" className={labelClass}>
                Sort by
              </label>
              <select
                id="course-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortOption)}
                className={fieldClass}
              >
                <option value="COURSE_ASC">Course code: A to Z</option>
                <option value="COURSE_DESC">Course code: Z to A</option>
                <option value="NAME_ASC">Course name</option>
                <option value="SEMESTER_ASC">Semester</option>
                <option value="STATUS">Status</option>
              </select>
            </div>
          </div>
        </section>

        {notice && (
          <div
            role="status"
            className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            <span className="font-semibold">Saved:</span>
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm leading-5 text-red-800">{error}</p>
            <button
              type="button"
              onClick={() => void loadCourses(selectedYearId || undefined)}
              className="w-fit text-xs font-semibold text-red-900 underline underline-offset-4"
            >
              Retry
            </button>
          </div>
        )}

        <section
          aria-label="Courses"
          aria-busy={loading}
          className="mt-5 overflow-hidden rounded-2xl border border-[#ebe6e1] bg-white shadow-[0_1px_2px_rgba(40,30,20,0.04)]"
        >
          {/* Status switcher */}
          <div className="flex flex-col gap-3 border-b border-[#f0ece8] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 lg:px-5">
            <div
              role="group"
              aria-label="Filter by course status"
              className="flex w-full gap-1 rounded-xl bg-[#f3efeb] p-1 sm:w-auto"
            >
              {FILTERS.map((item) => {
                const active = filter === item.value;

                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(item.value)}
                    className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30 sm:flex-none sm:gap-2 sm:px-3.5 ${
                      active
                        ? "bg-white text-[#7d1f2a] shadow-sm"
                        : "text-[#6b615b] hover:text-[#1f1a17]"
                    }`}
                  >
                    {item.label}
                    <span
                      className={`tabular-nums ${
                        active ? "text-[#7d1f2a]/70" : "text-[#9b908a]"
                      }`}
                    >
                      {counts[item.value]}
                    </span>
                  </button>
                );
              })}
            </div>

            {data && !canEdit && (
              <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
                Historical records are read-only
              </span>
            )}
          </div>

          {!data && loading ? (
            <div role="status" aria-label="Loading courses" className="divide-y divide-[#f0ece8]">
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="flex animate-pulse items-center justify-between gap-4 px-4 py-4 lg:px-5">
                  <div className="space-y-2">
                    <div className="h-3 w-24 rounded bg-[#efeae5]" />
                    <div className="h-3 w-56 max-w-full rounded bg-[#f3efeb]" />
                  </div>
                  <div className="h-7 w-24 rounded-full bg-[#f3efeb]" />
                </div>
              ))}
            </div>
          ) : !data ? (
            <p className="px-5 py-16 text-center text-sm text-[#756b65]">
              Courses could not be loaded.
            </p>
          ) : filteredCourses.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-semibold">No matching courses</p>
              <p className="mt-1.5 text-xs leading-5 text-[#756b65]">
                Try a different search term, programme year, or status.
              </p>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 text-xs font-semibold text-[#7d1f2a] underline underline-offset-4"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div
              className={`transition-opacity lg:max-h-[65vh] lg:overflow-auto ${
                loading ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {/* One real table. Below lg each row restyles into a compact stacked item. */}
              <table
                role="table"
                className="block w-full border-separate border-spacing-0 text-left lg:table"
              >
                <thead role="rowgroup" className="sr-only lg:not-sr-only lg:table-header-group">
                  <tr role="row">
                    <th role="columnheader" scope="col" className="w-44 border-b border-[#f0ece8] bg-white/95 px-5 py-3 text-xs font-medium text-[#8a7f78] backdrop-blur lg:sticky lg:top-0 lg:z-10">
                      Course code
                    </th>
                    <th role="columnheader" scope="col" className="border-b border-[#f0ece8] bg-white/95 px-5 py-3 text-xs font-medium text-[#8a7f78] backdrop-blur lg:sticky lg:top-0 lg:z-10">
                      Course name
                    </th>
                    <th role="columnheader" scope="col" className="w-28 border-b border-[#f0ece8] bg-white/95 px-5 py-3 text-xs font-medium text-[#8a7f78] backdrop-blur lg:sticky lg:top-0 lg:z-10">
                      Semester
                    </th>
                    <th role="columnheader" scope="col" className="w-44 border-b border-[#f0ece8] bg-white/95 px-5 py-3 text-xs font-medium text-[#8a7f78] backdrop-blur lg:sticky lg:top-0 lg:z-10">
                      Status
                    </th>
                    <th role="columnheader" scope="col" className="w-44 border-b border-[#f0ece8] bg-white/95 px-5 py-3 text-right text-xs font-medium text-[#8a7f78] backdrop-blur lg:sticky lg:top-0 lg:z-10">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody role="rowgroup" className="block lg:table-row-group">
                  {filteredCourses.map((course) => {
                    const record = recordsByCourse.get(course.id);
                    const pending = pendingCourseId === course.id;

                    return (
                      <tr
                        key={course.id}
                        role="row"
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-[#f0ece8] px-4 py-4 transition-colors last:border-b-0 hover:bg-[#fcfaf8] lg:table-row lg:px-0 lg:py-0"
                      >
                        <td
                          role="cell"
                          className="col-start-1 row-start-1 block font-mono text-[13px] font-semibold text-[#7d1f2a] lg:table-cell lg:border-b lg:border-[#f0ece8] lg:px-5 lg:py-4 lg:text-xs"
                        >
                          {course.code}
                        </td>

                        <td
                          role="cell"
                          className="col-span-2 row-start-2 block text-sm font-medium leading-snug text-[#2d2622] lg:table-cell lg:border-b lg:border-[#f0ece8] lg:px-5 lg:py-4 lg:font-normal"
                        >
                          {course.name}
                        </td>

                        <td
                          role="cell"
                          className="col-start-2 row-start-1 block text-right text-xs tabular-nums text-[#8a7f78] lg:table-cell lg:border-b lg:border-[#f0ece8] lg:px-5 lg:py-4 lg:text-left lg:text-sm lg:text-[#5f554f]"
                        >
                          {record?.semester != null ? (
                            <>
                              <span className="lg:hidden">Semester </span>
                              {record.semester}
                            </>
                          ) : (
                            "N/A"
                          )}
                        </td>

                        <td
                          role="cell"
                          className="col-start-1 row-start-3 block lg:table-cell lg:border-b lg:border-[#f0ece8] lg:px-5 lg:py-4"
                        >
                          <StatusBadge status={record?.status ?? null} />
                        </td>

                        <td
                          role="cell"
                          className="col-start-2 row-start-3 block text-right lg:table-cell lg:border-b lg:border-[#f0ece8] lg:px-5 lg:py-4"
                        >
                          {canEdit ? (
                            <button
                              type="button"
                              disabled={pendingCourseId !== null || loading}
                              onClick={(event) => openConfirmation(course, event.currentTarget)}
                              className="min-h-10 rounded-lg border border-[#ddd5cd] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#625954] transition hover:border-[#7d1f2a] hover:bg-[#f7f4f0] hover:text-[#7d1f2a] disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-0"
                            >
                              {pending ? "Saving..." : "Review status"}
                            </button>
                          ) : (
                            <span className="text-xs text-[#9b908a]">Read only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f0ece8] bg-[#fcfaf8] px-4 py-3 text-xs text-[#8a7f78] lg:px-5"
          >
            <span>
              {loading
                ? "Loading..."
                : data
                  ? `Showing ${filteredCourses.length} of ${counts.ALL} courses`
                  : "Not available"}
            </span>
            {data && <span>{selectedYearName}</span>}
          </div>
        </section>
      </div>

      {confirmation && targetStatus && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#211a17]/50 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeConfirmation();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-confirm-title"
            aria-describedby="course-confirm-description"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[#e6ded6] bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-2xl sm:pb-0"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#f0ece8] px-5 py-4 sm:px-6">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7d1f2a]">
                  Confirm academic record
                </p>
                <h2
                  id="course-confirm-title"
                  className="mt-1.5 text-lg font-semibold tracking-tight text-[#302824]"
                >
                  Confirm status change
                </h2>
              </div>

              <button
                type="button"
                disabled={pendingCourseId !== null}
                onClick={closeConfirmation}
                aria-label="Close confirmation"
                className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-xl leading-6 text-[#756b65] hover:bg-[#f6f2ee] hover:text-[#302824] disabled:opacity-40"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div className="overflow-hidden rounded-xl border border-[#e6ded6] bg-white">
                <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-[#f0ece8] px-3.5 py-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-[#857970]">
                      Course
                    </p>
                    <p className="mt-1 font-mono text-[12px] font-semibold text-[#7d1f2a]">
                      {confirmation.course.code}
                    </p>
                    <p className="mt-1 text-[13px] leading-5 text-[#403832]">
                      {confirmation.course.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[10px] uppercase tracking-wide text-[#857970]">
                      Academic year
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-[#302824]">
                      {selectedYearName}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3.5 py-3">
                  <div>
                    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-[#857970]">
                      Current status
                    </p>
                    <StatusBadge status={confirmation.currentStatus} />
                  </div>

                  <span className="text-[#a0958d]" aria-hidden="true">
                    →
                  </span>

                  <div>
                    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-[#857970]">
                      New status
                    </p>
                    <StatusBadge status={targetStatus} />
                  </div>
                </div>
              </div>

              <div
                id="course-confirm-description"
                className="rounded-xl border-l-[3px] border-amber-500 bg-amber-50 px-4 py-3.5"
              >
                <p className="text-[12px] font-semibold text-amber-950">
                  Please review this change carefully
                </p>

                {confirmation.action === "REPEAT" ? (
                  <p className="mt-1.5 text-[12px] leading-5 text-amber-950">
                    You are about to save this course as <strong>Repeating</strong>{" "}
                    for {selectedYearName}. This replaces its current status for
                    that year. If you later remove the repeating status, TXMate
                    will record the course as <strong>Not taking</strong>, rather
                    than automatically restoring its previous status.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[12px] leading-5 text-amber-950">
                    You are about to change this course from{" "}
                    <strong>Repeating</strong> to <strong>Not taking</strong> for{" "}
                    {selectedYearName}. The course record will not be deleted, but
                    it will no longer be recorded as repeating. Do not proceed if
                    you are still repeating this course.
                  </p>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e6ded6] px-3.5 py-3.5 transition hover:bg-[#faf8f6]">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  disabled={pendingCourseId !== null}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#7d1f2a]"
                />
                <span className="text-[12px] leading-5 text-[#403832]">
                  <strong className="font-semibold">I understand and agree.</strong>{" "}
                  I have reviewed the current and new status and confirm that this
                  change accurately reflects my academic record for the selected
                  year.
                </span>
              </label>

              {dialogError && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] font-medium text-red-800"
                >
                  {dialogError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-[#f0ece8] pt-4 sm:flex-row sm:justify-end">
                <button
                  ref={cancelButtonRef}
                  type="button"
                  disabled={pendingCourseId !== null}
                  onClick={closeConfirmation}
                  className="min-h-11 rounded-xl border border-[#e3ddd6] bg-white px-4 py-2 text-[13px] font-semibold text-[#514640] transition hover:bg-[#f6f2ee] disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={!acknowledged || pendingCourseId !== null}
                  onClick={() => void confirmStatusChange()}
                  className="min-h-11 rounded-xl bg-[#7d1f2a] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#681923] disabled:cursor-not-allowed disabled:bg-[#c7b6b4]"
                >
                  {pendingCourseId ? "Saving status..." : "Confirm status change"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}