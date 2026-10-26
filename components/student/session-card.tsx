"use client";

import { useState } from "react";
import { answerChangeTimeLeftMs, answerChangesLeft, availableActions, nextAction } from "@/lib/session-lifecycle-rules";
import { snapshotOf } from "@/lib/session-lifecycle-serialize";
import type { SessionLifecycleItem } from "@/lib/session-lifecycle-types";
import {
  CancellationNote, ChangeAnswer, CheckIcon, DateBlock, FlowTracker, Glyph, IconButton, PrimaryButton, ResolutionChip, SecondaryButton, TimeChip,
  flowOf, formatRange, isClosed, postJson, resolutionOf, sessionActionUrl, tabOf,
} from "./session-ui";

/**
 * One session. The next thing the viewer can do sits right on the card, so the common
 * case (confirm attendance, confirm completion) is a single tap. Tapping the card opens
 * the details as a pop-up.
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
    <article className={`rounded-2xl border bg-white shadow-[0_1px_2px_rgba(40,35,33,0.04)] ${actions.attendance || actions.completion ? "border-[#e2c9c5]" : "border-[#e8e0d9]"}`}>
      <button type="button" onClick={() => onOpen(session.id)} aria-label={`Open ${session.course.name} session details`} className="flex w-full items-start gap-3 rounded-t-2xl p-4 pb-3 text-left transition hover:bg-[#fdfbfa] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7d1f2a]/40">
        <DateBlock iso={session.scheduledStart} muted={closed} />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-semibold leading-5 text-[#282321]">{session.course.name}</span>
          <span className="mt-0.5 block text-[11px] text-[#81766f]">{session.course.code} · {who} {session.otherParticipantName}</span>
          <span className="mt-1 block text-[11px] tabular-nums text-[#625954]">{formatRange(session.scheduledStart, session.scheduledEnd)}{session.meetingLocation ? ` · ${session.meetingLocation}` : ""}</span>
        </span>
        <span className="mt-1 text-[#c9bdb5]"><Glyph name="chevronRight" className="h-5 w-5" /></span>
      </button>

      <div className="flex flex-wrap items-center gap-1.5 px-4">
        {!closed && <TimeChip status={tabOf(session, now)} />}
        <ResolutionChip status={resolution} />
        {session.arrangementType === "RECURRING" && <span className="inline-flex items-center rounded-full bg-[#f4f0ec] px-2.5 py-0.5 text-[11px] font-medium text-[#6f655f]">Weekly</span>}
        {!closed && <span className="ml-auto"><FlowTracker attendance={flow.attendance} completion={flow.completion} /></span>}
      </div>

      <div className="px-4 pb-3">
        {resolution === "CANCELLED" && <CancellationNote info={session.cancellation} className="mt-2" />}
        {message && <p role={message.tone === "error" ? "alert" : "status"} className={`mt-3 rounded-lg px-3 py-2 text-xs leading-5 ${message.tone === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{message.text}</p>}

        {actions.attendance && (
          <div className="mt-3 rounded-xl bg-[#fdf6f3] p-3">
            <p className="text-[13px] font-semibold text-[#3a2b28]">{role === "STUDENT" ? "Did you attend?" : "Did the student attend?"}</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <PrimaryButton disabled={busy} onClick={() => void send({ type: "ATTENDANCE", attended: true })}><CheckIcon />Yes</PrimaryButton>
              <SecondaryButton disabled={busy} onClick={() => void send({ type: "ATTENDANCE", attended: false })}><Glyph name="x" className="h-4 w-4" />No</SecondaryButton>
            </div>
          </div>
        )}
        {!actions.attendance && actions.completion && (
          <div className="mt-3 rounded-xl bg-[#fdf6f3] p-3">
            <p className="text-[13px] font-semibold text-[#3a2b28]">Did this session go ahead as planned?</p>
            <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
              <PrimaryButton disabled={busy} onClick={() => void send({ type: "COMPLETION", action: "CONFIRM" })}><CheckIcon />Yes, confirm</PrimaryButton>
              <IconButton icon="flag" label="Report a problem" onClick={() => onOpen(session.id)} className="border border-[#ded4cd] bg-white" />
            </div>
          </div>
        )}
        {!actions.attendance && !actions.completion && next.hint && !closed && (
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-[#756b65]"><Glyph name="clock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{next.hint}</p>
        )}
        {actions.changeAttendance && (
          <div className="mt-3">
            <ChangeAnswer saidYes={Boolean(session.attendance?.studentAttended)} busy={busy} changesLeft={changesLeft} msLeft={answerChangeTimeLeftMs(snapshot, now)} onConfirm={() => send({ type: "ATTENDANCE", attended: !session.attendance?.studentAttended })} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-end border-t border-[#f1eae5] px-2 py-1">
        <IconButton icon="chat" label="Open chat" href={session.conversationUrl} />
      </div>
    </article>
  );
}
