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
  const suggestionCount = sessions.filter((s) => s.suggestedLocation).length;
  const resolutions = new Set(sessions.map((s) => resolutionOf(s, now)));
  const headline = reviewCount > 0 && reviewCount === count ? "NEEDS_REVIEW" : resolutions.has("AWAITING_CONFIRMATION") ? "AWAITING_CONFIRMATION" : "NONE";

  const action = ready > 0
    ? { label: `Confirm attendance (${ready})`, hint: `${studentsAnswered} of ${count} have answered.` }
    : readyForCompletion > 0
      ? { label: `Confirm completion (${readyForCompletion})`, hint: "One tap confirms the group." }
      : null;

  return (
    <article className={`rounded-xl border bg-white shadow-[0_1px_2px_rgba(40,35,33,0.04)] ${action ? "border-[#e2c9c5]" : "border-[#e8e0d9]"}`}>
      <button type="button" onClick={() => onOpen(groupId)} aria-label={`Open the ${first.course.name} attendance list`} className="flex w-full items-start gap-2.5 rounded-t-xl p-3 pb-2 text-left transition hover:bg-[#fdfbfa] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7d1f2a]/40">
        <DateBlock iso={first.scheduledStart} />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[13px] font-semibold leading-4 text-[#282321]">{first.course.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-4 text-[#81766f]">{first.course.code} · <Glyph name="users" className="h-3 w-3" />{count}</span>
          <span className="block text-[11px] leading-4 tabular-nums text-[#625954]">{formatRange(first.scheduledStart, first.scheduledEnd)}{first.meetingLocation ? ` · ${first.meetingLocation}` : ""}</span>
        </span>
        <span className="mt-0.5 text-[#c9bdb5]"><Glyph name="chevronRight" className="h-4 w-4" /></span>
      </button>
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
        <TimeChip status={tabOf(first, now)} />
        <ResolutionChip status={headline} />
        {suggestionCount > 0 && <span className="inline-flex items-center rounded-full bg-[#fdf1ee] px-2 py-px text-[10px] font-semibold text-[#8a2630] ring-1 ring-inset ring-[#e2c9c5]">{suggestionCount === 1 ? "Venue suggestion" : `${suggestionCount} venue suggestions`}</span>}
        {reviewCount > 0 && reviewCount < count && <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-px text-[10px] font-semibold text-red-800 ring-1 ring-inset ring-red-200">{reviewCount} need review</span>}
      </div>
      {action && (
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg bg-[#fdf6f3] p-2">
          <p className="min-w-0 flex-1 text-[11px] leading-4 text-[#756b65]">{action.hint}</p>
          <PrimaryButton onClick={() => onOpen(groupId)} className="min-h-8! shrink-0 px-3! text-xs!">{action.label}</PrimaryButton>
        </div>
      )}
    </article>
  );
}