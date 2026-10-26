"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import type { DisputeItem, DisputeOutcome } from "@/lib/admin/dispute-types";
import { NOTE_MAX, NOTE_MIN } from "@/lib/admin/dispute-types";

const OPTIONS: ReadonlyArray<{ value: DisputeOutcome; title: string; detail: string }> = [
  { value: "COMPLETED", title: "The session took place", detail: "Marks it completed for both people." },
  { value: "NO_SHOW", title: "The session did not take place", detail: "Records a no-show and lets the student request the course again." },
];

/** Asks for the decision and a written reason, then submits it. Stays open and shows the error if the server refuses. */
export default function ResolveDisputeDialog({ item, onClose, onResolved }: { item: DisputeItem; onClose: () => void; onResolved: (sessionId: string, message: string) => void }) {
  const [outcome, setOutcome] = useState<DisputeOutcome | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const trimmed = note.trim();
  const valid = outcome !== null && trimmed.length >= NOTE_MIN && trimmed.length <= NOTE_MAX;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/disputes/${encodeURIComponent(item.id)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ outcome, note: trimmed }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (response.status === 401) {
        window.location.assign("/admin/login?expired=1");
        return;
      }
      if (!response.ok) {
        setError(body.error || "Unable to save the decision.");
        return;
      }
      onResolved(item.id, body.message || "Decision recorded.");
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="resolve-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="resolve-title" className="text-lg font-semibold text-[#282321]">Record a decision</h2>
            <p className="mt-0.5 truncate text-sm text-[#6d6260]">{item.course.code} · {item.student.name}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6d6260] hover:bg-[#f3efeb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:opacity-50">
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </div>

        <fieldset className="mt-4 space-y-2.5" disabled={busy}>
          <legend className="sr-only">Outcome</legend>
          {OPTIONS.map((option) => {
            const selected = outcome === option.value;
            return (
              <label key={option.value} className={`flex cursor-pointer items-start gap-3.5 rounded-xl border px-4 py-3.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#7d1f2a]/40 ${selected ? "border-[#7d1f2a] bg-[#fdf6f7]" : "border-[#e2d9d0] hover:bg-[#faf8f6]"}`}>
                <input type="radio" name="outcome" value={option.value} checked={selected} onChange={() => { setOutcome(option.value); noteRef.current?.focus(); }} className="sr-only" />
                <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-[#7d1f2a]" : "border-[#c9bdb4]"}`}>
                  {selected ? <span className="h-2.5 w-2.5 rounded-full bg-[#7d1f2a]" /> : null}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[#282321]">{option.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-5 text-[#7a6f6a]">{option.detail}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="resolve-note" className="text-sm font-semibold text-[#282321]">Reason for this decision</label>
            <span className="text-xs tabular-nums text-[#7a6f6a]">{trimmed.length}/{NOTE_MAX}</span>
          </div>
          <textarea
            id="resolve-note"
            ref={noteRef}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={NOTE_MAX}
            rows={4}
            disabled={busy}
            placeholder="What did you check, and why did you decide this?"
            className="mt-2 w-full resize-y rounded-xl border border-[#ded3ca] px-4 py-3 text-sm leading-6 outline-none focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10"
          />
          <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-[#7a6f6a]">
            <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Both people are notified. This decision and your name are saved in the audit log and can’t be edited.
          </p>
        </div>

        {error ? <p role="alert" className="mt-3 text-sm font-medium text-[#7d1f2a]">{error}</p> : null}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="h-12 rounded-xl border border-[#d9cec5] px-5 text-sm font-semibold text-[#4e4742] hover:bg-[#faf8f6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={!valid || busy} className="h-12 flex-1 rounded-xl bg-[#7d1f2a] text-sm font-semibold text-white transition hover:bg-[#691923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Saving…" : "Confirm decision"}
          </button>
        </div>
      </form>
    </div>
  );
}
