"use client";

import { useCallback, useEffect, useState } from "react";
import { REVIEW_COMMENT_MAX } from "@/lib/reviews";
import { CheckIcon, Glyph, PrimaryButton } from "./session-ui";

type ReviewView = { id: string; rating: number; comment: string | null; createdAt: string; editable: boolean };
type State = { canReview: boolean; reason: string | null; review: ReviewView | null };

const STAR_PATH = "M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8L12 3.2Z";
const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

export function Star({ filled, className = "h-5 w-5" }: { filled: boolean; className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} ${filled ? "fill-amber-400 text-amber-500" : "fill-transparent text-[#cfc3ba]"}`} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d={STAR_PATH} /></svg>;
}

/** Five tappable stars. Works with the keyboard (arrows) and announces itself as a radio group. */
export function StarInput({ value, onChange, disabled = false, size = "h-9 w-9" }: { value: number; onChange: (rating: number) => void; disabled?: boolean; size?: string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div role="radiogroup" aria-label="Rating" className="inline-flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}, ${WORDS[n]}`}
          title={WORDS[n]}
          disabled={disabled}
          tabIndex={value === n || (value === 0 && n === 1) ? 0 : -1}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); onChange(Math.min(5, (value || 0) + 1)); }
            else if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); onChange(Math.max(1, (value || 2) - 1)); }
          }}
          className={`flex items-center justify-center rounded-full transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:opacity-60 ${size}`}
        >
          <Star filled={n <= shown} className="h-full w-full p-1" />
        </button>
      ))}
    </div>
  );
}

/** Rate a completed session: tap stars, optionally say more. One review per arrangement; editable for a while. */
export default function ReviewForm({ sessionId, onSaved }: { sessionId: string; onSaved?: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/student/sessions/${encodeURIComponent(sessionId)}/review`, { cache: "no-store", signal });
      if (!response.ok) return;
      setState(await response.json() as State);
    } catch { /* The review box simply stays hidden if this fails. */ }
  }, [sessionId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function save() {
    if (busy || rating < 1) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/student/sessions/${encodeURIComponent(sessionId)}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setError(body.error || "We couldn't save your review."); return; }
      setEditing(false);
      await load();
      onSaved?.();
    } catch { setError("Couldn't reach TXMate. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  if (!state) return null;
  const review = state.review;
  const showForm = (state.canReview && !review) || editing;
  if (!showForm && !review) return null;

  return (
    <section aria-label="Your review" className="mt-5 border-t border-[#f0e9e4] pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#282321]">{review && !editing ? "Your review" : "How was this session?"}</h3>
        {review && !editing && review.editable && (
          <button type="button" onClick={() => { setRating(review.rating); setComment(review.comment ?? ""); setEditing(true); }} aria-label="Edit your review" title="Edit" className="flex h-9 w-9 items-center justify-center rounded-full text-[#7a6f6a] hover:bg-[#f4f0ec] hover:text-[#7d1f2a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"><Glyph name="edit" className="h-4 w-4" /></button>
        )}
      </div>

      {showForm ? (
        <div className="mt-2">
          <div className="flex items-center gap-3">
            <StarInput value={rating} onChange={setRating} disabled={busy} />
            <span className="text-xs font-medium text-[#756b65]" aria-live="polite">{rating > 0 ? WORDS[rating] : "Tap a star"}</span>
          </div>
          {rating > 0 && (
            <div className="mt-3">
              <label htmlFor={`review-${sessionId}`} className="sr-only">Comment (optional)</label>
              <textarea id={`review-${sessionId}`} value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={REVIEW_COMMENT_MAX} placeholder="Say more (optional). What went well? Everyone can see this on their profile." className="w-full resize-y rounded-lg border border-[#ded4cd] px-3 py-2 text-sm outline-none placeholder:text-[#a79b92] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10" />
              <p className="mt-1 text-right text-[11px] tabular-nums text-[#9a8e86]">{comment.length}/{REVIEW_COMMENT_MAX}</p>
            </div>
          )}
          {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <PrimaryButton disabled={busy || rating < 1} onClick={() => void save()}><CheckIcon />{busy ? "Saving…" : review ? "Save changes" : "Submit review"}</PrimaryButton>
            {editing && <button type="button" onClick={() => { setEditing(false); setError(""); }} aria-label="Cancel editing" title="Cancel" className="flex h-11 w-11 items-center justify-center rounded-full text-[#625954] hover:bg-[#f4f0ec] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"><Glyph name="x" className="h-5 w-5" /></button>}
          </div>
        </div>
      ) : review ? (
        <div className="mt-2">
          <div className="flex items-center gap-0.5" role="img" aria-label={`You rated ${review.rating} out of 5`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} filled={n <= review.rating} />)}</div>
          {review.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#514844]">{review.comment}</p>}
        </div>
      ) : null}
    </section>
  );
}
