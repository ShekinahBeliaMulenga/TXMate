import { memo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  formatDate,
  formatDuration,
  formatFull,
  formatTimeRange,
  getDeadline,
  getInitials,
  humanize,
  type DeadlineTone,
} from "./format";
import type { Proposal } from "./types";

const DEADLINE_STYLES: Record<DeadlineTone, string> = {
  overdue: "bg-red-50 text-red-800 ring-red-200",
  urgent: "bg-amber-50 text-amber-900 ring-amber-200",
  normal: "bg-[#f4f0ec] text-[#625954] ring-[#e8e0d9]",
};

const AVATAR_SIZE = 36;

function Avatar({ name, image }: { name: string; image: string | null }) {
  const [failed, setFailed] = useState(false);

  if (image && !failed) {
    return (
      <Image
        src={image}
        alt=""
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
        unoptimized
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[#e8e0d9]"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3e4e2] text-xs font-semibold text-[#7d1f2a]"
    >
      {getInitials(name)}
    </span>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[#82776f]">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-[#282321]">{children}</dd>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 rotate-90 sm:rotate-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />
    </svg>
  );
}

type ProposalCardProps = {
  proposal: Proposal;
  /** Current time in epoch ms, used for the deadline label. */
  now: number;
};

export const ProposalCard = memo(function ProposalCard({ proposal, now }: ProposalCardProps) {
  const { session } = proposal;
  const deadline = getDeadline(session.scheduledStart, now);
  const duration = formatDuration(session.scheduledStart, session.scheduledEnd);
  const proposedBy = proposal.proposedByName || session.studentName;
  const respondBy = formatFull(session.scheduledStart);

  return (
    <article className="rounded-lg border border-[#e8e0d9] bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={session.studentName} image={session.studentImage} />
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-semibold leading-5">{session.studentName}</h3>
            <p className="truncate text-xs leading-4 text-[#756b65]">
              <span className="font-medium text-[#282321]">{session.courseCode}</span> {session.courseName}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
          <span className="rounded-full bg-[#f4f0ec] px-2 py-0.5 text-[11px] font-medium text-[#625954] ring-1 ring-inset ring-[#e8e0d9]">
            {session.arrangementType === "RECURRING" ? "Recurring" : "One-time"}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${DEADLINE_STYLES[deadline.tone]}`}
            title={`Respond before ${respondBy}`}
          >
            {deadline.label}
          </span>
        </div>
      </div>

      <div className="mt-3 grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-md bg-[#f8f5f2] px-3 py-2">
          <p className="text-[11px] text-[#82776f]">Current time</p>
          <p className="mt-0.5 text-[13px] font-medium text-[#625954] line-through decoration-[#b9aea6]">
            {formatDate(session.scheduledStart)}
          </p>
          <p className="text-xs text-[#82776f]">{formatTimeRange(session.scheduledStart, session.scheduledEnd)}</p>
        </div>

        <div className="flex items-center justify-center text-[#b9aea6]">
          <ArrowIcon />
        </div>

        <div className="rounded-md border border-[#e5c6c2] bg-[#fff9f8] px-3 py-2">
          <p className="text-[11px] text-[#7d1f2a]">Proposed time</p>
          <p className="mt-0.5 text-[13px] font-semibold">{formatDate(proposal.proposedStart)}</p>
          <p className="text-xs text-[#625954]">{formatTimeRange(proposal.proposedStart, proposal.proposedEnd)}</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <Detail label="Location">
          <span title={session.meetingLocation}>{session.meetingLocation || "Not set"}</span>
        </Detail>
        <Detail label="Duration">{duration ?? "—"}</Detail>
        <Detail label="Session status">{humanize(session.status)}</Detail>
        <Detail label="Requested">{formatDate(proposal.createdAt)}</Detail>
      </dl>

      {proposal.reason && (
        <p className="mt-3 whitespace-pre-wrap break-words rounded-md border-l-2 border-[#e5c6c2] bg-[#faf7f5] px-3 py-2 text-xs leading-5 text-[#625954]">
          <span className="font-semibold text-[#282321]">Reason: </span>
          {proposal.reason}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f0eae4] pt-3">
        <p className="text-[11px] leading-4 text-[#82776f]">
          Proposed by <span className="font-medium text-[#625954]">{proposedBy}</span>
          <span className="mx-1.5 text-[#d3c9c1]" aria-hidden="true">
            |
          </span>
          Respond before {respondBy}
        </p>
        <Link
          href={`/student/sessions/${encodeURIComponent(proposal.sessionId)}/conversation`}
          className="inline-flex min-h-8 items-center justify-center rounded-md bg-[#7d1f2a] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2"
        >
          Review and respond
        </Link>
      </div>
    </article>
  );
});
