"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type RateType =
  | "PER_SESSION"
  | "PER_HOUR"
  | "PER_WEEK"
  | "PER_MONTH"
  | "PER_COURSE"
  | "CUSTOM";

type Course = {
  id: string;
  code: string;
  name: string;
  isCurrentCurriculum: boolean;
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
  rateType: RateType;
  rateDetails: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
  isOutsideCurrentCurriculum: boolean;
};

type RateOption = {
  value: RateType;
  label: string;
  description: string;
};

const rateOptions: RateOption[] = [
  {
    value: "PER_SESSION",
    label: "Per session",
    description: "A fixed amount for each tutoring session.",
  },
  {
    value: "PER_HOUR",
    label: "Per hour",
    description: "A fixed hourly tutoring rate.",
  },
  {
    value: "PER_WEEK",
    label: "Per week",
    description: "A recurring weekly arrangement.",
  },
  {
    value: "PER_MONTH",
    label: "Per month",
    description: "A recurring monthly arrangement.",
  },
  {
    value: "PER_COURSE",
    label: "Per course",
    description: "One price for supporting the course as a whole.",
  },
  {
    value: "CUSTOM",
    label: "Custom",
    description: "Use this when your pricing arrangement needs explanation.",
  },
];

const inputClass =
  "w-full rounded-xl border border-[#d8cec5] bg-white px-4 py-2.5 text-sm text-[#302a26] shadow-xs outline-none transition placeholder:text-[#9a918a] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/15";

const textareaClass =
  "w-full resize-y rounded-xl border border-[#d8cec5] bg-white px-4 py-2.5 text-sm text-[#302a26] shadow-xs outline-none transition placeholder:text-[#9a918a] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/15";

function formatRateType(rateType: RateType) {
  switch (rateType) {
    case "PER_SESSION":
      return "Per session";
    case "PER_HOUR":
      return "Per hour";
    case "PER_WEEK":
      return "Per week";
    case "PER_MONTH":
      return "Per month";
    case "PER_COURSE":
      return "Per course";
    case "CUSTOM":
      return "Custom";
    default:
      return rateType;
  }
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hr${hours === 1 ? "" : "s"}`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  const isPositive = value === "ACTIVE" || value === "VERIFIED";
  const isWarning = value === "PENDING" || value === "UNVERIFIED";

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2d9d0] bg-white px-3 py-1 text-xs font-semibold text-[#4e4742] shadow-xs">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isPositive
            ? "bg-emerald-500"
            : isWarning
              ? "bg-amber-500"
              : "bg-gray-400"
        }`}
      />
      <span>{label}:</span>
      <span className="font-bold text-[#241f1c]">{formatStatus(value)}</span>
    </span>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-[#302a26]">
        {label}
      </label>
      <p className="text-xs text-[#746b65]">{description}</p>
      <div className="pt-1">{children}</div>
    </div>
  );
}

function CharacterCount({ value, max }: { value: string; max: number }) {
  const remaining = max - value.length;
  const isNearLimit = remaining <= max * 0.1;

  return (
    <p
      className={`mt-1 text-right text-[11px] font-medium tracking-tight ${
        isNearLimit ? "text-amber-600" : "text-[#8a817a]"
      }`}
    >
      {value.length}/{max}
    </p>
  );
}

function RateIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M12 6v12m5-9H9.5a2.5 2.5 0 100 5h5a2.5 2.5 0 110 5H7"
      />
    </svg>
  );
}

function BookIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M5 4.5h11a3 3 0 013 3V20H8a3 3 0 01-3-3V4.5z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M8 20a3 3 0 013-3h8"
      />
    </svg>
  );
}

function PencilIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M16.862 4.487a2.121 2.121 0 013 3L8.25 19.099 4 20l.901-4.25L16.862 4.487z"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 7h16M10 11v6m4-6v6M9 7V5.75A1.75 1.75 0 0110.75 4h2.5A1.75 1.75 0 0115 5.75V7m-9 0 .9 12.15A2 2 0 008.895 21h6.21a2 2 0 001.995-1.85L18 7"
      />
    </svg>
  );
}

export default function AcademicMateOfferingsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingOfferingId, setEditingOfferingId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<"offerings" | "form">("offerings");
  const formRef = useRef<HTMLFormElement | null>(null);

  const [courseSearch, setCourseSearch] = useState("");
  const [offeringSearch, setOfferingSearch] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("");
  const [rateType, setRateType] = useState<RateType>("PER_SESSION");
  const [rateDetails, setRateDetails] = useState("");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState("60");

  const filteredCourses = useMemo(() => {
    const query = courseSearch.trim().toLowerCase();

    if (!query) {
      return courses;
    }

    return courses.filter(
      (course) =>
        course.code.toLowerCase().includes(query) ||
        course.name.toLowerCase().includes(query),
    );
  }, [courseSearch, courses]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const editingOffering = useMemo(
    () =>
      offerings.find((offering) => offering.id === editingOfferingId) ?? null,
    [editingOfferingId, offerings],
  );

  const filteredOfferings = useMemo(() => {
    const query = offeringSearch.trim().toLowerCase();

    if (!query) {
      return offerings;
    }

    return offerings.filter((offering) =>
      [
        offering.course.code,
        offering.course.name,
        offering.title ?? "",
        offering.description ?? "",
        formatRateType(offering.rateType),
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [offeringSearch, offerings]);

  async function readJson(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      throw new Error("The server returned an unexpected response.");
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [coursesResponse, offeringsResponse] = await Promise.all([
        fetch("/api/student/academic-mate/courses", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        fetch("/api/student/academic-mate/offerings", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
      ]);

      const coursesBody = await readJson(coursesResponse);
      const offeringsBody = await readJson(offeringsResponse);

      if (!coursesResponse.ok) {
        throw new Error(
          typeof coursesBody.error === "string"
            ? coursesBody.error
            : "Unable to load available courses.",
        );
      }

      if (!offeringsResponse.ok) {
        throw new Error(
          typeof offeringsBody.error === "string"
            ? offeringsBody.error
            : "Unable to load your offerings.",
        );
      }

      setCourses(
        Array.isArray(coursesBody.courses)
          ? (coursesBody.courses as Course[])
          : [],
      );
      setOfferings(
        Array.isArray(offeringsBody.offerings)
          ? (offeringsBody.offerings as Offering[])
          : [],
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load your offerings.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function resetForm() {
    setEditingOfferingId(null);
    setCourseSearch("");
    setSelectedCourseId("");
    setTitle("");
    setDescription("");
    setRate("");
    setRateType("PER_SESSION");
    setRateDetails("");
    setSessionDurationMinutes("60");
  }

  function startEditing(offering: Offering) {
    setError("");
    setSuccess("");
    setEditingOfferingId(offering.id);
    setSelectedCourseId(offering.course.id);
    setCourseSearch("");
    setTitle(offering.title ?? "");
    setDescription(offering.description ?? "");
    setRate(offering.rate);
    setRateType(offering.rateType);
    setRateDetails(offering.rateDetails ?? "");
    setSessionDurationMinutes(String(offering.sessionDurationMinutes));

    setActiveTab("form");

    window.setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!selectedCourseId) {
      setError("Select a course.");
      return;
    }

    if (!rate.trim()) {
      setError("Enter a rate.");
      return;
    }

    if (rateType === "CUSTOM" && !rateDetails.trim()) {
      setError("Describe your custom pricing arrangement.");
      return;
    }

    const duration = Number(sessionDurationMinutes);

    if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
      setError("Typical session length must be between 1 and 1440 minutes.");
      return;
    }

    setSaving(true);

    try {
      const isEditing = Boolean(editingOfferingId);
      const endpoint = isEditing
        ? `/api/student/academic-mate/offerings/${editingOfferingId}`
        : "/api/student/academic-mate/offerings";

      const response = await fetch(endpoint, {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: selectedCourseId,
          title: title.trim() || null,
          description: description.trim() || null,
          rate: rate.trim(),
          currency: "ZMW",
          rateType,
          rateDetails: rateType === "CUSTOM" ? rateDetails.trim() : null,
          sessionDurationMinutes: duration,
        }),
      });

      const body = await readJson(response);

      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : isEditing
              ? "Unable to update the offering."
              : "Unable to create the offering.",
        );
      }

      if (!body.offering || typeof body.offering !== "object") {
        throw new Error("The server returned an incomplete offering.");
      }

      const updatedOffering = body.offering as Offering;

      setOfferings((current) => {
        if (isEditing) {
          return current.map((offering) =>
            offering.id === updatedOffering.id ? updatedOffering : offering,
          );
        }

        return [updatedOffering, ...current];
      });

      setSuccess(
        isEditing
          ? "Your offering has been updated."
          : "Your offering has been added.",
      );
      resetForm();
      setOfferingSearch("");
      setActiveTab("offerings");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save the offering.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(offering: Offering) {
    const confirmed = window.confirm(
      `Delete your ${offering.course.code} offering? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(offering.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `/api/student/academic-mate/offerings/${offering.id}`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const body = await readJson(response);

      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Unable to delete the offering.",
        );
      }

      setOfferings((current) =>
        current.filter((item) => item.id !== offering.id),
      );

      if (editingOfferingId === offering.id) {
        resetForm();
      }

      setSuccess(
        `${offering.course.code} has been removed from your offerings.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete the offering.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f1ed] antialiased">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link
            href="/student/academic-mate"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#7d1f2a] transition hover:text-[#5c161f]"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Academic Mate
          </Link>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="inline-block rounded-full bg-[#7d1f2a]/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#7d1f2a]">
                Academic Mate
              </span>

              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#241f1c] sm:text-4xl">
                Your offerings
              </h1>

              <p className="mt-2 max-w-xl text-sm text-[#625b55] sm:text-base">
                Manage the courses you can support, your pricing arrangement,
                and the terms students will see when they discover you.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2d9d0] bg-white px-3 py-1 text-xs font-semibold text-[#4e4742] shadow-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-[#7d1f2a]" />
                <span className="font-bold text-[#241f1c]">
                  {offerings.length}
                </span>
                <span>{offerings.length === 1 ? "offering" : "offerings"}</span>
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3.5 text-sm text-red-800 shadow-sm"
          >
            <svg
              className="h-5 w-5 flex-shrink-0 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3.5 text-sm text-emerald-800 shadow-sm"
          >
            <svg
              className="h-5 w-5 flex-shrink-0 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{success}</span>
          </div>
        )}

        <div
          role="tablist"
          aria-label="Offerings sections"
          className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-[#e2d9d0] bg-white p-1 shadow-sm lg:hidden"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "offerings"}
            onClick={() => setActiveTab("offerings")}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/20 ${
              activeTab === "offerings"
                ? "bg-[#7d1f2a] text-white shadow-sm"
                : "text-[#4e4742] hover:bg-[#f6f1ec]"
            }`}
          >
            Current offerings
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                activeTab === "offerings"
                  ? "bg-white/20 text-white"
                  : "bg-[#7d1f2a]/10 text-[#7d1f2a]"
              }`}
            >
              {offerings.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "form"}
            onClick={() => setActiveTab("form")}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/20 ${
              activeTab === "form"
                ? "bg-[#7d1f2a] text-white shadow-sm"
                : "text-[#4e4742] hover:bg-[#f6f1ec]"
            }`}
          >
            {editingOffering ? "Edit offering" : "Add offering"}
          </button>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:gap-8">
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className={`space-y-8 ${
              activeTab === "form" ? "block" : "hidden"
            } lg:block`}
          >
            <section className="overflow-hidden rounded-2xl border border-[#e2d9d0] bg-white shadow-sm transition hover:shadow-md">
              <div className="border-b border-[#e2d9d0]/70 bg-[#faf8f6] px-6 py-4 sm:px-8">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-[#7d1f2a]">
                    <BookIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#241f1c]">
                      {editingOffering ? "Edit offering" : "Add an offering"}
                    </h2>
                    <p className="text-xs text-[#6b625c]">
                      {editingOffering
                        ? "Update the course, pricing, or support details for this offering."
                        : "Choose a course and tell students how you provide academic support."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 px-6 py-6 sm:px-8">
                <Field
                  label="Course"
                  description="Choose the course you are prepared to support."
                >
                  <input
                    type="search"
                    value={courseSearch}
                    onChange={(event) => setCourseSearch(event.target.value)}
                    placeholder="Search by course code or name"
                    className={inputClass}
                  />

                  <div className="mt-3 max-h-60 overflow-y-auto rounded-xl border border-[#d8cec5] bg-white">
                    {loading ? (
                      <div className="px-4 py-4 text-sm text-[#8a817a]">
                        Loading courses...
                      </div>
                    ) : filteredCourses.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-[#8a817a]">
                        No matching courses found.
                      </div>
                    ) : (
                      filteredCourses.map((course) => {
                        const selected = course.id === selectedCourseId;

                        return (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => setSelectedCourseId(course.id)}
                            className={`w-full border-b border-[#eee7df] px-4 py-3 text-left transition last:border-b-0 ${
                              selected
                                ? "bg-[#f6f1ec]"
                                : "hover:bg-[#faf8f6]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p
                                  className={`text-sm font-semibold ${
                                    selected
                                      ? "text-[#7d1f2a]"
                                      : "text-[#302a26]"
                                  }`}
                                >
                                  {course.code}
                                </p>
                                <p className="mt-0.5 text-sm text-[#6b625c]">
                                  {course.name}
                                </p>
                              </div>

                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                                  course.isCurrentCurriculum
                                    ? "bg-[#f1ece7] text-[#6b625c]"
                                    : "bg-[#7d1f2a]/10 text-[#7d1f2a]"
                                }`}
                              >
                                {course.isCurrentCurriculum
                                  ? "Current curriculum"
                                  : "Outside curriculum"}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {selectedCourse && (
                    <div className="mt-3 rounded-xl border border-[#e2d9d0] bg-[#faf8f6] px-4 py-3">
                      <div className="flex items-start gap-3">
                        <BookIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#7d1f2a]" />
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-[#7d1f2a]">
                            Selected course
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[#241f1c]">
                            {selectedCourse.code} · {selectedCourse.name}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#6b625c]">
                            {selectedCourse.isCurrentCurriculum
                              ? "This course is part of your current curriculum."
                              : "This course is outside your current curriculum. You can still offer academic support for it."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </Field>

                <Field
                  label="Offering title"
                  description="A short title students can quickly understand."
                >
                  <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={120}
                    placeholder="e.g. Mobile Networks academic support"
                    className={inputClass}
                  />
                  <CharacterCount value={title} max={120} />
                </Field>

                <Field
                  label="Description"
                  description="Explain the kind of academic support you provide."
                >
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={2000}
                    rows={4}
                    placeholder="Describe the topics, level, or type of support you provide."
                    className={textareaClass}
                  />
                  <CharacterCount value={description} max={2000} />
                </Field>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-[#e2d9d0] bg-white shadow-sm transition hover:shadow-md">
              <div className="border-b border-[#e2d9d0]/70 bg-[#faf8f6] px-6 py-4 sm:px-8">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-[#7d1f2a]">
                    <RateIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#241f1c]">
                      Pricing
                    </h2>
                    <p className="text-xs text-[#6b625c]">
                      Choose how your rate is charged instead of assuming every
                      arrangement is per session.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 px-6 py-6 sm:px-8">
                <Field
                  label="Amount"
                  description="Enter the amount you charge for the pricing basis below."
                >
                  <div className="flex items-stretch">
                    <span className="inline-flex items-center rounded-l-xl border border-r-0 border-[#d8cec5] bg-[#faf8f6] px-4 text-sm font-bold text-[#7d1f2a]">
                      ZMW
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rate}
                      onChange={(event) => setRate(event.target.value)}
                      placeholder="250.00"
                      className={`${inputClass} rounded-l-none`}
                    />
                  </div>
                </Field>

                <Field
                  label="Pricing basis"
                  description="Students will see this basis alongside your amount."
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rateOptions.map((option) => {
                      const selected = rateType === option.value;

                      return (
                        <label
                          key={option.value}
                          className={`cursor-pointer rounded-xl border p-4 transition-all ${
                            selected
                              ? "border-[#7d1f2a] bg-[#f6f1ec]/60 ring-1 ring-[#7d1f2a]"
                              : "border-[#e2d9d0] hover:border-[#cbbfb4] hover:bg-[#faf8f6]"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="rateType"
                              value={option.value}
                              checked={selected}
                              onChange={() => setRateType(option.value)}
                              className="mt-0.5 h-4 w-4 accent-[#7d1f2a]"
                            />
                            <span>
                              <span className="block text-sm font-semibold text-[#241f1c]">
                                {option.label}
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-[#6b625c]">
                                {option.description}
                              </span>
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </Field>

                {rateType === "CUSTOM" && (
                  <Field
                    label="Custom pricing details"
                    description="Make the arrangement clear to students."
                  >
                    <textarea
                      value={rateDetails}
                      onChange={(event) => setRateDetails(event.target.value)}
                      maxLength={300}
                      rows={3}
                      placeholder="e.g. ZMW 250 covers two 90-minute group sessions each week."
                      className={textareaClass}
                    />
                    <CharacterCount value={rateDetails} max={300} />
                  </Field>
                )}

                <Field
                  label="Session Duration"
                  description="This is separate from your pricing basis and is used only as a guide for students and future scheduling."
                >
                  <select
                    value={sessionDurationMinutes}
                    onChange={(event) =>
                      setSessionDurationMinutes(event.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1 hour 30 minutes</option>
                    <option value="120">2 hours</option>
                    <option value="180">3 hours</option>
                  </select>
                </Field>
              </div>
            </section>

            <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-center">
              {editingOffering && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setActiveTab("offerings");
                  }}
                  disabled={saving}
                  className="rounded-xl border border-[#d8cec5] bg-white px-5 py-2.5 text-sm font-semibold text-[#4e4742] shadow-sm transition hover:bg-[#f6f1ec] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel edit
                </button>
              )}

              <Link
                href="/student/academic-mate"
                className="rounded-xl border border-[#d8cec5] bg-white px-5 py-2.5 text-center text-sm font-semibold text-[#4e4742] shadow-sm transition hover:bg-[#f6f1ec] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/20"
              >
                Back to profile
              </Link>

              <button
                type="submit"
                disabled={saving || loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7d1f2a] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#681923] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && (
                  <svg
                    className="h-4 w-4 animate-spin text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                {saving
                  ? editingOffering
                    ? "Saving..."
                    : "Adding..."
                  : editingOffering
                    ? "Save changes"
                    : "Add offering"}
              </button>
            </div>
          </form>

          <section
            className={`flex-col overflow-hidden rounded-2xl border border-[#e2d9d0] bg-white shadow-sm lg:sticky lg:top-6 lg:flex lg:max-h-[calc(100vh-3rem)] ${
              activeTab === "offerings" ? "flex" : "hidden"
            }`}
          >
            <div className="border-b border-[#e2d9d0]/70 bg-[#faf8f6] px-6 py-4 sm:px-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-[#241f1c]">
                    Current offerings
                  </h2>
                  <p className="text-xs text-[#6b625c]">
                    Each offering can be edited or removed independently.
                  </p>
                </div>

                {offerings.length > 0 && (
                  <span className="shrink-0 rounded-full bg-[#7d1f2a]/10 px-2.5 py-1 text-[11px] font-bold text-[#7d1f2a]">
                    {offeringSearch.trim()
                      ? `${filteredOfferings.length} of ${offerings.length}`
                      : offerings.length}
                  </span>
                )}
              </div>
            </div>

            {offerings.length > 0 && (
              <div className="border-b border-[#e2d9d0]/70 bg-white px-6 py-3 sm:px-8">
                <div className="relative">
                  <svg
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a918a]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
                    />
                  </svg>

                  <input
                    type="search"
                    value={offeringSearch}
                    onChange={(event) => setOfferingSearch(event.target.value)}
                    placeholder="Search your offerings"
                    aria-label="Search your offerings"
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#faf8f6] p-4 sm:p-5">
              {loading ? (
                <>
                  <div className="h-40 animate-pulse rounded-xl bg-white" />
                  <div className="h-40 animate-pulse rounded-xl bg-white" />
                </>
              ) : offerings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d8cec5] bg-white px-6 py-12 text-center sm:px-8">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#f6f1ec] text-[#7d1f2a]">
                    <BookIcon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-[#302a26]">
                    No offerings yet
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#746b65]">
                    Add a course using the form to make your academic support
                    available through TXMate.
                  </p>

                  <button
                    type="button"
                    onClick={() => setActiveTab("form")}
                    className="mt-4 inline-flex rounded-xl bg-[#7d1f2a] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#681923] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/40 lg:hidden"
                  >
                    Add an offering
                  </button>
                </div>
              ) : filteredOfferings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d8cec5] bg-white px-6 py-10 text-center">
                  <h3 className="text-sm font-bold text-[#302a26]">
                    No matching offerings
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#746b65]">
                    Nothing matches &ldquo;{offeringSearch.trim()}&rdquo;. Try a
                    course code, course name, or a word from the description.
                  </p>
                  <button
                    type="button"
                    onClick={() => setOfferingSearch("")}
                    className="mt-4 inline-flex rounded-xl border border-[#d8cec5] bg-white px-4 py-2 text-xs font-semibold text-[#4e4742] transition hover:bg-[#f6f1ec] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/20"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                filteredOfferings.map((offering) => (
                  <article
                    key={offering.id}
                    className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-xs transition hover:shadow-sm"
                  >
                    <div className="space-y-4 px-5 py-5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-widest text-[#7d1f2a]">
                            {offering.course.code}
                          </span>

                          {offering.isOutsideCurrentCurriculum && (
                            <span className="rounded-full bg-[#7d1f2a]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#7d1f2a]">
                              Outside curriculum
                            </span>
                          )}
                        </div>

                        <h3 className="mt-1.5 text-base font-bold leading-snug text-[#241f1c]">
                          {offering.course.name}
                        </h3>

                        {offering.title && (
                          <p className="mt-1 text-sm font-medium text-[#4e4742]">
                            {offering.title}
                          </p>
                        )}
                      </div>

                      <div className="rounded-lg bg-[#faf8f6] px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#8a817a]">
                          Description
                        </p>
                        {offering.description ? (
                          <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-[#4e4742]">
                            {offering.description}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-sm italic leading-6 text-[#9a918a]">
                            No description added.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f6f1ec] px-3 py-1 text-xs font-semibold text-[#4e4742]">
                          <RateIcon className="h-3.5 w-3.5 text-[#7d1f2a]" />
                          {offering.currency} {offering.rate} ·{" "}
                          {formatRateType(offering.rateType)}
                        </span>

                        <span className="rounded-full bg-[#f6f1ec] px-3 py-1 text-xs font-semibold text-[#4e4742]">
                          Session Duration:{" "}
                          {formatDuration(offering.sessionDurationMinutes)}
                        </span>
                      </div>

                      {offering.rateType === "CUSTOM" &&
                        offering.rateDetails && (
                          <div className="rounded-lg border border-[#e2d9d0] bg-[#faf8f6] px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8a817a]">
                              Pricing details
                            </p>
                            <p className="mt-1 text-sm leading-5 text-[#4e4742]">
                              {offering.rateDetails}
                            </p>
                          </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 border-t border-[#eee7df] bg-[#faf8f6]/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge label="Status" value={offering.status} />
                        <StatusBadge
                          label="Verification"
                          value={offering.verificationStatus}
                        />
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(offering)}
                          disabled={deletingId === offering.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8cec5] bg-white px-3 py-2 text-xs font-semibold text-[#4e4742] transition hover:border-[#7d1f2a]/40 hover:bg-[#faf8f6] hover:text-[#7d1f2a] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDelete(offering)}
                          disabled={deletingId === offering.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                          {deletingId === offering.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}