"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Sheet from "./sheet";
import GroupVenue, { type GroupVenuePayload } from "./group-venue";
import { Avatar, CheckIcon, FlowTracker, Glyph, PrimaryButton, formatClock, formatDateShort, formatRange, groupActionUrl, postJson, sessionActionUrl, useNow, type StepState } from "./session-ui";
import type { GroupSheet, GroupSheetRow } from "@/lib/session-lifecycle-types";

type Banner = { tone: "ok" | "error"; text: string };

/** The state of one student's row once the mate can no longer change it. */
function settled(row: GroupSheetRow): { icon: "check" | "x" | "alert" | "clock"; tone: string; label: string } {
  if (row.needsReview) return { icon: "alert", tone: "bg-red-100 text-red-700", label: "Needs review" };
  if (row.status === "COMPLETED") return { icon: "check", tone: "bg-emerald-600 text-white", label: "Completed" };
  if (row.outcome === "VERIFIED") return { icon: "check", tone: "bg-emerald-100 text-emerald-700", label: row.completionConfirmedByMate ? "Waiting for the student" : "Attendance verified" };
  if (row.outcome === "NO_SHOW") return { icon: "x", tone: "bg-stone-200 text-stone-600", label: "No-show" };
  if (row.studentAttended === null) return { icon: "clock", tone: "bg-[#f0eae5] text-[#9a8e86]", label: "Waiting for the student's answer" };
  return { icon: "clock", tone: "bg-[#f0eae5] text-[#9a8e86]", label: row.mateAttended !== null ? "Waiting for the student" : "Not open yet" };
}

function RowMark({ icon, tone, label }: { icon: "check" | "x" | "alert" | "clock"; tone: string; label: string }) {
  return <span role="img" aria-label={label} title={label} className={`flex h-9 w-9 items-center justify-center rounded-full ${tone}`}><Glyph name={icon} className="h-[18px] w-[18px]" /></span>;
}

/** The Academic Mate's list for one session slot: tick who attended, confirm once. */
export default function GroupSheetDialog({ groupId, onClose, onChanged }: { groupId: string; onClose: () => void; onChanged?: () => void | Promise<void> }) {
  const now = useNow(15_000);
  const [sheet, setSheet] = useState<GroupSheet | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(groupActionUrl(groupId), { cache: "no-store", signal });
      const body = await response.json() as { sheet?: GroupSheet; error?: string };
      if (!response.ok || !body.sheet) throw new Error(response.status === 404 ? "This list isn't available to you." : body.error || "We couldn't load the list.");
      const loaded = body.sheet;
      setSheet(loaded); setError("");
      // Start from what each student said, so confirming is one tap when everything matches.
      setAnswers((current) => {
        const next: Record<string, boolean> = {};
        for (const row of loaded.rows) if (row.answerable && row.studentAttended !== null) next[row.sessionId] = current[row.sessionId] ?? row.studentAttended;
        return next;
      });
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "We couldn't load the list.");
    }
  }, [groupId]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible" && !busy && !submitted) void load(); };
    const timer = window.setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load, busy, submitted]);

  const answerable = useMemo(() => sheet?.rows.filter((row) => row.answerable) ?? [], [sheet]);
  const readyForCompletion = sheet?.rows.filter((row) => row.completionEligible).length ?? 0;
  const attended = answerable.filter((row) => answers[row.sessionId]).length;
  const differing = answerable.filter((row) => answers[row.sessionId] !== row.studentAttended).length;
  const answered = sheet?.rows.filter((row) => row.studentAttended !== null).length ?? 0;
  const opensAt = sheet ? new Date(sheet.attendanceOpensAt).getTime() : 0;

  async function run(payload: Record<string, unknown>, isAttendance: boolean) {
    if (!sheet || busy) return;
    setBusy(true); setBanner(null);
    const result = await postJson(groupActionUrl(sheet.id), payload);
    if (result.ok && isAttendance) setSubmitted(result.message);
    else setBanner({ tone: result.ok ? "ok" : "error", text: result.message });
    await load();
    try { await onChanged?.(); } catch { /* the result above stays visible */ }
    setBusy(false);
  }
  async function sendVenue(sessionId: string, payload: GroupVenuePayload): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setBanner(null);
    const result = await postJson(`${sessionActionUrl(sessionId)}/venue`, payload);
    setBanner({ tone: result.ok ? "ok" : "error", text: result.message });
    await load();
    try { await onChanged?.(); } catch { /* the result above stays visible */ }
    setBusy(false);
    return result.ok;
  }
  const submitAttendance = () => void run({ type: "ATTENDANCE", responses: answerable.map((row) => ({ sessionId: row.sessionId, attended: answers[row.sessionId] === true })) }, true);
  const confirmCompletion = () => void run({ type: "COMPLETION" }, false);
  const markAll = () => setAnswers((current) => { const next = { ...current }; for (const row of answerable) next[row.sessionId] = true; return next; });
  const toggle = (id: string) => setAnswers((current) => ({ ...current, [id]: !current[id] }));

  if (!sheet) {
    return (
      <Sheet label="Attendance list" onClose={onClose}>
        <div className="p-4 pt-14">
          {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} <button type="button" onClick={() => void load()} className="font-semibold underline">Try again</button></div>
            : <div role="status" aria-busy="true" className="h-72 animate-pulse rounded-2xl bg-white ring-1 ring-[#e8e0d9] motion-reduce:animate-none"><span className="sr-only">Loading list…</span></div>}
        </div>
      </Sheet>
    );
  }

  const start = new Date(sheet.scheduledStart).getTime();
  const end = new Date(sheet.scheduledEnd).getTime();
  const rowsDone = sheet.rows.every((row) => row.outcome === "VERIFIED" || row.outcome === "NO_SHOW");
  const attendanceStep: StepState = sheet.rows.some((row) => row.needsReview) ? "problem" : rowsDone ? "done" : answerable.length > 0 ? "current" : "todo";
  const completionStep: StepState = sheet.rows.every((row) => row.status === "COMPLETED") ? "done" : readyForCompletion > 0 ? "current" : "todo";
  const phase = now < start ? "Upcoming" : now < end ? "In progress" : "Past";

  if (submitted) {
    return (
      <Sheet label="Attendance submitted" onClose={onClose}>
        <div className="flex flex-col items-center px-6 pb-8 pt-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 animate-in zoom-in-50 duration-300"><CheckIcon className="h-8 w-8" /></span>
          <h2 className="mt-4 text-xl font-semibold">Attendance submitted</h2>
          <p className="mt-1.5 max-w-xs text-sm leading-5 text-[#756b65]">{submitted}</p>
          <PrimaryButton onClick={onClose} className="mt-6 min-w-32"><CheckIcon />Done</PrimaryButton>
        </div>
      </Sheet>
    );
  }

  const footer = answerable.length > 0
    ? <PrimaryButton disabled={busy} onClick={submitAttendance} className="w-full"><CheckIcon />{busy ? "Saving…" : `Confirm attendance · ${attended} of ${answerable.length}`}</PrimaryButton>
    : readyForCompletion > 0
      ? <PrimaryButton disabled={busy} onClick={confirmCompletion} className="w-full"><Glyph name="flag" className="h-4 w-4" />{busy ? "Saving…" : `Confirm completion · ${readyForCompletion}`}</PrimaryButton>
      : null;

  return (
    <Sheet label="Attendance list" onClose={onClose} footer={footer}>
      <div className="px-4 pb-4 pt-5 sm:px-6">
        <div className="pr-12">
          <h2 className="text-lg font-semibold leading-6 sm:text-xl">{sheet.course.name}</h2>
          <p className="mt-0.5 text-xs text-[#756b65]">{sheet.course.code} · {formatDateShort(sheet.scheduledStart)} · <span className="tabular-nums">{formatRange(sheet.scheduledStart, sheet.scheduledEnd)}</span></p>
          <GroupVenue sheet={sheet} busy={busy} onSend={sendVenue} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-[#e8e0d9]">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#584c45]"><Glyph name="users" className="h-4 w-4 text-[#7d1f2a]" />{answered} of {sheet.rows.length} answered<span className="font-normal text-[#9a8e86]">· {phase}</span></p>
          <FlowTracker attendance={attendanceStep} completion={completionStep} />
        </div>

        {banner && <p role={banner.tone === "error" ? "alert" : "status"} className={`mt-3 rounded-lg px-3 py-2.5 text-sm ${banner.tone === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{banner.text}</p>}

        {answerable.length > 0 ? (
          <p className="mt-3 text-xs leading-5 text-[#756b65]">Students answer first. Tick who attended and confirm once. Differences are flagged for review.</p>
        ) : now < opensAt ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-[#756b65]"><Glyph name="clock" className="h-3.5 w-3.5" />Opens at {formatClock(sheet.attendanceOpensAt)}, 10 minutes before the end.</p>
        ) : null}

        <div className="mt-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8a7d74]">Students</h3>
          {answerable.length > 0 && <button type="button" onClick={markAll} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#7d1f2a] hover:bg-[#f4e5e2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"><CheckIcon className="h-3.5 w-3.5" />All attended</button>}
        </div>

        <ul className="mt-1 divide-y divide-[#f1eae5] overflow-hidden rounded-2xl bg-white ring-1 ring-[#e8e0d9]">
          {sheet.rows.map((row) => {
            const value = answers[row.sessionId];
            const differs = row.answerable && value !== row.studentAttended;
            return (
              <li key={row.sessionId} className="flex items-center gap-3 px-3 py-2">
                <Avatar name={row.studentName} image={row.studentImage} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-5">{row.studentName}</p>
                  <p className="text-[11px] leading-4 text-[#9a8e86]">{row.studentAttended === null ? "Hasn't answered yet" : row.studentAttended ? "Says they attended" : "Says they didn't attend"}{differs ? " · you changed it" : ""}</p>
                </div>
                {row.answerable ? (
                  <button type="button" role="switch" aria-checked={value === true} aria-label={`${row.studentName} attended`} title={value ? "Attended" : "Didn't attend"} onClick={() => toggle(row.sessionId)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 ${value ? "border-emerald-600 bg-emerald-600 text-white" : "border-[#e3b9b4] bg-white text-red-600"}`}>
                    <Glyph name={value ? "check" : "x"} className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                ) : (
                  <RowMark {...settled(row)} />
                )}
              </li>
            );
          })}
        </ul>
        {answerable.length > 0 && differing > 0 && <p className="mt-2 text-xs text-amber-800" aria-live="polite">{differing} {differing === 1 ? "answer differs" : "answers differ"} from the student's and will be sent for review.</p>}
      </div>
    </Sheet>
  );
}
