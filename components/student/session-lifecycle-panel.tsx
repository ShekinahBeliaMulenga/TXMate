"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  answerChangeTimeLeftMs,
  answerChangesLeft,
  attendanceOpensAt,
  attendanceOutcome,
  availableActions,
  completionDeadlineAt,
  nextAction,
  toMs,
} from "@/lib/session-lifecycle-rules";
import ReviewForm from "./review-form";
import { snapshotOf } from "@/lib/session-lifecycle-serialize";
import type { SessionLifecycleApiResponse, SessionLifecycleItem } from "@/lib/session-lifecycle-types";
import {
  CancellationNote, ChangeAnswer, CheckIcon, FlowTracker, Glyph, IconButton, PrimaryButton, ResolutionChip, SecondaryButton, TimeChip,
  flowOf, formatClock, formatDateLong, formatRange, isClosed, postJson, resolutionOf, sessionActionUrl, tabOf, useNow,
  type StepState,
} from "./session-ui";

function Step({ index, state, title, children }: { index: number; state: StepState; title: string; children: React.ReactNode }) {
  const tone = state === "done" ? "bg-emerald-100 text-emerald-800" : state === "problem" ? "bg-red-100 text-red-800" : state === "current" ? "bg-[#7d1f2a] text-white" : "bg-[#f0eae5] text-[#81766f]";
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone}`}>{state === "done" ? <CheckIcon className="h-3.5 w-3.5" /> : index}</span>
      <div className="min-w-0 flex-1 pb-1">
        <h3 className="text-sm font-semibold text-[#282321]">{title}</h3>
        <div className="mt-1.5 space-y-2.5 text-sm text-[#625954]">{children}</div>
      </div>
    </li>
  );
}

export default function SessionLifecyclePanel({ session, onUpdated, full = false }: { session: SessionLifecycleItem; onUpdated?: (updated?: SessionLifecycleItem) => void | Promise<void>; full?: boolean }) {
  const now = useNow(15_000);
  const [active, setActive] = useState(session);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const onUpdatedRef = useRef(onUpdated);

  useEffect(() => { onUpdatedRef.current = onUpdated; }, [onUpdated]);
  useEffect(() => { setActive(session); }, [session]);

  async function refresh() {
    try {
      const response = await fetch(sessionActionUrl(session.id), { cache: "no-store" });
      const body = await response.json() as SessionLifecycleApiResponse;
      if (response.ok && body.session) { setActive(body.session); return body.session; }
    } catch { /* keep what is on screen */ }
    return undefined;
  }
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible" && !busyRef.current) void refresh(); };
    const timer = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  async function send(payload: Record<string, unknown>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage(null);
    const result = await postJson(sessionActionUrl(active.id), payload);
    setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
    if (result.ok) { setReporting(false); setReason(""); }
    const fresh = await refresh();
    try { await onUpdatedRef.current?.(fresh); } catch { /* the result above stays visible */ }
    busyRef.current = false; setBusy(false);
  }

  const snapshot = useMemo(() => snapshotOf(active), [active]);
  const role = active.viewerRole;
  const actions = availableActions(snapshot, role, now);
  const next = nextAction(snapshot, role, now);
  const resolution = resolutionOf(active, now);
  const outcome = attendanceOutcome(snapshot);
  const closed = isClosed(active);
  const start = toMs(active.scheduledStart) ?? 0;
  const end = toMs(active.scheduledEnd) ?? 0;
  const att = active.attendance;
  const own = role === "STUDENT" ? att?.studentAttended ?? null : att?.mateConfirmedStudentAttended ?? null;
  const other = role === "STUDENT" ? att?.mateConfirmedStudentAttended ?? null : att?.studentAttended ?? null;
  const ownDone = role === "STUDENT" ? active.studentCompletionConfirmedAt : active.mateCompletionConfirmedAt;
  const otherDone = role === "STUDENT" ? active.mateCompletionConfirmedAt : active.studentCompletionConfirmedAt;
  const deadline = completionDeadlineAt(snapshot);
  const otherName = role === "STUDENT" ? active.academicMateName : active.studentName;
  const underReview = resolution === "NEEDS_REVIEW";

  const { attendance: attendanceState, completion: completionState } = flowOf(active, now);
  const changesLeft = answerChangesLeft(snapshot);

  return (
    <section aria-labelledby={`session-${active.id}`} className={`min-w-0 rounded-2xl border border-[#e8e0d9] bg-white ${full ? "p-4 sm:p-5" : "p-4"}`}>
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a2630]">{active.course.code}</p>
        <h2 id={`session-${active.id}`} className="mt-1 text-lg font-semibold leading-6">{active.course.name}</h2>
        <p className="mt-0.5 text-[13px] text-[#756b65]">{role === "STUDENT" ? "With" : "Student:"} {active.otherParticipantName}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {!closed && <TimeChip status={tabOf(active, now)} />}
          <ResolutionChip status={resolution} />
          <span className="ml-auto"><FlowTracker attendance={attendanceState} completion={completionState} /></span>
          {active.arrangementType === "RECURRING" && <span className="inline-flex items-center rounded-full bg-[#f4f0ec] px-2.5 py-0.5 text-[11px] font-medium text-[#6f655f]">Repeats weekly</span>}
        </div>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-[#f0e9e4] py-3 text-[13px]">
        <div className="col-span-2"><dt className="text-[11px] font-medium uppercase tracking-wide text-[#9a8e86]">When</dt><dd className="mt-1 font-medium">{formatDateLong(active.scheduledStart)}<br /><span className="tabular-nums">{formatRange(active.scheduledStart, active.scheduledEnd)}</span></dd></div>
        <div className="col-span-2"><dt className="text-[11px] font-medium uppercase tracking-wide text-[#9a8e86]">Where</dt><dd className="mt-1 break-words">{active.meetingLocation || "To be agreed in the chat"}</dd></div>
      </dl>

      {resolution === "CANCELLED" && <CancellationNote info={active.cancellation} detailed className="mt-4" />}
      {message && <p role={message.tone === "error" ? "alert" : "status"} className={`mt-4 rounded-lg px-3 py-2.5 text-sm ${message.tone === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{message.text}</p>}
      {active.arrangementStatus === "PAUSED" && !closed && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This arrangement is paused, so new answers are on hold until it resumes.</p>}
      {underReview && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-800">{active.completionDisputeReason ? `A problem was reported: “${active.completionDisputeReason}”. ` : ""}{next.hint}</p>}

      <ol className="mt-4 space-y-4">
        <Step index={1} state={attendanceState} title="Attendance">
          {outcome === "VERIFIED" && <p>You both confirmed the attendance.</p>}
          {outcome === "NO_SHOW" && <p>You both said nobody attended, so this was recorded as a no-show.</p>}
          {outcome === "DISPUTED" && <p>Your answers didn&apos;t match: {role === "STUDENT" ? "you" : "the student"} said {(role === "STUDENT" ? own : other) ? "attended" : "didn't attend"}, {role === "STUDENT" ? "your Academic Mate" : "you"} said {(role === "STUDENT" ? other : own) ? "attended" : "didn't attend"}.</p>}
          {outcome === "PENDING" && (
            <>
              <p>{own === null ? (role === "STUDENT" ? "Tell us whether you attended." : "Tell us whether the student attended.") : `You answered: ${own ? "attended" : "didn't attend"}. Waiting for ${otherName}.`}</p>
              {actions.attendance && (
                <div className="grid grid-cols-2 gap-2">
                  <PrimaryButton disabled={busy} onClick={() => void send({ type: "ATTENDANCE", attended: true })}><CheckIcon />{role === "STUDENT" ? "Yes, I attended" : "Attended"}</PrimaryButton>
                  <SecondaryButton disabled={busy} onClick={() => void send({ type: "ATTENDANCE", attended: false })}>{role === "STUDENT" ? "No, I didn't" : "Didn't attend"}</SecondaryButton>
                </div>
              )}
              {actions.changeAttendance && <ChangeAnswer saidYes={Boolean(own)} busy={busy} changesLeft={changesLeft} msLeft={answerChangeTimeLeftMs(snapshot, now)} onConfirm={() => send({ type: "ATTENDANCE", attended: !own })} />}
              {role === "STUDENT" && own !== null && !actions.changeAttendance && att?.mateConfirmedStudentAttended === null && <p className="text-[11px] text-[#9a8e86]">{changesLeft === 0 ? "You've used all your changes." : "Answers can no longer be changed."}</p>}
              {role === "ACADEMIC_MATE" && own === null && !actions.attendance && now >= attendanceOpensAt(role, start, end) && !closed && <p className="text-xs text-[#81766f]">Waiting for the student to answer first.</p>}
              {own === null && !actions.attendance && !closed && <p className="text-xs text-[#81766f]">{now < start ? `This opens once the session starts.` : `This opens at ${formatClock(new Date(attendanceOpensAt(role, start, end)).toISOString())}.`}</p>}
            </>
          )}
        </Step>

        <Step index={2} state={completionState} title="Completion">
          {resolution === "COMPLETED" && <p>You both confirmed this session was completed{active.completedAt ? ` on ${formatDateLong(active.completedAt)}` : ""}.</p>}
          {resolution !== "COMPLETED" && (
            <>
              <p>
                {ownDone ? `You confirmed. Waiting for ${otherName}.`
                  : otherDone ? `${otherName} already confirmed. Your answer is needed.`
                  : outcome !== "VERIFIED" ? "Opens after the session ends, once attendance is confirmed by you both."
                  : now < end ? `Opens when the session ends at ${formatClock(active.scheduledEnd)}.`
                  : "Confirm that the session went ahead as planned."}
              </p>
              {deadline !== null && !underReview && !(ownDone && otherDone) && <p className="text-xs text-[#81766f]">The other person must confirm by {formatDateLong(new Date(deadline).toISOString())}, {formatClock(new Date(deadline).toISOString())}. After that it goes to review.</p>}
              {actions.completion && <PrimaryButton disabled={busy} onClick={() => void send({ type: "COMPLETION", action: "CONFIRM" })} className="w-full sm:w-auto"><CheckIcon />Yes, it was completed</PrimaryButton>}
            </>
          )}
        </Step>
      </ol>

      {role === "STUDENT" && resolution === "COMPLETED" && <ReviewForm sessionId={active.id} />}

      {actions.dispute && (
        <div className="mt-5 border-t border-[#f0e9e4] pt-4">
          {!reporting ? (
            <button type="button" onClick={() => setReporting(true)} className="text-sm font-semibold text-[#7d1f2a] hover:underline">Something went wrong? Report a problem</button>
          ) : (
            <div>
              <label htmlFor={`problem-${active.id}`} className="block text-sm font-semibold">What went wrong?</label>
              <textarea id={`problem-${active.id}`} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} placeholder="For example: the session was cut short, or it never happened." className="mt-1.5 w-full resize-y rounded-lg border border-[#ded4cd] px-3 py-2 text-sm outline-none placeholder:text-[#a79b92] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10" />
              <p className="mt-1 text-xs text-[#81766f]">The session will be sent to the TXMate team for review.</p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void send({ type: "COMPLETION", action: "DISPUTE", reason: reason.trim() })} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">Send for review</button>
                <SecondaryButton onClick={() => { setReporting(false); setReason(""); }}>Cancel</SecondaryButton>
              </div>
            </div>
          )}
        </div>
      )}

      <footer className="mt-4 flex items-center gap-1 border-t border-[#f0e9e4] pt-3">
        <IconButton icon="chat" label="Open chat" href={active.conversationUrl} />
        {role === "ACADEMIC_MATE" && active.groupId && !closed && <IconButton icon="list" label="Open attendance list" href={`/student/sessions?group=${encodeURIComponent(active.groupId)}`} />}
      </footer>
    </section>
  );
}
