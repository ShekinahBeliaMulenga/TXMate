"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

type AcademicMateStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

type VerificationResponse = {
  profile: {
    id: string;
    status: AcademicMateStatus;
    verificationStatus: VerificationStatus;
    headline: string | null;
    bio: string | null;
    teachingExperience: string | null;
    yearsExperience: number | null;
    verifiedAt: string | null;
    createdAt: string;
  };

  student: {
    id: string;
    status: string;
    university: {
      id: string;
      code: string;
      name: string;
    };
    programme: {
      id: string;
      code: string;
      name: string;
    };
    programmeYear: {
      id: string;
      yearNumber: number;
    };
  } | null;

  counts: {
    activeOfferings: number;
    experiences: number;
    qualifications: number;
  };

  readiness: {
    profile: boolean;
    studentProfile: boolean;
    academicBackground: boolean;
    offerings: boolean;
    readyForVerification: boolean;
  };

  history: Array<{
    id: string;
    status: VerificationStatus;
    notes: string | null;
    reviewedAt: string | null;
    createdAt: string;
    reviewedBy: string | null;
  }>;
};

const statusLabel: Record<VerificationStatus, string> = {
  UNVERIFIED: "Not verified",
  PENDING: "Under review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

const statusDescription: Record<VerificationStatus, string> = {
  UNVERIFIED:
    "Your Academic Mate profile has not been submitted for verification.",
  PENDING:
    "Your verification request has been submitted and is awaiting administrative review.",
  VERIFIED: "Your Academic Mate profile has been verified by TXMate.",
  REJECTED:
    "Your previous verification request was not approved. Review the feedback below and make the necessary changes before submitting again.",
};

const historyStatusClasses: Record<VerificationStatus, string> = {
  UNVERIFIED: "bg-stone-100 text-stone-700",
  PENDING: "bg-amber-50 text-amber-800",
  VERIFIED: "bg-emerald-50 text-emerald-800",
  REJECTED: "bg-red-50 text-red-800",
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name:
    | "arrow"
    | "check"
    | "clock"
    | "shield"
    | "alert"
    | "book"
    | "user"
    | "history"
    | "pencil";
  className?: string;
}) {
  const paths = {
    arrow: "M5 12h14m-6-6 6 6-6 6",
    check: "m5 12 4 4L19 6",
    clock: "M12 6v6l4 2m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    shield:
      "M12 3 5.25 6v5.25c0 4.15 2.82 7.94 6.75 9 3.93-1.06 6.75-4.85 6.75-9V6L12 3Z",
    alert:
      "M12 9v4m0 4h.01M10.3 4.5 2.2 18a2 2 0 0 0 1.73 3h16.14A2 2 0 0 0 21.8 18L13.7 4.5a2 2 0 0 0-3.4 0Z",
    book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5m0-15v15m0-15A2.5 2.5 0 0 1 6.5 3",
    user: "M15 19a6 6 0 0 0-12 0m6-8a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm5-5h5m-2.5-2.5V6",
    history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5m4-1v5l3 2",
    pencil: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
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

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#e2d9d0] bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="border-b border-[#eee7df] px-5 py-4 sm:px-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[#282321]">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-[#8a7f7a]">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 mt-0.5">{action}</div> : null}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function ReadinessItem({
  label,
  complete,
}: {
  label: string;
  complete: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
          complete
            ? "bg-emerald-100 text-emerald-700"
            : "bg-stone-100 text-stone-500"
        }`}
      >
        <Icon name={complete ? "check" : "clock"} className="h-4 w-4" />
      </span>
      <span
        className={`text-sm ${
          complete ? "font-medium text-[#282321]" : "text-[#6d6260]"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export default function AcademicMateVerificationPage() {
  const [data, setData] = useState<VerificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Sleek Tab Navigation State
  const [activeView, setActiveView] = useState<"STATUS" | "HISTORY">("STATUS");

  async function loadVerification() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/student/academic-mate/verification", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      const body = (await response.json()) as
        | VerificationResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Unable to load verification information."
        );
      }

      if (
        !("profile" in body) ||
        !("readiness" in body) ||
        !("history" in body)
      ) {
        throw new Error(
          "The verification service returned an invalid response."
        );
      }

      setData(body);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load verification information."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadVerification();
  }, []);

  async function requestVerification() {
    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const response = await fetch("/api/student/academic-mate/verification", {
        method: "POST",
        headers: { Accept: "application/json" },
      });

      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          body.error ?? "Unable to submit your verification request."
        );
      }

      setSuccess(
        body.message ?? "Your verification request has been submitted."
      );
      await loadVerification();
      // Auto switch back to status to see the pending update
      setActiveView("STATUS");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to submit your verification request."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const latestRejection = useMemo(() => {
    if (!data) return null;
    return (
      data.history.find(
        (entry) => entry.status === "REJECTED" && Boolean(entry.notes)
      ) ?? null
    );
  }, [data]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f4f1ed] antialiased">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="h-4 w-32 animate-pulse rounded bg-[#e2d9d0]" />
          <div className="mt-5 h-9 w-72 animate-pulse rounded-lg bg-[#e2d9d0]" />
          <div className="mt-3 h-5 w-[34rem] max-w-full animate-pulse rounded bg-[#e2d9d0]" />
          <div className="mt-8 h-52 animate-pulse rounded-2xl border border-[#e2d9d0] bg-white" />
          <div className="mt-6 h-80 animate-pulse rounded-2xl border border-[#e2d9d0] bg-white" />
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="min-h-screen bg-[#f4f1ed] px-4 py-10 antialiased sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-[#e2d9d0] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-700">
            <Icon name="alert" className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-[#282321]">
            Unable to load verification
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#6d6260]">{error}</p>
          <button
            type="button"
            onClick={() => void loadVerification()}
            className="mt-6 rounded-lg bg-[#7d1f2a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#691923] shadow-sm hover:shadow"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { profile, student, counts, readiness, history } = data;
  const canRequest =
    (profile.verificationStatus === "UNVERIFIED" ||
      profile.verificationStatus === "REJECTED") &&
    readiness.readyForVerification;

  return (
    <main className="min-h-screen bg-[#f4f1ed] antialiased">
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        {/* HEADER */}
        <div className="mb-6">
          <div className="mt-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#7d1f2a]/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#7d1f2a]">
              <Icon name="shield" className="h-3.5 w-3.5" />
              Academic Mate
            </span>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#241f1c] sm:text-4xl">
              Verification
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#625b55] sm:text-base">
              Verification helps students identify Academic Mates whose academic
              identity and profile have been reviewed by TXMate.
            </p>
          </div>
        </div>

        {/* NOTIFICATIONS */}
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800 shadow-sm"
          >
            <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800 shadow-sm"
          >
            <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* SEGMENTED CONTROL NAVIGATION */}
        <div className="mx-auto mb-6 flex w-fit rounded-xl bg-[#e2d9d0]/40 p-1">
          <button
            onClick={() => setActiveView("STATUS")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
              activeView === "STATUS"
                ? "bg-white text-[#282321] shadow-sm ring-1 ring-black/5"
                : "text-[#6d6260] hover:text-[#282321] hover:bg-white/50"
            }`}
          >
            <Icon name="shield" className="h-4 w-4" />
            Current Status
          </button>
          <button
            onClick={() => setActiveView("HISTORY")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
              activeView === "HISTORY"
                ? "bg-white text-[#282321] shadow-sm ring-1 ring-black/5"
                : "text-[#6d6260] hover:text-[#282321] hover:bg-white/50"
            }`}
          >
            <Icon name="history" className="h-4 w-4" /> History
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* DYNAMIC MAIN CONTENT */}
          <div className="space-y-6">
            
            {activeView === "STATUS" ? (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                {/* CURRENT STATUS */}
                <section className="overflow-hidden rounded-2xl border border-[#e2d9d0] bg-white shadow-sm transition-shadow hover:shadow-md">
                  <div className="bg-[#7d1f2a] px-5 py-6 text-white sm:px-7">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                          Current status
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold">
                          {statusLabel[profile.verificationStatus]}
                        </h2>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">
                          {statusDescription[profile.verificationStatus]}
                        </p>
                      </div>

                      <div
                        className={`inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold ring-1 ring-inset shadow-sm ${
                          profile.verificationStatus === "VERIFIED"
                            ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                            : profile.verificationStatus === "REJECTED"
                            ? "bg-red-100 text-red-800 ring-red-200"
                            : profile.verificationStatus === "PENDING"
                            ? "bg-amber-100 text-amber-800 ring-amber-200"
                            : "bg-white/10 text-white ring-white/20"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {statusLabel[profile.verificationStatus]}
                      </div>
                    </div>
                  </div>

                  {profile.verificationStatus === "VERIFIED" && profile.verifiedAt && (
                    <div className="border-t border-[#eee7df] px-5 py-4 text-sm text-[#625b55] sm:px-7 bg-white/50">
                      Verified on{" "}
                      <span className="font-semibold text-[#282321]">
                        {formatDate(profile.verifiedAt)}
                      </span>
                      .
                    </div>
                  )}
                </section>

                {/* REJECTION FEEDBACK */}
                {profile.verificationStatus === "REJECTED" && latestRejection && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-5 sm:px-6 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 shadow-sm">
                        <Icon name="alert" className="h-4 w-4" />
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold text-red-900">
                          Review feedback
                        </h2>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-800">
                          {latestRejection.notes}
                        </p>
                        {latestRejection.reviewedAt && (
                          <p className="mt-2 text-xs text-red-700/80">
                            Reviewed {formatDateTime(latestRejection.reviewedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* READINESS */}
                <Section
                  title="Profile readiness"
                  subtitle="These are the basic requirements for submitting your profile for review."
                >
                  <div className="space-y-4">
                    <ReadinessItem label="Academic Mate profile completed" complete={readiness.profile} />
                    <ReadinessItem label="Linked active student profile" complete={readiness.studentProfile} />
                    <ReadinessItem label="University, programme and year available" complete={readiness.academicBackground} />
                    <ReadinessItem label="At least one active course offering" complete={readiness.offerings} />
                  </div>

                  {!readiness.readyForVerification && (
                    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm leading-6 text-amber-900 shadow-sm">
                      Complete the missing profile information before requesting verification.
                    </div>
                  )}
                </Section>

                {/* WHAT IS REVIEWED */}
                <Section
                  title="What will be reviewed"
                  subtitle="TXMate uses the information already provided in your Academic Mate profile."
                >
                  <div className="space-y-5">
                    {[
                      ["Academic identity", "Your linked university, programme and year of study."],
                      ["Academic Mate profile", "Your headline, bio and teaching experience."],
                      ["Courses supported", "The courses you have listed as Academic Mate offerings."],
                      ["Experience and qualifications", "Relevant information you have added to your profile."],
                    ].map(([title, description]) => (
                      <div key={title} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f6eaec] text-[#7d1f2a]">
                          <Icon name="check" className="h-4 w-4" />
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-[#282321]">{title}</h3>
                          <p className="mt-1 text-sm leading-6 text-[#6d6260]">{description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* HISTORY */}
                <Section
                  title="Verification history"
                  subtitle="A record of your Academic Mate verification requests and decisions."
                >
                  {history.length === 0 ? (
                    <div className="py-8 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f6f1ec] text-[#7d1f2a]">
                        <Icon name="history" className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-[#282321]">
                        No verification activity yet
                      </p>
                      <p className="mt-1 text-xs text-[#8a7f7a]">
                        Your requests and decisions will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#eee7df]">
                      {history.map((entry) => (
                        <article key={entry.id} className="py-5 first:pt-0 last:pb-0">
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm ${historyStatusClasses[entry.status]}`}
                            >
                              {entry.status === "VERIFIED" ? (
                                <Icon name="check" className="h-4 w-4" />
                              ) : entry.status === "PENDING" ? (
                                <Icon name="clock" className="h-4 w-4" />
                              ) : entry.status === "REJECTED" ? (
                                <Icon name="alert" className="h-4 w-4" />
                              ) : (
                                <Icon name="shield" className="h-4 w-4" />
                              )}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${historyStatusClasses[entry.status]}`}
                                >
                                  {statusLabel[entry.status]}
                                </span>
                                <span className="text-xs text-[#8a7f7a]">
                                  {formatDateTime(entry.createdAt)}
                                </span>
                              </div>
                              {entry.notes && (
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#514844] bg-[#f9f8f6] p-3 rounded-lg border border-[#e2d9d0]/50">
                                  {entry.notes}
                                </p>
                              )}
                              {entry.reviewedBy && (
                                <p className="mt-2 text-[11px] text-[#8a7f7a]">
                                  Reviewed by{" "}
                                  <span className="font-medium text-[#625b55]">
                                    {entry.reviewedBy}
                                  </span>
                                </p>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            )}
          </div>

          {/* SIDEBAR (Always Visible Context) */}
          <aside className="space-y-6">
            
            {/* ACTION */}
            <section className="rounded-2xl border border-[#e2d9d0] bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <h2 className="text-[15px] font-semibold text-[#282321]">
                Verification action
              </h2>
              {profile.verificationStatus === "PENDING" ? (
                <div className="mt-4 rounded-xl bg-amber-50 p-4 shadow-sm border border-amber-100">
                  <div className="flex items-start gap-3">
                    <Icon name="clock" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900">
                        Under review
                      </p>
                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        Your profile is currently awaiting administrative review.
                      </p>
                    </div>
                  </div>
                </div>
              ) : profile.verificationStatus === "VERIFIED" ? (
                <div className="mt-4 rounded-xl bg-emerald-50 p-4 shadow-sm border border-emerald-100">
                  <div className="flex items-start gap-3">
                    <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">
                        Profile verified
                      </p>
                      <p className="mt-1 text-xs leading-5 text-emerald-800">
                        Your Academic Mate profile has passed TXMate verification.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-3 text-sm leading-6 text-[#6d6260]">
                    Submit your completed Academic Mate profile for administrative review.
                  </p>
                  <button
                    type="button"
                    disabled={!canRequest || submitting}
                    onClick={() => void requestVerification()}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#7d1f2a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#691923] shadow-sm hover:shadow disabled:cursor-not-allowed disabled:bg-[#b9a6a2] disabled:shadow-none"
                  >
                    {submitting ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        Request verification
                        
                      </>
                    )}
                  </button>
                  {!readiness.readyForVerification && (
                    <p className="mt-3 text-center text-xs leading-5 text-[#8a7f7a]">
                      Complete your profile requirements before submitting.
                    </p>
                  )}
                </>
              )}
            </section>

            {/* ACADEMIC IDENTITY */}
            <Section title="Academic identity" subtitle="Information linked to your student profile.">
              {student ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Icon name="user" className="mt-0.5 h-4 w-4 shrink-0 text-[#7d1f2a]" />
                    <div>
                      <p className="text-[11px] text-[#8a7f7a]">Student profile</p>
                      <p className="mt-0.5 text-sm font-medium text-[#282321]">Active</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Icon name="book" className="mt-0.5 h-4 w-4 shrink-0 text-[#7d1f2a]" />
                    <div>
                      <p className="text-[11px] text-[#8a7f7a]">Programme</p>
                      <p className="mt-0.5 text-sm font-medium text-[#282321]">{student.programme.name}</p>
                      <p className="mt-0.5 text-xs text-[#8a7f7a]">
                        {student.programme.code} · Year {student.programmeYear.yearNumber}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-[#7d1f2a]" />
                    <div>
                      <p className="text-[11px] text-[#8a7f7a]">University</p>
                      <p className="mt-0.5 text-sm font-medium text-[#282321]">{student.university.name}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#8a7f7a]">
                  No student profile is linked to this Academic Mate account.
                </p>
              )}
            </Section>

            {/* PROFILE SUMMARY */}
            <Section 
              title="Academic Mate Profile Summary" 
              subtitle="Information currently available for review."
              action={
                <Link
                  href="/student/academic-mate/edit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#7d1f2a]/5 px-2.5 py-1.5 text-xs font-semibold text-[#7d1f2a] transition-colors hover:bg-[#7d1f2a]/10 hover:text-[#5c161f]"
                  title="Edit profile"
                >
                  <Icon name="pencil" className="h-3.5 w-3.5" />
                  Edit
                </Link>
              }
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-[#8a7f7a]">Active offerings</span>
                  <span className="text-sm font-semibold text-[#282321]">{counts.activeOfferings}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-[#8a7f7a]">Experience entries</span>
                  <span className="text-sm font-semibold text-[#282321]">{counts.experiences}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-[#8a7f7a]">Qualifications</span>
                  <span className="text-sm font-semibold text-[#282321]">{counts.qualifications}</span>
                </div>
              </div>
            </Section>
          </aside>
        </div>
      </div>
    </main>
  );
}