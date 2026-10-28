"use client";

import { useState } from "react";
import { VENUE_MAX_LENGTH, checkVenue, isVenueUnset } from "@/lib/session-venue";
import type { SessionLifecycleItem } from "@/lib/session-lifecycle-types";
import { PrimaryButton, SecondaryButton } from "./session-ui";

type VenuePayload =
  | { action: "SET"; location: string; alsoFuture: boolean }
  | { action: "SUGGEST"; location: string }
  | { action: "ACCEPT" }
  | { action: "DECLINE" };

/**
 * Where the session happens. The Academic Mate chooses the place; the student can suggest one,
 * which the mate accepts or declines. Rendered inside the "Where" row of the session details.
 */
export default function SessionVenue({ session, closed, busy, onSend }: {
  session: SessionLifecycleItem;
  closed: boolean;
  busy: boolean;
  /** Sends the change and refreshes the session. Resolves true when it was saved. */
  onSend: (payload: VenuePayload) => Promise<boolean>;
}) {
  const isMate = session.viewerRole === "ACADEMIC_MATE";
  const unset = isVenueUnset(session.meetingLocation);
  const suggestion = session.suggestedLocation;
  const recurring = session.arrangementType === "RECURRING";

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [alsoFuture, setAlsoFuture] = useState(recurring);
  const [problem, setProblem] = useState("");

  function open() {
    setValue(isMate ? (unset ? suggestion ?? "" : session.meetingLocation) : suggestion ?? "");
    setProblem("");
    setEditing(true);
  }

  async function save() {
    const checked = checkVenue(value);
    if (!checked.ok) { setProblem(checked.message); return; }
    setProblem("");
    const saved = await onSend(isMate
      ? { action: "SET", location: checked.value, alsoFuture: recurring && alsoFuture }
      : { action: "SUGGEST", location: checked.value });
    if (saved) setEditing(false);
  }

  const current = unset
    ? <span className="text-[#81766f]">Not set yet. {isMate ? "Choose where you will meet." : "Your Academic Mate will choose, or suggest a place."}</span>
    : <span>{session.meetingLocation}</span>;

  return (
    <div>
      <p className="break-words">{current}</p>

      {!closed && isMate && suggestion && !editing && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-[#fdf6f3] py-1 pl-2.5 pr-1.5">
          <p className="min-w-0 flex-1 text-xs text-[#3a2b28]">{session.otherParticipantName} suggests <span className="font-semibold">{suggestion}</span></p>
          <PrimaryButton disabled={busy} className="min-h-7! px-2.5! text-[11px]!" onClick={() => void onSend({ action: "ACCEPT" })}>Accept</PrimaryButton>
          <SecondaryButton disabled={busy} className="min-h-7! px-2.5! text-[11px]!" onClick={() => void onSend({ action: "DECLINE" })}>Decline</SecondaryButton>
        </div>
      )}

      {!closed && !isMate && suggestion && !editing && (
        <p className="mt-1 text-xs text-[#81766f]">You suggested <span className="font-medium text-[#4b423e]">{suggestion}</span>. Waiting for your Academic Mate.</p>
      )}

      {!closed && !editing && (
        <button type="button" onClick={open} disabled={busy} className="mt-1.5 text-xs font-semibold text-[#7d1f2a] hover:underline disabled:opacity-60">
          {isMate ? (unset ? "Set venue" : "Change venue") : suggestion ? "Change suggestion" : "Suggest a place"}
        </button>
      )}

      {!closed && editing && (
        <form className="mt-2 space-y-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <label className="block">
            <span className="sr-only">{isMate ? "Meeting place" : "Suggested meeting place"}</span>
            <input
              value={value}
              onChange={(event) => { setValue(event.target.value); setProblem(""); }}
              maxLength={VENUE_MAX_LENGTH}
              autoFocus
              placeholder="e.g. Library, Room 2"
              className="h-10 w-full rounded-lg border border-[#d8cec5] bg-white px-3 text-base text-[#282321] outline-none placeholder:text-[#a39a94] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10 sm:text-[13px]"
            />
          </label>
          {isMate && recurring && (
            <label className="flex items-start gap-2 text-xs text-[#625954]">
              <input type="checkbox" checked={alsoFuture} onChange={(event) => setAlsoFuture(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[#7d1f2a]" />
              Use this place for later weekly sessions too
            </label>
          )}
          {!isMate && <p className="text-xs text-[#81766f]">Your Academic Mate decides. They will accept it or choose another place.</p>}
          {problem && <p role="alert" className="text-xs text-red-700">{problem}</p>}
          <div className="flex gap-2">
            <PrimaryButton type="submit" disabled={busy} className="min-h-8! px-3! text-xs!">{isMate ? "Save venue" : "Send suggestion"}</PrimaryButton>
            <SecondaryButton disabled={busy} onClick={() => { setEditing(false); setProblem(""); }} className="min-h-8! px-3! text-xs!">Cancel</SecondaryButton>
          </div>
        </form>
      )}
    </div>
  );
}
