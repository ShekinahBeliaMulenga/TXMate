"use client";

import { useState } from "react";
import { VENUE_MAX_LENGTH, checkVenue, isVenueUnset } from "@/lib/session-venue";
import type { GroupSheet } from "@/lib/session-lifecycle-types";
import { Glyph, PrimaryButton, SecondaryButton, useNow } from "./session-ui";

export type GroupVenuePayload =
  | { action: "SET"; location: string; alsoFuture: boolean }
  | { action: "DECLINE" };

const OPEN = ["SCHEDULED", "IN_PROGRESS"];

/**
 * The Academic Mate's venue controls for a whole slot: where everyone meets, plus the places
 * students have suggested. Setting or accepting a venue applies to every student in the slot.
 */
export default function GroupVenue({ sheet, busy, onSend }: {
  sheet: GroupSheet;
  busy: boolean;
  /** Sends the change for one student's session and refreshes the list. Resolves true when saved. */
  onSend: (sessionId: string, payload: GroupVenuePayload) => Promise<boolean>;
}) {
  // Once the slot has ended its place can no longer be changed. The clock ticks, so this updates without a reload.
  const now = useNow();
  const ended = new Date(sheet.scheduledEnd).getTime() <= now;
  const openRows = ended ? [] : sheet.rows.filter((row) => OPEN.includes(row.status));
  const target = openRows[0]?.sessionId;
  const unset = isVenueUnset(sheet.meetingLocation);
  const suggestions = openRows.filter((row) => row.suggestedLocation);

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [alsoFuture, setAlsoFuture] = useState(sheet.recurring);
  const [problem, setProblem] = useState("");

  function open() {
    setValue(unset ? suggestions[0]?.suggestedLocation ?? "" : sheet.meetingLocation);
    setProblem("");
    setEditing(true);
  }

  async function save() {
    if (!target) return;
    const checked = checkVenue(value);
    if (!checked.ok) { setProblem(checked.message); return; }
    setProblem("");
    const saved = await onSend(target, { action: "SET", location: checked.value, alsoFuture: sheet.recurring && alsoFuture });
    if (saved) setEditing(false);
  }

  return (
    <div className="mt-1">
      <p className="flex items-center gap-1 text-xs text-[#756b65]">
        <Glyph name="location" className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">{unset ? "Venue not set" : sheet.meetingLocation}</span>
        {target && !editing && (
          <button type="button" onClick={open} disabled={busy} className="shrink-0 font-semibold text-[#7d1f2a] hover:underline disabled:opacity-60">{unset ? "Set" : "Change"}</button>
        )}
      </p>

      {editing && (
        <form className="mt-1.5 space-y-1.5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="flex gap-1.5">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Meeting place</span>
              <input
                value={value}
                onChange={(event) => { setValue(event.target.value); setProblem(""); }}
                maxLength={VENUE_MAX_LENGTH}
                autoFocus
                placeholder="e.g. Library, Room 2"
                className="h-9 w-full rounded-lg border border-[#d8cec5] bg-white px-2.5 text-base text-[#282321] outline-none placeholder:text-[#a39a94] focus:border-[#7d1f2a] sm:text-xs"
              />
            </label>
            <PrimaryButton type="submit" disabled={busy} className="min-h-9! px-3! text-xs!">Save</PrimaryButton>
            <SecondaryButton disabled={busy} onClick={() => { setEditing(false); setProblem(""); }} className="min-h-9! px-3! text-xs!">Cancel</SecondaryButton>
          </div>
          {sheet.recurring && (
            <label className="flex items-center gap-1.5 text-[11px] text-[#625954]">
              <input type="checkbox" checked={alsoFuture} onChange={(event) => setAlsoFuture(event.target.checked)} className="h-3.5 w-3.5 accent-[#7d1f2a]" />
              Also later weekly sessions
            </label>
          )}
          {problem && <p role="alert" className="text-[11px] text-red-700">{problem}</p>}
        </form>
      )}

      {suggestions.length > 0 && !editing && (
        <ul className="mt-1.5 space-y-1">
          {suggestions.map((row) => (
            <li key={row.sessionId} className="flex items-center gap-2.5 rounded-lg bg-[#fdf6f3] py-1 pl-2.5 pr-2">
              <p className="min-w-0 flex-1 truncate text-xs text-[#3a2b28]">{row.studentName}: <span className="font-semibold">{row.suggestedLocation}</span></p>
              <PrimaryButton disabled={busy} className="min-h-7! px-3.5! text-[11px]!" onClick={() => void onSend(row.sessionId, { action: "SET", location: row.suggestedLocation ?? "", alsoFuture: false })}>Use</PrimaryButton>
              <SecondaryButton disabled={busy} className="min-h-7! px-3.5! text-[11px]!" onClick={() => void onSend(row.sessionId, { action: "DECLINE" })}>No</SecondaryButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
