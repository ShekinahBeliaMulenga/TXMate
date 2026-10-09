"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type University = {
  id: string;
  name: string;
  code: string | null;
};

type School = {
  id: string;
  name: string;
  code: string | null;
};

type Program = {
  id: string;
  name: string;
  code: string | null;
};

type ProgramCourse = {
  courseId: string;
  isElective: boolean;
  course: {
    id: string;
    code: string;
    name: string;
    description: string | null;
  };
};

export default function OnboardingPage() {
  const router = useRouter();

  const [universities, setUniversities] = useState<University[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [courses, setCourses] = useState<ProgramCourse[]>([]);

  const [universityId, setUniversityId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [programId, setProgramId] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("");
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);

  const [loadingUniversities, setLoadingUniversities] = useState(true);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUniversities() {
      try {
        const response = await fetch("/api/universities");

        if (!response.ok) {
          throw new Error();
        }

        const data = await response.json();

        setUniversities(data);

        if (data.length === 1) {
          setUniversityId(data[0].id);
        }
      } catch {
        setError("Unable to load universities.");
      } finally {
        setLoadingUniversities(false);
      }
    }

    loadUniversities();
  }, []);

  useEffect(() => {
    if (!universityId) {
      setSchools([]);
      setSchoolId("");
      return;
    }

    async function loadSchools() {
      setLoadingSchools(true);
      setError("");

      setSchoolId("");
      setProgramId("");
      setPrograms([]);
      setYearOfStudy("");
      setCourses([]);
      setSelectedCourses([]);

      try {
        const response = await fetch(
          `/api/schools?universityId=${encodeURIComponent(universityId)}`
        );

        if (!response.ok) {
          throw new Error();
        }

        setSchools(await response.json());
      } catch {
        setError("Unable to load schools.");
      } finally {
        setLoadingSchools(false);
      }
    }

    loadSchools();
  }, [universityId]);

  useEffect(() => {
    if (!schoolId) {
      setPrograms([]);
      setProgramId("");
      return;
    }

    async function loadPrograms() {
      setLoadingPrograms(true);
      setError("");

      setProgramId("");
      setYearOfStudy("");
      setCourses([]);
      setSelectedCourses([]);

      try {
        const response = await fetch(
          `/api/programs?schoolId=${encodeURIComponent(schoolId)}`
        );

        if (!response.ok) {
          throw new Error();
        }

        setPrograms(await response.json());
      } catch {
        setError("Unable to load programmes.");
      } finally {
        setLoadingPrograms(false);
      }
    }

    loadPrograms();
  }, [schoolId]);

  useEffect(() => {
    if (!programId || !yearOfStudy) {
      setCourses([]);
      setSelectedCourses([]);
      return;
    }

    async function loadCourses() {
      setLoadingCourses(true);
      setError("");
      setSelectedCourses([]);

      try {
        const response = await fetch(
          `/api/programs/${encodeURIComponent(
            programId
          )}/courses?year=${encodeURIComponent(yearOfStudy)}`
        );

        if (!response.ok) {
          throw new Error();
        }

        setCourses(await response.json());
      } catch {
        setError("Unable to load courses.");
      } finally {
        setLoadingCourses(false);
      }
    }

    loadCourses();
  }, [programId, yearOfStudy]);

  function toggleCourse(courseId: string) {
    setSelectedCourses((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId]
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (selectedCourses.length === 0) {
      setError("Select at least one course.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          universityId,
          schoolId,
          programId,
          yearOfStudy: Number(yearOfStudy),
          courseIds: selectedCourses,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to complete your profile.");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#faf9f6] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#8f4e00]">
            TXMate
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Complete your student profile
          </h1>

          <p className="mt-2 max-w-xl text-gray-600">
            Tell us what you study and the courses you are taking so TXMate
            can help you find the right academic connections.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="university"
                className="mb-2 block text-sm font-medium text-gray-900"
              >
                University
              </label>

              <select
                id="university"
                value={universityId}
                onChange={(event) => setUniversityId(event.target.value)}
                disabled={loadingUniversities}
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-[#6b1728] focus:ring-4 focus:ring-[#6b1728]/10"
              >
                <option value="">
                  {loadingUniversities
                    ? "Loading universities..."
                    : "Select your university"}
                </option>

                {universities.map((university) => (
                  <option key={university.id} value={university.id}>
                    {university.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="school"
                className="mb-2 block text-sm font-medium text-gray-900"
              >
                School
              </label>

              <select
                id="school"
                value={schoolId}
                onChange={(event) => setSchoolId(event.target.value)}
                disabled={!universityId || loadingSchools}
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-[#6b1728] focus:ring-4 focus:ring-[#6b1728]/10 disabled:bg-gray-100"
              >
                <option value="">
                  {loadingSchools ? "Loading schools..." : "Select your school"}
                </option>

                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="program"
                className="mb-2 block text-sm font-medium text-gray-900"
              >
                Programme
              </label>

              <select
                id="program"
                value={programId}
                onChange={(event) => setProgramId(event.target.value)}
                disabled={!schoolId || loadingPrograms}
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-[#6b1728] focus:ring-4 focus:ring-[#6b1728]/10 disabled:bg-gray-100"
              >
                <option value="">
                  {loadingPrograms
                    ? "Loading programmes..."
                    : "Select your programme"}
                </option>

                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="yearOfStudy"
                className="mb-2 block text-sm font-medium text-gray-900"
              >
                Year of study
              </label>

              <select
                id="yearOfStudy"
                value={yearOfStudy}
                onChange={(event) => setYearOfStudy(event.target.value)}
                disabled={!programId}
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-[#6b1728] focus:ring-4 focus:ring-[#6b1728]/10 disabled:bg-gray-100"
              >
                <option value="">Select your year</option>

                {Array.from({ length: 8 }, (_, index) => {
                  const year = index + 1;

                  return (
                    <option key={year} value={year}>
                      {year === 1
                        ? "1st Year"
                        : year === 2
                        ? "2nd Year"
                        : year === 3
                        ? "3rd Year"
                        : `${year}th Year`}
                    </option>
                  );
                })}
              </select>
            </div>

            {yearOfStudy && (
              <div>
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Courses for your year
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Select the courses you are currently taking.
                  </p>
                </div>

                {loadingCourses ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
                    Loading courses...
                  </div>
                ) : courses.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
                    No courses have been configured for this year yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {courses.map((item) => (
                      <label
                        key={item.courseId}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 transition hover:border-[#6b1728]/40 hover:bg-[#faf9f6]"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCourses.includes(item.courseId)}
                          onChange={() => toggleCourse(item.courseId)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-[#4d0014] focus:ring-[#6b1728]"
                        />

                        <span className="min-w-0">
                          <span className="block font-semibold text-gray-900">
                            {item.course.code}
                          </span>

                          <span className="block text-sm text-gray-600">
                            {item.course.name}
                          </span>

                          {item.isElective && (
                            <span className="mt-1 inline-block text-xs font-medium text-[#8f4e00]">
                              Elective
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                submitting ||
                loadingUniversities ||
                loadingSchools ||
                loadingPrograms ||
                loadingCourses ||
                selectedCourses.length === 0
              }
              className="w-full rounded-xl bg-[#4d0014] px-4 py-3 font-semibold text-white transition hover:bg-[#6b1728] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving profile..." : "Continue to TXMate"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}