"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionPrompt } from "@/lib/session-prompts-core";
import { StarInput } from "./review-form";
import { CheckIcon, Glyph, IconButton, PrimaryButton, SecondaryButton, formatRange, postJson, sessionActionUrl } from "./session-ui";

const POLL_MS = 30_000;
const STORAGE_KEY = "txmate:dismissed-prompts";

// Questions about a live session come back next visit if still unanswered; a skipped review stays skipped on this device.
const isReviewKey = (key: string) => key.startsWith("STUDENT_REVIEW:");
function readList(storage: () => Storage): string[] {
  try {
    const parsed: unknown = JSON.parse(storage().getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string").slice(-100) : [];
  } catch { return []; }
}
function readDismissed(): string[] {
  return [...readList(() => window.sessionStorage), ...readList(() => window.localStorage)];
}
function remember(key: string) {
  const area = isReviewKey(key) ? () => window.localStorage : () => window.sessionStorage;
  try { area().setItem(STORAGE_KEY, JSON.stringify([...readList(area), key].slice(-100))); } catch { /* storage unavailable */ }
}

function title(prompt: SessionPrompt): string {
  const course = `${prompt.courseName} (${prompt.courseCode})`;
  switch (prompt.kind) {
    case "STUDENT_ATTENDANCE": return `Did you attend ${course}?`;
    case "STUDENT_COMPLETION": return `Was your ${course} session completed?`;
    case "STUDENT_REVIEW": return `How was ${course} with ${prompt.otherName}?`;
    case "MATE_ATTENDANCE": return prompt.count === 1 && prompt.otherName ? `Did ${prompt.otherName} attend ${course}?` : `Confirm attendance for ${prompt.count} students`;
    case "MATE_COMPLETION": return prompt.count === 1 && prompt.otherName ? `Confirm ${course} with ${prompt.otherName} is complete` : `Confirm completion for ${prompt.count} students`;
  }
}

/** A small card that slides up on any student page when a session needs the user's answer. */
export default function SessionPromptHost() {
  const pathname = usePathname();
  const [prompts, setPrompts] = useState<SessionPrompt[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setDismissed(readDismissed()); }, []);

  const load = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const response = await fetch("/api/student/session-prompts", { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const body = await response.json() as { prompts?: SessionPrompt[] };
      setPrompts(Array.isArray(body.prompts) ? body.prompts : []);
    } catch { /* try again on the next tick */ }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  // The Sessions pages already show these actions in place, so do not cover them.
  const onSessionsPage = pathname === "/student/sessions";
  const current = onSessionsPage ? undefined : prompts.find((p) => !dismissed.includes(p.key));

  function dismiss(key: string) {
    setError(null);
    setDismissed((current) => [...current, key]);
    remember(key);
  }

  async function answer(prompt: SessionPrompt, payload: Record<string, unknown>) {
    if (!prompt.sessionId || busy) return;
    setBusy(true); setError(null);
    const result = await postJson(sessionActionUrl(prompt.sessionId), payload);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setPrompts((all) => all.filter((p) => p.key !== prompt.key));
    setThanks(result.message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setThanks(null), 3000);
    void load();
  }

  async function rate(prompt: SessionPrompt, rating: number) {
    if (!prompt.sessionId || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/student/sessions/${encodeURIComponent(prompt.sessionId)}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating }) });
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) { setError(body.error || "We couldn't save your rating."); return; }
      setPrompts((all) => all.filter((p) => p.key !== prompt.key));
      setThanks("Thanks for rating. You can add a comment from the session.");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setThanks(null), 4000);
    } catch { setError("Couldn't reach TXMate. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  if (!current && !thanks) return null;
  const direct = current && current.sessionId && (current.kind === "STUDENT_ATTENDANCE" || current.kind === "STUDENT_COMPLETION" || (current.kind === "MATE_ATTENDANCE" && current.count === 1) || (current.kind === "MATE_COMPLETION" && current.count === 1));
  const more = current ? prompts.filter((p) => p.key !== current.key && !dismissed.includes(p.key)).length : 0;
  const isAttendance = current?.kind === "STUDENT_ATTENDANCE" || current?.kind === "MATE_ATTENDANCE";
  const isReview = current?.kind === "STUDENT_REVIEW";
  const asking = current ? (isReview ? "Rate your session" : isAttendance ? "Attendance" : "Completion") : "";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 lg:bottom-6 lg:justify-end lg:px-6" aria-live="polite">
      {current ? (
        <div role="dialog" aria-label={`${asking} needs your answer`} className="pointer-events-auto w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_18px_50px_-12px_rgba(60,20,25,0.45)] ring-1 ring-[#e8d9d5] animate-in slide-in-from-bottom-6 fade-in duration-300">
          <div className="h-1.5 bg-gradient-to-r from-[#7d1f2a] to-[#b4505c]" />
          <div className="p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f7eee9] text-[#7d1f2a]"><Glyph name={isReview ? "star" : isAttendance ? "users" : "flag"} className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a2630]">{asking}{more > 0 ? ` · ${more} more` : ""}</p>
                <p className="mt-0.5 text-sm font-semibold leading-snug text-[#282321]">{title(current)}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] tabular-nums text-[#81766f]"><Glyph name="clock" className="h-3.5 w-3.5" />{formatRange(current.scheduledStart, current.scheduledEnd)}</p>
              </div>
              <button type="button" onClick={() => dismiss(current.key)} aria-label="Dismiss for now" title="Dismiss for now" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#9a8e86] transition hover:bg-[#f4f0ec] hover:text-[#584c45] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"><Glyph name="x" className="h-4 w-4" /></button>
            </div>
            {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p> : null}
            <div className="mt-4 flex items-center gap-2">
              {isReview ? (
                <StarInput value={0} onChange={(n) => void rate(current, n)} disabled={busy} />
              ) : direct && isAttendance ? (
                <>
                  <PrimaryButton disabled={busy} onClick={() => void answer(current, { type: "ATTENDANCE", attended: true })} className="flex-1"><CheckIcon />Yes</PrimaryButton>
                  <SecondaryButton disabled={busy} onClick={() => void answer(current, { type: "ATTENDANCE", attended: false })} className="flex-1"><Glyph name="x" className="h-4 w-4" />No</SecondaryButton>
                </>
              ) : direct ? (
                <PrimaryButton disabled={busy} onClick={() => void answer(current, { type: "COMPLETION", action: "CONFIRM" })} className="flex-1"><CheckIcon />Yes, confirm</PrimaryButton>
              ) : (
                <Link href={current.url} onClick={() => dismiss(current.key)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#7d1f2a] px-4 text-[13px] font-semibold text-white transition hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2"><Glyph name="list" className="h-4 w-4" />Open the list</Link>
              )}
              {direct && !isReview ? <IconButton icon="chevronRight" label="Open details" href={current.url} className="border border-[#ded4cd]" /> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-[#282321] px-4 py-2 text-[13px] font-medium text-white shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-200"><CheckIcon className="h-4 w-4 text-emerald-400" />{thanks}</div>
      )}
    </div>
  );
}
