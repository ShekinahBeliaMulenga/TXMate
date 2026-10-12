"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "UNVERIFIED";

type AcademicMateStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

type VerificationProfile = {
  id: string;
  status: AcademicMateStatus;
  verificationStatus: VerificationStatus;
  headline: string | null;
  bio: string | null;
  teachingExperience: string | null;
  yearsExperience: number | null;
  createdAt: string;
  updatedAt: string;

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
  };

  studentProfile: {
    id: string;
    studentId: string;
    status: string;
    programme: {
      id: string;
      code: string;
      name: string;
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
  } | null;

  offerings: Array<{
    id: string;
    courseId: string;
    title: string | null;
    description: string | null;
    rate: string | number;
    currency: string;
    sessionDurationMinutes: number;
    status: string;
    verificationStatus: VerificationStatus;
    course: {
      id: string;
      code: string;
      name: string;
    };
  }>;

  experiences: Array<{
    id: string;
    title: string;
    organisation: string | null;
    description: string | null;
    startYear: number | null;
    endYear: number | null;
  }>;

  qualifications: Array<{
    id: string;
    name: string;
    issuer: string | null;
    year: number | null;
    credentialUrl: string | null;
  }>;

  availabilities: Array<{
    id: string;
    day: string;
    startMinute: number;
    endMinute: number;
    timezone: string;
  }>;
};

type QueueResponse = {
  profiles: VerificationProfile[];
  total: number;
};

const statuses: Array<{
  value: VerificationStatus;
  label: string;
}> = [
  {
    value: "PENDING",
    label: "Pending",
  },
  {
    value: "VERIFIED",
    label: "Verified",
  },
  {
    value: "REJECTED",
    label: "Rejected",
  },
  {
    value: "UNVERIFIED",
    label: "Unverified",
  },
];

const statusClasses: Record<VerificationStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  VERIFIED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-red-50 text-red-800 ring-red-200",
  UNVERIFIED: "bg-stone-100 text-stone-700 ring-stone-200",
};

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name:
    | "shield"
    | "search"
    | "arrow"
    | "user"
    | "book"
    | "clock"
    | "refresh"
    | "alert"
    | "logout";
  className?: string;
}) {
  const paths = {
    shield:
      "M12 3 5.25 6v5.25c0 4.15 2.82 7.94 6.75 9 3.93-1.06 6.75-4.85 6.75-9V6L12 3Z",

    search: "m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",

    arrow: "M5 12h14m-6-6 6 6-6 6",

    user: "M15 19a6 6 0 0 0-12 0m6-8a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",

    book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5m0-15v15",

    clock: "M12 6v6l4 2m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",

    refresh:
      "M20 11a8 8 0 0 0-14.9-4M4 5v4h4m-4 1a8 8 0 0 0 14.9 4M20 19v-4h-4",

    alert:
      "M12 9v4m0 4h.01M10.3 4.5 2.2 18a2 2 0 0 0 1.73 3h16.14A2 2 0 0 0 21.8 18L13.7 4.5a2 2 0 0 0-3.4 0Z",

    logout:
      "M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9",
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatRelativeDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const difference = Date.now() - date.getTime();

  const minutes = Math.floor(difference / 60000);

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return formatDate(value);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "AM";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  const label = statuses.find((item) => item.value === status)?.label ?? status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusClasses[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function ProfileCard({ profile }: { profile: VerificationProfile }) {
  return (
    <Link
      href={`/admin/academic-mates/${profile.id}`}
      className="group block rounded-2xl border border-[#e2d9d0] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#cbbdb5] hover:shadow-[0_8px_24px_rgba(40,35,33,0.06)]"
    >
      <div className="flex items-start gap-4">
        {profile.user.image ? (
          <img
            src={profile.user.image}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f2e9e4] text-sm font-semibold text-[#7d1f2a]">
            {initials(profile.user.name)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-[#282321] group-hover:text-[#7d1f2a]">
                {profile.user.name}
              </h2>

              <p className="mt-0.5 truncate text-xs text-[#8a7f7a]">
                {profile.user.email}
              </p>
            </div>

            <StatusBadge status={profile.verificationStatus} />
          </div>

          <p className="mt-3 text-sm font-medium text-[#3f3734]">
            {profile.headline || "Academic support profile"}
          </p>

          <div className="mt-3 grid gap-2 text-xs text-[#6d6260] sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <Icon
                name="shield"
                className="h-3.5 w-3.5 shrink-0 text-[#7d1f2a]"
              />

              <span className="truncate">{profile.university.name}</span>
            </div>

            {profile.studentProfile?.programme.department && (
              <div className="flex items-center gap-2">
                <Icon name="book" className="h-3.5 w-3.5 shrink-0 text-[#7d1f2a]" />
                <span className="truncate">
                  {profile.studentProfile.programme.department.name}
                </span>
              </div>
            )}

            {profile.studentProfile ? (
              <div className="flex items-center gap-2">
                <Icon
                  name="book"
                  className="h-3.5 w-3.5 shrink-0 text-[#7d1f2a]"
                />

                <span className="truncate">
                  {profile.studentProfile.programme.name}
                  {" · Year "}
                  {profile.studentProfile.programmeYear.yearNumber}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#eee7df] pt-4 text-xs text-[#8a7f7a]">
            <span>
              {profile.offerings.length}{" "}
              {profile.offerings.length === 1 ? "offering" : "offerings"}
            </span>

            <span>
              {profile.experiences.length} experience{" "}
              {profile.experiences.length === 1 ? "entry" : "entries"}
            </span>

            <span>
              {profile.qualifications.length}{" "}
              {profile.qualifications.length === 1
                ? "qualification"
                : "qualifications"}
            </span>

            <span className="ml-auto">
              {formatRelativeDate(profile.updatedAt)}
            </span>
          </div>
        </div>

        <Icon
          name="arrow"
          className="mt-1 hidden h-4 w-4 shrink-0 text-[#b3a7a1] transition group-hover:translate-x-0.5 group-hover:text-[#7d1f2a] sm:block"
        />
      </div>
    </Link>
  );
}

export default function AdminAcademicMatesPage() {
  const router = useRouter();

  const [status, setStatus] = useState<VerificationStatus>("PENDING");

  const [profiles, setProfiles] = useState<VerificationProfile[]>([]);

  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const loadProfiles = useCallback(
    async (showRefresh = false) => {
      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const response = await fetch(
          `/api/admin/academic-mates/verification?status=${status}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
            cache: "no-store",
          }
        );

        const body = (await response.json()) as
          | QueueResponse
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Unable to load Academic Mate verification queue."
          );
        }

        if (
          !("profiles" in body) ||
          !Array.isArray(body.profiles) ||
          typeof body.total !== "number"
        ) {
          throw new Error(
            "The verification service returned an invalid response."
          );
        }

        setProfiles(body.profiles);
        setTotal(body.total);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load Academic Mate verification queue."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [status]
  );

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const filteredProfiles = profiles.filter((profile) => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return [
      profile.user.name,
      profile.user.email,
      profile.university.name,
      profile.university.code,
      profile.headline ?? "",
      profile.studentProfile?.programme.department?.name ?? "",
      profile.studentProfile?.programme.department?.code ?? "",
      profile.studentProfile?.programme.name ?? "",
      profile.studentProfile?.programme.code ?? "",
      
    ].some((value) => value.toLowerCase().includes(query));
  });

  return (
    <main className="min-h-screen bg-[#f4f1ed] antialiased">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* HEADER */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#7d1f2a]">
              <Icon name="shield" className="h-4 w-4" />
              Administration
            </div>

            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#241f1c] sm:text-4xl">
              Academic Mate verification
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#625b55] sm:text-base">
              Review Academic Mate profiles submitted for verification and
              manage their verification status.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => void loadProfiles(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-[#d8cec6] bg-white px-4 py-2.5 text-sm font-semibold text-[#4e4541] transition hover:border-[#bcaea6] hover:bg-[#faf8f6] disabled:cursor-not-allowed disabled:opacity-60 lg:self-auto"
            >
              <Icon
                name="refresh"
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={() =>
                void authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => router.push("/login"),
                  },
                })
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#d8cec6] bg-white px-4 py-2.5 text-sm font-semibold text-[#7d1f2a] transition hover:border-[#bcaea6] hover:bg-[#faf8f6]"
            >
              <Icon name="logout" className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>

        {/* STATUS TABS */}
        <div className="mt-8 overflow-x-auto">
          <div className="flex min-w-max gap-1 rounded-xl border border-[#e2d9d0] bg-white p-1">
            {statuses.map((item) => {
              const active = status === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setStatus(item.value)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-[#7d1f2a] text-white"
                      : "text-[#6d6260] hover:bg-[#f6f1ec] hover:text-[#282321]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b8f89]"
            />

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, university, department or programme"
              className="w-full rounded-lg border border-[#d8cec6] bg-white py-2.5 pl-10 pr-4 text-sm text-[#282321] outline-none placeholder:text-[#a39892] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10"
            />
          </div>

          <p className="text-xs text-[#8a7f7a]">
            {filteredProfiles.length} of {total}{" "}
            {total === 1 ? "profile" : "profiles"}
          </p>
        </div>

        {/* ERROR */}
        {error ? (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800"
          >
            <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />

            <div>
              <p className="font-semibold">Unable to load the queue</p>

              <p className="mt-1">{error}</p>
            </div>
          </div>
        ) : null}

        {/* CONTENT */}
        <div className="mt-6">
          {loading ? (
            <div className="space-y-4">
              {Array.from({
                length: 4,
              }).map((_, index) => (
                <div
                  key={index}
                  className="h-36 animate-pulse rounded-2xl border border-[#e2d9d0] bg-white"
                />
              ))}
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="rounded-2xl border border-[#e2d9d0] bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f6f1ec] text-[#7d1f2a]">
                <Icon name="shield" className="h-6 w-6" />
              </div>

              <h2 className="mt-5 text-lg font-semibold text-[#282321]">
                {search
                  ? "No matching profiles"
                  : `No ${statuses
                      .find((item) => item.value === status)
                      ?.label.toLowerCase()} Academic Mates`}
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#8a7f7a]">
                {search
                  ? "Try a different search term."
                  : status === "PENDING"
                  ? "Verification requests will appear here when Academic Mates submit their profiles for review."
                  : "There are currently no profiles in this verification category."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProfiles.map((profile) => (
                <ProfileCard key={profile.id} profile={profile} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}