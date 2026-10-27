"use client";

import { useState } from "react";
import { answerChangeTimeLeftMs, answerChangesLeft, availableActions, nextAction } from "@/lib/session-lifecycle-rules";
import { snapshotOf } from "@/lib/session-lifecycle-serialize";
import type { SessionLifecycleItem } from "@/lib/session-lifecycle-types";
import {
  CancellationNote, ChangeAnswer, CheckIcon, DateBlock, FlowTracker, Glyph, IconButton, PrimaryButton, ResolutionChip, SecondaryButton, TimeChip,
  flowOf, formatRange, isClosed, postJson, resolutionOf, sessionActionUrl, tabOf,
} from "./session-ui";

/** Compact buttons: the card already shows the question, so the buttons only need to be tappable, not big. */
const SMALL_BTN = "min-h-8! px-3! text-xs!";

/**
 * One session. The next thing the viewer can do sits right on the card, so the common
 * case (confirm attendance, confirm completion) is a single tap. Tapping the card opens
 * the details as a pop-up. Layout: header, one chip row (with the chat button at its end),
 * and an optional body that only exists when there is something to say or do.
 */
export default function SessionCard({ session, now, onOpen, onChanged }: { session: SessionLifecycleItem; now: number; onOpen: (sessionId: string) => void; onChanged: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const snapshot = snapshotOf(session);
  const role = session.viewerRole;
  const actions = availableActions(snapshot, role, now);
  const next = nextAction(snapshot, role, now);
  const resolution = resolutionOf(session, now);
  const flow = flowOf(session, now);
  const closed = isClosed(session);
  const changesLeft = answerChangesLeft(snapshot);
  const who = role === "STUDENT" ? "with" : "Student:";

  async function send(payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setMessage(null);
    const result = await postJson(sessionActionUrl(session.id), payload);
    setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
    setBusy(false);
    try { await onChanged(); } catch { /* the message above stays visible */ }
  }

  return (
    <article className={`rounded-xl border bg-white shadow-[0_1px_2px_rgba(40,35,33,0.04)] ${actions.attendance || actions.completion ? "border-[#e2c9c5]" : "border-[#e8e0d9]"}`}>
      <button type="button" onClick={() => onOpen(session.id)} aria-label={`Open ${session.course.name} session details`} className="flex w-full items-start gap-2.5 rounded-t-xl p-3 pb-2 text-left transition hover:bg-[#fdfbfa] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7d1f2a]/40">
        <DateBlock iso={session.scheduledStart} muted={closed} />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[13px] font-semibold leading-4 text-[#282321]">{session.course.name}</span>
          <span className="mt-0.5 block text-[11px] leading-4 text-[#81766f]">{session.course.code} · {who} {session.otherParticipantName}</span>
          <span className="block text-[11px] leading-4 tabular-nums text-[#625954]">{formatRange(session.scheduledStart, session.scheduledEnd)}{session.meetingLocation ? ` · ${session.meetingLocation}` : ""}</span>
        </span>
        <span className="mt-0.5 text-[#c9bdb5]"><Glyph name="chevronRight" className="h-4 w-4" /></span>
      </button>

      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
        {!closed && <TimeChip status={tabOf(session, now)} />}
        <ResolutionChip status={resolution} />
        {session.arrangementType === "RECURRING" && <span className="inline-flex items-center rounded-full bg-[#f4f0ec] px-2 py-px text-[10px] font-medium text-[#6f655f]">Weekly</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {!closed && <FlowTracker attendance={flow.attendance} completion={flow.completion} />}
          <IconButton icon="chat" label="Open chat" href={session.conversationUrl} className="h-8! w-8!" />
        </span>
      </div>

      {/* Only takes up space when something is shown. */}
      <div className="space-y-2 px-3 pb-3 empty:hidden">
        {resolution === "CANCELLED" && <CancellationNote info={session.cancellation} />}
        {message && <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-lg px-2.5 py-1.5 text-xs leading-4 ${message.tone === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{message.text}</p>}

        {actions.attendance && (
          <div className="flex items-center gap-2 rounded-lg bg-[#fdf6f3] p-2">
            <p className="min-w-0 flex-1 text-xs font-semibold leading-4 text-[#3a2b28]">{role === "STUDENT" ? "Did you attend?" : "Did the student attend?"}</p>
            <div className="flex shrink-0 gap-1.5">
              <PrimaryButton className={SMALL_BTN} disabled={busy} onClick={() => void send({ type: "ATTENDANCE", attended: true })}><CheckIcon />Yes</PrimaryButton>
              <SecondaryButton className={SMALL_BTN} disabled={busy} onClick={() => void send({ type: "ATTENDANCE", attended: false })}><Glyph name="x" className="h-3.5 w-3.5" />No</SecondaryButton>
            </div>
          </div>
        )}
        {!actions.attendance && actions.completion && (
          <div className="flex items-center gap-2 rounded-lg bg-[#fdf6f3] p-2">
            <p className="min-w-0 flex-1 text-xs font-semibold leading-4 text-[#3a2b28]">Did this session go ahead as planned?</p>
            <div className="flex shrink-0 gap-1.5">
              <PrimaryButton className={SMALL_BTN} disabled={busy} onClick={() => void send({ type: "COMPLETION", action: "CONFIRM" })}><CheckIcon />Confirm</PrimaryButton>
              <IconButton icon="flag" label="Report a problem" onClick={() => onOpen(session.id)} className="h-8! w-8! border border-[#ded4cd] bg-white" />
            </div>
          </div>
        )}
        {!actions.attendance && !actions.completion && next.hint && !closed && (
          <p className="flex items-start gap-1.5 text-[11px] leading-4 text-[#756b65]"><Glyph name="clock" className="mt-px h-3 w-3 shrink-0" />{next.hint}</p>
        )}
        {actions.changeAttendance && (
          <ChangeAnswer saidYes={Boolean(session.attendance?.studentAttended)} busy={busy} changesLeft={changesLeft} msLeft={answerChangeTimeLeftMs(snapshot, now)} onConfirm={() => send({ type: "ATTENDANCE", attended: !session.attendance?.studentAttended })} />
        )}
      </div>
    </article>
  );
}