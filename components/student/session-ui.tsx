"use client";

/** Shared building blocks for the Sessions list, session detail and group sheet. */
import { cancellationDetail, cancellationShort, type CancellationInfo } from "@/lib/cancellation";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  attendanceOutcome,
  availableActions,
  isCancelled,
  resolutionStatus,
  timeStatus,
  type ResolutionStatus,
  type TimeStatus,
} from "@/lib/session-lifecycle-rules";
import { snapshotOf } from "@/lib/session-lifecycle-serialize";
import type { SessionLifecycleItem } from "@/lib/session-lifecycle-types";

const ZONE = "Africa/Lusaka";
const TIME = new Intl.DateTimeFormat("en-ZM", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONE });
const DAY_MONTH = new Intl.DateTimeFormat("en-ZM", { month: "short", timeZone: ZONE });
const DAY_NUMBER = new Intl.DateTimeFormat("en-ZM", { day: "numeric", timeZone: ZONE });
const DATE_LONG = new Intl.DateTimeFormat("en-ZM", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ZONE });
const DATE_SHORT = new Intl.DateTimeFormat("en-ZM", { weekday: "short", day: "numeric", month: "short", timeZone: ZONE });
const DATE_KEY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: ZONE });

export const formatClock = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : TIME.format(d); };
export const formatRange = (start: string, end: string) => `${formatClock(start)} – ${formatClock(end)}`;
export const formatDayMonth = (iso: string) => DAY_MONTH.format(new Date(iso));
export const formatDayNumber = (iso: string) => DAY_NUMBER.format(new Date(iso));
export const formatDateLong = (iso: string) => DATE_LONG.format(new Date(iso));
export const formatDateShort = (iso: string) => DATE_SHORT.format(new Date(iso));
export const dateKey = (iso: string) => DATE_KEY.format(new Date(iso));
export function dayLabel(iso: string, now: number) {
  const key = dateKey(iso);
  if (key === DATE_KEY.format(new Date(now))) return "Today";
  if (key === DATE_KEY.format(new Date(now + 86_400_000))) return "Tomorrow";
  if (key === DATE_KEY.format(new Date(now - 86_400_000))) return "Yesterday";
  return formatDateLong(iso);
}

/** A ticking clock so time-based states (windows opening, deadlines) update without a reload. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [intervalMs]);
  return now;
}

// ----------------------------------------------------------------- classification

/** Sessions that have left the active schedule for good. */
export function isClosed(session: SessionLifecycleItem) {
  return isCancelled(snapshotOf(session)) || ["COMPLETED", "NO_SHOW"].includes(session.status);
}
/** The tab a session belongs in. Closed sessions are always "past". */
export function tabOf(session: SessionLifecycleItem, now: number): TimeStatus {
  if (isClosed(session)) return "PAST";
  return timeStatus(snapshotOf(session), now);
}
export const resolutionOf = (session: SessionLifecycleItem, now: number): ResolutionStatus => resolutionStatus(snapshotOf(session), now);

// ------------------------------------------------------------------------ chips

const TIME_CHIP: Record<TimeStatus, { label: string; className: string }> = {
  UPCOMING: { label: "Upcoming", className: "bg-sky-50 text-sky-800 ring-sky-200" },
  IN_PROGRESS: { label: "In progress", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  PAST: { label: "Past", className: "bg-stone-100 text-stone-700 ring-stone-200" },
};
export const RESOLUTION_CHIP: Record<Exclude<ResolutionStatus, "NONE">, { label: string; className: string }> = {
  AWAITING_CONFIRMATION: { label: "Awaiting confirmation", className: "bg-amber-50 text-amber-900 ring-amber-200" },
  NEEDS_REVIEW: { label: "Needs review", className: "bg-red-50 text-red-800 ring-red-200" },
  NO_RESPONSE: { label: "No response", className: "bg-orange-50 text-orange-900 ring-orange-200" },
  COMPLETED: { label: "Completed", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  NO_SHOW: { label: "No-show", className: "bg-stone-100 text-stone-700 ring-stone-200" },
  CANCELLED: { label: "Cancelled", className: "bg-stone-100 text-stone-600 ring-stone-200" },
};

const chipBase = "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset";
export function TimeChip({ status }: { status: TimeStatus }) {
  const chip = TIME_CHIP[status];
  return <span className={`${chipBase} ${chip.className}`}>{status === "IN_PROGRESS" && <span aria-hidden="true" className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />}{chip.label}</span>;
}
export function ResolutionChip({ status }: { status: ResolutionStatus }) {
  if (status === "NONE") return null;
  const chip = RESOLUTION_CHIP[status];
  return <span className={`${chipBase} ${chip.className}`}>{chip.label}</span>;
}

/** Says plainly who cancelled, and (in the detail view) when and why. Renders nothing if not cancelled. */
export function CancellationNote({ info, detailed = false, className = "" }: { info: CancellationInfo | null | undefined; detailed?: boolean; className?: string }) {
  if (!info) return null;
  if (!detailed) return <p className={`text-xs leading-5 text-[#756b65] ${className}`}>{cancellationShort(info)}{info.at ? ` · ${formatDateShort(info.at)}` : ""}</p>;
  return (
    <p role="note" className={`rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-5 text-stone-700 ${className}`}>
      {cancellationDetail(info, formatDateLong)}
    </p>
  );
}

/**
 * A deliberately quiet way to correct an attendance answer. It reads as small print, and a change
 * needs a second, explicit confirmation, so it can't be triggered by an accidental tap. The server
 * enforces the same time limit and change count.
 */
export function ChangeAnswer({ saidYes, busy, changesLeft, msLeft, onConfirm }: { saidYes: boolean; busy: boolean; changesLeft: number; msLeft: number; onConfirm: () => void | Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const minutes = Math.max(1, Math.ceil(msLeft / 60_000));
  if (!asking) {
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-[#9a8e86]">
        <span>You said {saidYes ? "yes" : "no"}.</span>
        <button type="button" disabled={busy} onClick={() => setAsking(true)} className="rounded px-0.5 text-[#8a7f78] underline decoration-[#d8cec5] underline-offset-2 hover:text-[#584c45] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:opacity-50">Made a mistake?</button>
        <span aria-hidden="true">·</span>
        <span>{minutes} min left to change</span>
      </p>
    );
  }
  return (
    <div role="group" aria-label="Change your answer" className="rounded-lg border border-[#ece5de] bg-[#faf7f5] p-2.5">
      <p className="text-xs leading-5 text-[#584c45]">Change your answer to <strong>{saidYes ? "No, I didn't attend" : "Yes, I attended"}</strong>? You have {changesLeft} {changesLeft === 1 ? "change" : "changes"} left.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" autoFocus onClick={() => setAsking(false)} className="min-h-9 flex-1 rounded-md border border-[#ded4cd] bg-white px-3 text-xs font-semibold text-[#584c45] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">Keep my answer</button>
        <button type="button" disabled={busy} onClick={async () => { await onConfirm(); setAsking(false); }} className="min-h-9 rounded-md px-3 text-xs font-medium text-[#8a7f78] underline decoration-[#d8cec5] underline-offset-2 hover:text-[#584c45] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:opacity-50">{busy ? "Saving…" : "Yes, change it"}</button>
      </div>
    </div>
  );
}

export function DateBlock({ iso, muted = false }: { iso: string; muted?: boolean }) {
  return (
    <span className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${muted ? "bg-stone-100 text-stone-600" : "bg-[#f7eee9] text-[#7d1f2a]"}`} aria-hidden="true">
      <span className="text-[10px] font-semibold uppercase leading-none">{formatDayMonth(iso)}</span>
      <span className="mt-1 text-lg font-semibold leading-none tabular-nums">{formatDayNumber(iso)}</span>
    </span>
  );
}

export function Avatar({ name, image, size = 32 }: { name: string; image?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
  // eslint-disable-next-line @next/next/no-img-element
  if (image) return <img src={image} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return <span aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-full bg-[#f0e3df] text-[11px] font-semibold text-[#7d1f2a]" style={{ width: size, height: size }}>{initials}</span>;
}

// ------------------------------------------------------------------------ buttons

export function PrimaryButton({ children, onClick, disabled, type = "button", className = "" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; className?: string }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#7d1f2a] px-4 text-[13px] font-semibold text-white transition hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}>{children}</button>;
}
export function SecondaryButton({ children, onClick, disabled, className = "" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#ded4cd] bg-white px-4 text-[13px] font-semibold text-[#584c45] transition hover:bg-[#faf7f5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}>{children}</button>;
}

export function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}

// ----------------------------------------------------------------------- actions

export type ActionResponse = { ok: true; message: string } | { ok: false; message: string };

/** POSTs an answer and returns a plain result; callers refresh their own data. */
export async function postJson(url: string, payload: Record<string, unknown>): Promise<ActionResponse> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
    if (!response.ok) return { ok: false, message: body.error || "Something went wrong. Please try again." };
    return { ok: true, message: body.message || "Saved." };
  } catch {
    return { ok: false, message: "Couldn't reach TXMate. Check your connection and try again." };
  }
}
export const sessionActionUrl = (sessionId: string) => `/api/student/sessions/${encodeURIComponent(sessionId)}`;
export const groupActionUrl = (groupId: string) => `/api/student/academic-mate/session-groups/${encodeURIComponent(groupId)}`;

// ------------------------------------------------------------------------- icons

const GLYPHS = {
  check: "m5 12.5 4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6 6 18",
  back: "M19 12H5m6-7-7 7 7 7",
  chevronRight: "m9 6 6 6-6 6",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  users: "M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 9v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  alert: "M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  eye: "M2.04 12.32a1 1 0 0 1 0-.64C3.42 7.5 7.36 4.5 12 4.5s8.57 3 9.96 7.18a1 1 0 0 1 0 .64C20.58 16.5 16.64 19.5 12 19.5s-8.57-3-9.96-7.18ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  eyeOff: "M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.88 5.09A9.7 9.7 0 0 1 12 4.5c4.64 0 8.58 3 9.96 7.18a1 1 0 0 1 0 .64 10.5 10.5 0 0 1-2.4 3.7M6.6 6.6A10.5 10.5 0 0 0 2.04 11.68a1 1 0 0 0 0 .64C3.42 16.5 7.36 19.5 12 19.5a9.7 9.7 0 0 0 4.2-.95",
  undo: "M3 7v6h6M3.5 13a9 9 0 1 0 2.6-7.4L3 9",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  star: "M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8L12 3.2Z",
  edit: "M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z",
  location: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
} as const;
export type GlyphName = keyof typeof GLYPHS;
export function Glyph({ name, className = "h-5 w-5", strokeWidth = 2 }: { name: GlyphName; className?: string; strokeWidth?: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={GLYPHS[name]} /></svg>;
}

/** A round icon-only button. `label` is the accessible name and the hover tooltip. */
export function IconButton({ icon, label, onClick, href, disabled, tone = "plain", className = "" }: { icon: GlyphName; label: string; onClick?: () => void; href?: string; disabled?: boolean; tone?: "plain" | "brand" | "good" | "bad"; className?: string }) {
  const toneClass = {
    plain: "text-[#625954] hover:bg-[#f4f0ec]",
    brand: "bg-[#7d1f2a] text-white hover:bg-[#681923]",
    good: "bg-emerald-600 text-white hover:bg-emerald-700",
    bad: "bg-red-600 text-white hover:bg-red-700",
  }[tone];
  const classes = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${className}`;
  if (href) return <Link href={href} aria-label={label} title={label} className={classes}><Glyph name={icon} /></Link>;
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={classes}><Glyph name={icon} /></button>;
}

// ------------------------------------------------------------------ workflow steps

export type StepState = "done" | "current" | "todo" | "problem";
/** Where a session is in its two-step workflow: 1. attendance, 2. completion. */
export function flowOf(session: SessionLifecycleItem, now: number): { attendance: StepState; completion: StepState } {
  const snapshot = snapshotOf(session);
  const actions = availableActions(snapshot, session.viewerRole, now);
  const outcome = attendanceOutcome(snapshot);
  const resolution = resolutionStatus(snapshot, now);
  return {
    attendance: outcome === "DISPUTED" ? "problem" : outcome === "VERIFIED" || outcome === "NO_SHOW" ? "done" : actions.attendance ? "current" : "todo",
    completion: resolution === "COMPLETED" ? "done" : resolution === "NEEDS_REVIEW" ? "problem" : actions.completion ? "current" : "todo",
  };
}

const STEP_TONE: Record<StepState, string> = {
  done: "bg-emerald-100 text-emerald-800",
  current: "bg-[#7d1f2a] text-white",
  todo: "bg-[#f0eae5] text-[#9a8e86]",
  problem: "bg-red-100 text-red-800",
};
function StepDot({ state, icon }: { state: StepState; icon: GlyphName }) {
  return <span className={`flex h-6 w-6 items-center justify-center rounded-full ${STEP_TONE[state]}`}><Glyph name={state === "done" ? "check" : state === "problem" ? "alert" : icon} className="h-3.5 w-3.5" /></span>;
}
/** Two dots joined by a line: attendance, then completion. Small enough to sit on a card. */
export function FlowTracker({ attendance, completion }: { attendance: StepState; completion: StepState }) {
  const label = (name: string, state: StepState) => `${name}: ${state === "done" ? "done" : state === "problem" ? "needs review" : state === "current" ? "your turn" : "not yet"}`;
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`${label("Attendance", attendance)}. ${label("Completion", completion)}.`}>
      <StepDot state={attendance} icon="users" />
      <span className={`h-0.5 w-5 rounded ${attendance === "done" ? "bg-emerald-300" : "bg-[#e8e0d9]"}`} />
      <StepDot state={completion} icon="flag" />
    </div>
  );
}
