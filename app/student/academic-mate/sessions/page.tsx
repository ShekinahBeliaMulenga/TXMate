"use client";

import { ProposalCard } from "./proposal-card";
import { useNow } from "./use-now";
import { useRescheduleProposals } from "./use-reschedule-proposals";

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 ${spinning ? "animate-spin motion-reduce:animate-none" : ""}`}
      aria-hidden="true"
    >
      <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" />
      <path d="M16.5 3.5v3.2h-3.2" />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-[#e8e0d9] bg-white p-3.5 motion-reduce:animate-none">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-[#efe9e3]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/3 rounded bg-[#efe9e3]" />
          <div className="h-2.5 w-1/2 rounded bg-[#f4f0ec]" />
        </div>
      </div>
      <div className="mt-3 h-14 rounded-md bg-[#f8f5f2]" />
    </div>
  );
}

export default function AcademicMateSessionManagementPage() {
  const { proposals, total, hasMore, phase, error, refresh, loadMore } = useRescheduleProposals();
  const now = useNow();

  const busy = phase !== "idle";
  const isInitialLoad = phase === "initial";
  const showEmptyState = !busy && !error && proposals.length === 0;

  return (
    <main className="min-h-screen bg-[#fcfbfa] text-[#282321]">
      <header className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-[#282321] sm:text-3xl">Reschedules</h1>
            <p className="mt-1.5 hidden text-sm leading-5 text-[#6d6260] sm:block">
              Respond to rescheduling proposals, including ones for cancelled occurrences of recurring sessions.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            aria-label="Refresh reschedules"
            title="Refresh"
            className="inline-flex shrink-0 items-center justify-center rounded-md p-2 text-[#625954] transition hover:bg-[#f8f5f2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:opacity-50"
          >
            <RefreshIcon spinning={phase === "refreshing"} />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 lg:px-8">
        <section aria-labelledby="rescheduling-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="rescheduling-heading" className="text-sm font-semibold">
              Needs your response
            </h2>
            {!isInitialLoad && (
              <span className="rounded-full bg-[#f3e4e2] px-2 py-0.5 text-[11px] font-semibold text-[#7d1f2a]">
                {total} pending
              </span>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={refresh}
                disabled={busy}
                className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
              >
                Try again
              </button>
            </div>
          )}

          {isInitialLoad && (
            <div className="mt-3 space-y-2.5" role="status" aria-busy="true">
              <span className="sr-only">Loading rescheduling requests…</span>
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {showEmptyState && (
            <div className="mt-3 rounded-lg border border-dashed border-[#dcd1c8] bg-white px-5 py-10 text-center">
              <h3 className="text-[13px] font-semibold">You’re all caught up</h3>
              <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-[#756b65]">
                When a student proposes a new time for a session, it will show up here, even if the original session is
                no longer in your upcoming schedule.
              </p>
            </div>
          )}

          {proposals.length > 0 && (
            <div className="mt-3 space-y-2.5">
              {proposals.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} now={now} />
              ))}
              {hasMore && (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={loadMore}
                    className="rounded-md border border-[#e1d8d0] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#625954] hover:bg-[#f8f5f2] disabled:opacity-50"
                  >
                    {phase === "more" ? "Loading…" : "Load more proposals"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
