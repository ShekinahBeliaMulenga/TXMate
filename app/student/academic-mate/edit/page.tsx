"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type ProfileVisibility =
  | "PUBLIC"
  | "MEMBERS_ONLY"
  | "PRIVATE";

type AcademicMate = {
  id: string;
  userId: string;
  universityId: string;
  studentProfileId: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  verificationStatus:
    | "UNVERIFIED"
    | "PENDING"
    | "VERIFIED"
    | "REJECTED";
  headline: string | null;
  bio: string | null;
  teachingExperience: string | null;
  yearsExperience: number | null;
  profileVisibility: ProfileVisibility;
  verifiedAt: string | null;
  verifiedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
};

type AcademicMateResponse = {
  academicMate: AcademicMate;
};

const visibilityOptions: {
  value: ProfileVisibility;
  label: string;
  description: string;
  icon: (className: string) => React.ReactNode;
}[] = [
  {
    value: "PUBLIC",
    label: "Public",
    description:
      "Your Academic Mate profile can be discovered by other TXMate members.",
    icon: (className) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 014 9 15.3 15.3 0 01-4 9 15.3 15.3 0 01-4-9 15.3 15.3 0 014-9z" />
      </svg>
    ),
  },
  {
    value: "MEMBERS_ONLY",
    label: "Members only",
    description:
      "Only signed-in TXMate members can view your Academic Mate profile.",
    icon: (className) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    value: "PRIVATE",
    label: "Private",
    description:
      "Your Academic Mate profile will not be publicly discoverable.",
    icon: (className) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
];

export default function AcademicMatePage() {
  const [academicMate, setAcademicMate] = useState<AcademicMate | null>(null);

  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [teachingExperience, setTeachingExperience] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>("PUBLIC");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAcademicMate() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/student/academic-mate", {
          method: "GET",
          cache: "no-store",
        });

        const data = (await response.json()) as AcademicMateResponse | { error?: string };

        if (cancelled) return;

        if (response.status === 404) {
          setAcademicMate(null);
          return;
        }

        if (!response.ok) {
          throw new Error(
            "error" in data && data.error ? data.error : "Unable to load your Academic Mate profile.",
          );
        }

        if ("academicMate" in data) {
          const mate = data.academicMate;

          setAcademicMate(mate);
          setHeadline(mate.headline ?? "");
          setBio(mate.bio ?? "");
          setTeachingExperience(mate.teachingExperience ?? "");
          setYearsExperience(mate.yearsExperience === null ? "" : String(mate.yearsExperience));
          setProfileVisibility(mate.profileVisibility);
        }
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error ? err.message : "Unable to load your Academic Mate profile.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAcademicMate();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/student/academic-mate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          headline: headline.trim() || null,
          bio: bio.trim() || null,
          teachingExperience: teachingExperience.trim() || null,
          yearsExperience: yearsExperience.trim() === "" ? null : Number(yearsExperience),
          profileVisibility,
        }),
      });

      const data = (await response.json()) as AcademicMateResponse | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in data && data.error ? data.error : "Unable to create your Academic Mate profile.",
        );
      }

      if (!("academicMate" in data)) {
        throw new Error("The server returned an invalid response.");
      }

      setAcademicMate(data.academicMate);
      setSuccess("Your Academic Mate profile has been created.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create your Academic Mate profile.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/student/academic-mate", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          headline: headline.trim() || null,
          bio: bio.trim() || null,
          teachingExperience: teachingExperience.trim() || null,
          yearsExperience: yearsExperience.trim() === "" ? null : Number(yearsExperience),
          profileVisibility,
        }),
      });

      const data = (await response.json()) as AcademicMateResponse | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in data && data.error ? data.error : "Unable to save your Academic Mate profile.",
        );
      }

      if (!("academicMate" in data)) {
        throw new Error("The server returned an invalid response.");
      }

      setAcademicMate(data.academicMate);
      setSuccess("Your Academic Mate profile has been updated.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save your Academic Mate profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f4f1ed] text-[#241f1c]">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="h-4 w-32 animate-pulse rounded bg-[#e2d9d0]" />
          <div className="mt-8 space-y-3">
            <div className="h-8 w-64 animate-pulse rounded-md bg-[#e2d9d0]" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[#e2d9d0]" />
          </div>
          <div className="mt-10 h-96 animate-pulse rounded-2xl border border-[#e2d9d0]/60 bg-white shadow-sm" />
          <div className="mt-6 h-64 animate-pulse rounded-2xl border border-[#e2d9d0]/60 bg-white shadow-sm" />
        </div>
      </main>
    );
  }

  const isEditing = academicMate !== null;

  return (
    <main className="min-h-screen bg-[#f4f1ed] antialiased">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="mb-8 border-b border-[#e2d9d0] pb-8">
        {isEditing && (
            <Link
              href="/student/academic-mate"
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#7d1f2a] transition hover:text-[#5c161f]"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 17 17 7M7 7h10v10"
                />
              </svg>
              View Profile
            </Link>
          )}

          <div className={`${isEditing ? "mt-6" : "mt-0"} flex flex-col items-start justify-between gap-4 md:flex-row md:items-end`}>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#241f1c] sm:text-4xl">
                {isEditing ? "Academic Mate Profile" : "Become an Academic Mate"}
              </h1>
              <p className="mt-2 text-sm text-[#625b55] sm:text-base">
                {isEditing
                  ? "Manage the information students will use to understand your academic support profile."
                  : "Offer academic support to other students through TXMate."}
              </p>
            </div>

            {isEditing && (
              <div className="flex shrink-0 items-center gap-2 pt-1">
                <StatusBadge label="Status" value={academicMate.status} />
                <StatusBadge label="Verification" value={academicMate.verificationStatus} />
              </div>
            )}
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3.5 text-sm text-red-800 shadow-sm backdrop-blur-sm" role="alert">
            <svg className="h-5 w-5 flex-shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3.5 text-sm text-emerald-800 shadow-sm backdrop-blur-sm" role="status">
            <svg className="h-5 w-5 flex-shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{success}</span>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={isEditing ? handleSave : handleCreate} className="space-y-8">
          
          {/* Card 1: Experience & Info */}
          <section className="overflow-hidden rounded-2xl border border-[#e2d9d0] bg-white shadow-sm transition hover:shadow-md">
            <div className="border-b border-[#e2d9d0]/70 bg-[#faf8f6] px-6 py-5 sm:px-8">
              <h2 className="text-base font-bold text-[#241f1c]">
                About your academic support
              </h2>
              <p className="mt-1 text-xs text-[#6b625c]">
                Provide details about your expertise and what you can help students with.
              </p>
            </div>

            <div className="space-y-6 px-6 py-6 sm:px-8">
              <Field
                label="Headline"
                description="A short, catchy description of the academic support you provide."
              >
                <input
                  type="text"
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                  maxLength={120}
                  placeholder="e.g. Computer Science student offering programming support"
                  className={inputClass}
                />
                <CharacterCount value={headline} max={120} />
              </Field>

              <Field
                label="Bio"
                description="Give students more context about your academic background."
              >
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  maxLength={1000}
                  rows={4}
                  placeholder="Describe your academic background and the kind of support you provide."
                  className={textareaClass}
                />
                <CharacterCount value={bio} max={1000} />
              </Field>

              <Field
                label="Teaching experience"
                description="Describe relevant tutoring, mentoring, teaching, or peer-support experience."
              >
                <textarea
                  value={teachingExperience}
                  onChange={(event) => setTeachingExperience(event.target.value)}
                  maxLength={1000}
                  rows={4}
                  placeholder="List any formal or informal relevant experience."
                  className={textareaClass}
                />
                <CharacterCount value={teachingExperience} max={1000} />
              </Field>

              <Field
                label="Years of experience"
                description="Total years of relevant teaching or academic support experience."
              >
                <div className="relative max-w-[12rem]">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={yearsExperience}
                    onChange={(event) => setYearsExperience(event.target.value)}
                    placeholder="0"
                    className={`${inputClass} pr-14`}
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                    <span className="text-xs font-semibold text-[#8a817a]">years</span>
                  </div>
                </div>
              </Field>
            </div>
          </section>

          {/* Card 2: Visibility Settings */}
          <section className="overflow-hidden rounded-2xl border border-[#e2d9d0] bg-white shadow-sm transition hover:shadow-md">
            <div className="border-b border-[#e2d9d0]/70 bg-[#faf8f6] px-6 py-5 sm:px-8">
              <h2 className="text-base font-bold text-[#241f1c]">
                Profile visibility
              </h2>
              <p className="mt-1 text-xs text-[#6b625c]">
                Control who can discover your Academic Mate profile.
              </p>
            </div>

            <div className="grid gap-3 px-6 py-6 sm:px-8">
              {visibilityOptions.map((option) => {
                const isSelected = profileVisibility === option.value;
                return (
                  <label
                    key={option.value}
                    className={`relative flex cursor-pointer rounded-xl border p-4 transition-all focus-within:ring-2 focus-within:ring-[#7d1f2a]/20 ${
                      isSelected
                        ? "border-[#7d1f2a] bg-[#f6f1ec]/60 ring-1 ring-[#7d1f2a]"
                        : "border-[#e2d9d0] bg-white hover:border-[#cbbfb4] hover:bg-[#faf8f6]"
                    }`}
                  >
                    <div className="mt-0.5 flex h-5 w-5 items-center justify-center">
                      <input
                        type="radio"
                        name="profileVisibility"
                        value={option.value}
                        checked={isSelected}
                        onChange={() => setProfileVisibility(option.value)}
                        className="h-4 w-4 accent-[#7d1f2a] focus:ring-[#7d1f2a]"
                      />
                    </div>
                    <div className="ml-4 flex flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        {option.icon(
                          `h-4 w-4 ${isSelected ? "text-[#7d1f2a]" : "text-[#8a817a]"}`
                        )}
                        <span className="font-semibold text-[#241f1c]">
                          {option.label}
                        </span>
                      </div>
                      <span className="mt-1 text-xs leading-relaxed text-[#6b625c]">
                        {option.description}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Form Controls */}
          <div className="flex items-center justify-end gap-3 pt-2 pb-12">
            <Link
              href="/student/profile"
              className="rounded-xl border border-[#d8cec5] bg-white px-5 py-2.5 text-sm font-semibold text-[#4e4742] shadow-sm transition hover:bg-[#f6f1ec] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/20"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={creating || saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7d1f2a] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#681923] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {(creating || saving) && (
                <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {creating ? "Creating..." : saving ? "Saving..." : isEditing ? "Save changes" : "Become an Academic Mate"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

/* Helper Components */

function Field({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-[#302a26]">
        {label}
      </label>
      <p className="text-xs text-[#746b65]">
        {description}
      </p>
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

function StatusBadge({ label, value }: { label: string; value: string }) {
  const isPositive = value === "ACTIVE" || value === "VERIFIED";
  const isWarning = value === "PENDING" || value === "UNVERIFIED";

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2d9d0] bg-white px-3 py-1 text-xs font-semibold text-[#4e4742] shadow-xs">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isPositive ? "bg-emerald-500" : isWarning ? "bg-amber-500" : "bg-gray-400"
        }`}
      />
      <span>{label}:</span>
      <span className="font-bold text-[#241f1c]">{formatStatus(value)}</span>
    </span>
  );
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/* Shared Classes */

const inputClass =
  "block w-full rounded-xl border border-[#d8cec5] bg-white px-4 py-2.5 text-sm text-[#302a26] shadow-sm outline-none transition placeholder:text-[#9a918a] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/15";

const textareaClass =
  "block w-full resize-y rounded-xl border border-[#d8cec5] bg-white px-4 py-2.5 text-sm text-[#302a26] shadow-sm outline-none transition placeholder:text-[#9a918a] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/15";