"use client";

import { availableActions } from "@/lib/session-lifecycle-rules";
import { snapshotOf } from "@/lib/session-lifecycle-serialize";
import type { SessionLifecycleItem } from "@/lib/session-lifecycle-types";
import { DateBlock, Glyph, PrimaryButton, ResolutionChip, TimeChip, formatRange, resolutionOf, tabOf } from "./session-ui";

/** An Academic Mate's slot with several students: one card, one list, one confirmation. */
export default function GroupCard({ groupId, sessions, now, onOpen }: { groupId: string; sessions: SessionLifecycleItem[]; now: number; onOpen: (groupId: string) => void }) {
  const first = sessions[0];
  const count = sessions.length;
  const ready = sessions.filter((s) => availableActions(snapshotOf(s), "ACADEMIC_MATE", now).attendance).length;
  const readyForCompletion = sessions.filter((s) => availableActions(snapshotOf(s), "ACADEMIC_MATE", now).completion).length;
  const studentsAnswered = sessions.filter((s) => s.attendance?.studentAttended !== null && s.attendance?.studentAttended !== undefined).length;
  const reviewCount = sessions.filter((s) => resolutionOf(s, now) === "NEEDS_REVIEW").length;
  const resolutions = new Set(sessions.map((s) => resolutionOf(s, now)));
  const headline = reviewCount > 0 && reviewCount === count ? "NEEDS_REVIEW" : resolutions.has("AWAITING_CONFIRMATION") ? "AWAITING_CONFIRMATION" : "NONE";

  const action = ready > 0
    ? { label: `Confirm attendance (${ready})`, hint: `${studentsAnswered} of ${count} have answered.` }
    : readyForCompletion > 0
      ? { label: `Confirm completion (${readyForCompletion})`, hint: "One tap confirms the group." }
      : null;

  return (
    <article className={`rounded-2xl border bg-white shadow-[0_1px_2px_rgba(40,35,33,0.04)] ${action ? "border-[#e2c9c5]" : "border-[#e8e0d9]"}`}>
      <button type="button" onClick={() => onOpen(groupId)} aria-label={`Open the ${first.course.name} attendance list`} className="flex w-full items-start gap-3 rounded-t-2xl p-4 pb-3 text-left transition hover:bg-[#fdfbfa] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7d1f2a]/40">
        <DateBlock iso={first.scheduledStart} />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[15px] font-semibold leading-5 text-[#282321]">{first.course.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-[#81766f]">{first.course.code} · <Glyph name="users" className="h-3.5 w-3.5" />{count}</span>
          <span className="mt-1.5 block text-xs tabular-nums text-[#625954]">{formatRange(first.scheduledStart, first.scheduledEnd)}{first.meetingLocation ? ` · ${first.meetingLocation}` : ""}</span>
        </span>
        <span className="mt-1 text-[#c9bdb5]"><Glyph name="chevronRight" className="h-5 w-5" /></span>
      </button>
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        <TimeChip status={tabOf(first, now)} />
        <ResolutionChip status={headline} />
        {reviewCount > 0 && reviewCount < count && <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-800 ring-1 ring-inset ring-red-200">{reviewCount} need review</span>}
      </div>
      {action && (
        <div className="mx-4 mb-4 flex items-center gap-3 rounded-xl bg-[#fdf6f3] p-3">
          <p className="min-w-0 flex-1 text-xs leading-5 text-[#756b65]">{action.hint}</p>
          <PrimaryButton onClick={() => onOpen(groupId)} className="shrink-0">{action.label}</PrimaryButton>
        </div>
      )}
    </article>
  );
}
