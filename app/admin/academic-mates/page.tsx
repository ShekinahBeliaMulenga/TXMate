"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import AdminPage from "@/components/admin/admin-page";
import { GhostButton, SearchField, Tabs } from "@/components/admin/admin-controls";
import { Badge, EmptyState, Panel, TABLE } from "@/components/admin/admin-ui";
import Link from "next/link";

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
  verificationSubmittedAt: string

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

const STATUS_TONE: Record<VerificationStatus, "warning" | "success" | "danger" | "neutral"> = {
  PENDING: "warning",
  VERIFIED: "success",
  REJECTED: "danger",
  UNVERIFIED: "neutral",
};

function StatusBadge({ status }: { status: VerificationStatus }) {
  const label = statuses.find((item) => item.value === status)?.label ?? status;
  return <Badge tone={STATUS_TONE[status]}>{label}</Badge>;
}

export default function AdminAcademicMatesPage() {

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
    void loadProfiles(); // eslint-disable-line react-hooks/set-state-in-effect
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
    <AdminPage
      title="Academic Mate verification"
      description="Review profiles submitted for verification and manage their status."
      actions={
        <GhostButton onClick={() => void loadProfiles(true)} disabled={refreshing}>
          <Icon name="refresh" className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </GhostButton>
      }
    >
      <Tabs tabs={statuses.map((item) => ({ id: item.value, label: item.label }))} value={status} onChange={setStatus} label="Verification status" />

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchField value={search} onChange={setSearch} placeholder="Search name, email, university or programme" label="Search profiles" />
        <p className="text-xs text-[#7a716a]">{filteredProfiles.length} of {total} {total === 1 ? "profile" : "profiles"}</p>
      </div>

      {error ? (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-md border border-[#f0c9c9] bg-[#fdf3f3] px-4 py-3 text-sm text-[#8f2323]">
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Unable to load the queue</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      ) : null}

      <Panel className="mt-4">
        {loading ? (
          <div aria-busy="true">{[0, 1, 2, 3].map((n) => <div key={n} className="h-16 animate-pulse border-b border-[#eee9e3] bg-[#faf9f7]" />)}</div>
        ) : filteredProfiles.length === 0 ? (
          <EmptyState
            icon="shield"
            title={search ? "No matching profiles" : `No ${statuses.find((item) => item.value === status)?.label.toLowerCase()} Academic Mates`}
            hint={search ? "Try a different search term." : status === "PENDING" ? "Verification requests appear here when Academic Mates submit their profiles." : "There are no profiles in this category."}
          />
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead>
                <tr>
                  <th className={TABLE.th}>Applicant</th>
                  <th className={`${TABLE.th} ${TABLE.hide}`}>University &amp; programme</th>
                  <th className={`${TABLE.th} ${TABLE.hideSm}`}>Profile</th>
                  <th className={TABLE.th}>Status</th>
                  <th className={`${TABLE.th} text-right`}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => (
                  <tr key={profile.id} className={TABLE.row}>
                    <td className={TABLE.td}>
                      <Link href={`/admin/academic-mates/${profile.id}`} className="flex items-center gap-3">
                        {profile.user.image ? (
                          <Image src={profile.user.image} alt="" width={36} height={36} unoptimized className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1ece7] text-xs font-semibold text-[#7d1f2a]">{initials(profile.user.name)}</span>
                        )}
                        <span className="min-w-0">
                          <span className="block break-words font-medium hover:text-[#7d1f2a] hover:underline">{profile.user.name}</span>
                          <span className="block break-words text-[13px] text-[#6b635d]">{profile.user.email}</span>
                          <span className="block text-[13px] text-[#6b635d] md:hidden">{profile.university.code}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={`${TABLE.td} ${TABLE.hide}`}>
                      <p className="text-[#1f1a17]">{profile.university.name}</p>
                      {profile.studentProfile ? <p className="text-[13px] text-[#6b635d]">{profile.studentProfile.programme.name} · Year {profile.studentProfile.programmeYear.yearNumber}</p> : null}
                    </td>
                    <td className={`${TABLE.td} ${TABLE.hideSm} text-[13px] text-[#6b635d]`}>
                      {profile.offerings.length} {profile.offerings.length === 1 ? "course" : "courses"} · {profile.experiences.length} exp. · {profile.qualifications.length} qual.
                    </td>
                    <td className={TABLE.td}><StatusBadge status={profile.verificationStatus} /></td>
                    <td className={`${TABLE.td} whitespace-nowrap text-right text-[13px] text-[#6b635d]`}>{formatRelativeDate(profile.verificationSubmittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AdminPage>
  );
}
