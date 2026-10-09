"use client";

import { useEffect, useMemo, useState } from "react";

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
        }>(`/api/schools/${encodeURIComponent(schoolId)}/programmes`);

        if (!controller.signal.aborted) {
          setProgrammes(data.programmes);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
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
  }, [schoolId]);

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

  if (success) {
    return (
      <section className="rounded-3xl border border-[#ded6cb] bg-white p-6 shadow-sm sm:p-8">
        <div className="border-b border-[#eee7df] pb-6">
          <p className="text-sm font-semibold text-[#7d1f2a]">
            Profile completed
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#2d1b1b]">
            You&apos;re ready to use TXMate, {userName.split(" ")[0]}.
          </h2>
          <p className="mt-2 text-[#6d6260]">
            Your academic profile has been created and your selected programme
            courses have been assigned for {success.academicYear}.
          </p>
        </div>

        <div className="pt-6">
          <h3 className="text-lg font-semibold text-[#2d1b1b]">Your courses</h3>

          <div className="mt-4 divide-y divide-[#eee7df] border-y border-[#eee7df]">
            {success.courses.map((item) => (
              <div
                className="flex items-center justify-between gap-4 py-4"
                key={item.id}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#2d1b1b]">
                    {item.course.code}
                  </p>
                  <p className="text-sm text-[#6d6260]">{item.course.name}</p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    item.isCompulsory
                      ? "bg-[#f4e9ea] text-[#7d1f2a]"
                      : "bg-[#f5f2ee] text-[#6d6260]"
                  }`}
                >
                  {item.isCompulsory ? "Compulsory" : "Elective"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-[#ded6cb] bg-white shadow-sm"
    >
      <div className="space-y-8 p-6 sm:p-8">
        <section>
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-[#2d1b1b]">
              Academic details
            </h2>
            <p className="mt-1 text-sm text-[#6d6260]">
              Select the academic structure that matches your current
              enrolment.
            </p>
          </div>

          <div className="grid items-start gap-5 md:grid-cols-2">
            <Field label="University" required>
              <Select
                value={universityId}
                onChange={(event) => handleUniversityChange(event.target.value)}
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

            <Field label="Programme" required>
              <Select
                value={programmeId}
                onChange={(event) => handleProgrammeChange(event.target.value)}
                disabled={!schoolId || loadingProgrammes || submitting}
              >
                <option value="">
                  {!schoolId
                    ? "Select school first"
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
        </section>

        <section className="border-t border-[#eee7df] pt-8">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-[#2d1b1b]">
              Personal details
            </h2>
            <p className="mt-1 text-sm text-[#6d6260]">
              Only the information needed to establish your academic profile is
              required.
            </p>
          </div>

          <div className="grid items-start gap-5 md:grid-cols-2">
            <Field
              label="Student ID"
              required
              hint={studentIdHint || "Select your university to see the ID format."}
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

            <Field label="Gender" required>
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
              hint="Optional. Zambian mobile number, kept private by default."
              error={showPhoneError ? phoneError : undefined}
            >
              <div className="flex">
                <span className="inline-flex items-center gap-2 rounded-l-xl border border-r-0 border-[#d9d0c8] bg-[#fcfaf7] px-3 text-sm font-medium text-[#2d1b1b]">
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
                  className={`min-w-0 flex-1 rounded-r-xl border bg-white px-4 py-3 text-sm text-[#2d1b1b] placeholder:text-[#9b918d] outline-none transition disabled:cursor-not-allowed disabled:bg-[#f5f2ee] ${
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
          <section className="border-t border-[#eee7df] pt-8">
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-[#2d1b1b]">
                Programme courses
              </h2>
              <p className="mt-1 text-sm text-[#6d6260]">
                Compulsory courses are included automatically. Select the
                electives that you actually take.
              </p>
            </div>

            {loadingCourses ? (
              <p className="text-sm text-[#6d6260]">Loading courses...</p>
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
                        These courses are automatically assigned to students in
                        this programme year.
                      </p>
                    </div>

                    <div className="divide-y divide-[#eee7df] border-y border-[#eee7df]">
                      {compulsoryCourses.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-4 py-4"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#2d1b1b]">
                              {item.course.code}
                            </p>
                            <p className="text-sm text-[#6d6260]">
                              {item.course.name}
                            </p>
                          </div>

                          <span className="shrink-0 rounded-full bg-[#f4e9ea] px-3 py-1 text-xs font-medium text-[#7d1f2a]">
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
                        const maxReached = selectedCount >= group.maxSelections;

                        return (
                          <div
                            key={group.id}
                            className="overflow-hidden rounded-2xl border border-[#ded6cb]"
                          >
                            <div className="border-b border-[#eee7df] bg-[#fcfaf7] px-5 py-4">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <h4 className="font-semibold text-[#2d1b1b]">
                                    {group.name}
                                  </h4>
                                  <p className="text-sm text-[#6d6260]">
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

                                <span className="text-sm font-medium text-[#7d1f2a]">
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
                                    className={`flex items-start gap-4 px-5 py-4 transition ${
                                      disabled
                                        ? "cursor-not-allowed opacity-50"
                                        : "cursor-pointer hover:bg-[#fcfaf7]"
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
          <div className="rounded-2xl border border-[#ded6cb] bg-[#fcfaf7] px-5 py-4">
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
                I confirm that the information I have provided is accurate and
                belongs to me. I understand that providing false or misleading
                information may result in my TXMate account being restricted or
                deactivated.
              </span>
            </label>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end rounded-b-3xl border-t border-[#eee7df] bg-[#fcfaf7] px-6 py-5 sm:px-8">
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
          className="rounded-xl bg-[#7d1f2a] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#671923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Creating profile..." : "Complete onboarding"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#392a29]">
        {label}
        {required ? (
          <span className="ml-1 text-[#7d1f2a]" aria-hidden="true">
            *
          </span>
        ) : null}
      </span>
      <span className="mt-2 block">{children}</span>
      {hint !== undefined ? (
        <span
          className={`mt-1.5 block min-h-5 text-xs leading-5 ${
            error ? "text-red-700" : "text-[#8b807d]"
          }`}
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
    <select
      {...props}
      className={`w-full rounded-xl border border-[#d9d0c8] bg-white px-4 py-3 text-sm text-[#2d1b1b] outline-none transition focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10 disabled:cursor-not-allowed disabled:bg-[#f5f2ee] ${className}`}
    >
      {children}
    </select>
  );
}

const inputClassName =
  "w-full rounded-xl border border-[#d9d0c8] bg-white px-4 py-3 text-sm text-[#2d1b1b] placeholder:text-[#9b918d] outline-none transition focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10 disabled:cursor-not-allowed disabled:bg-[#f5f2ee]";