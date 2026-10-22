"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type BookingSlot = {
  start: string;
  end: string;
  timezone: string;
  localDate: string;
  localStart: string;
  localEnd: string;
};

type SlotsResponse = { slots?: BookingSlot[]; error?: string };
type RequestResponse = {
  message?: string;
  error?: string;
  request?: { id: string; status: string };
};

type ArrangementType = "ONE_TIME" | "RECURRING";

export type SessionRequestOffering = {
  id: string;
  course: { code: string; name: string };
  title: string | null;
  rate: string;
  currency: string;
  rateType: string;
  sessionDurationMinutes: number;
  academicMateName: string;
};

type Props = {
  offering: SessionRequestOffering;
  onClose: () => void;
  onSubmitted: (request: { id: string; status: string }) => void;
};

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZM", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatMoney(value: string, currency: string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${currency} ${amount.toLocaleString("en-ZM", { maximumFractionDigits: 2 })}`
    : `${currency} ${value}`;
}

export default function SessionRequestDialog({ offering, onClose, onSubmitted }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [selectedStart, setSelectedStart] = useState("");
  const [message, setMessage] = useState("");
  const [arrangementType, setArrangementType] = useState<ArrangementType>("ONE_TIME");
  const [recurrenceEveryWeeks, setRecurrenceEveryWeeks] = useState("1");
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const loadSlots = useCallback(async (signal?: AbortSignal) => {
    setLoadingSlots(true);
    setError("");
    try {
      const response = await fetch(
        `/api/student/mate-requests/availability?offeringId=${encodeURIComponent(offering.id)}`,
        { method: "GET", cache: "no-store", headers: { Accept: "application/json" }, signal },
      );
      const body = (await response.json().catch(() => ({}))) as SlotsResponse;
      if (!response.ok) throw new Error(body.error || "Unable to load available times.");
      const nextSlots = Array.isArray(body.slots) ? body.slots : [];
      setSlots(nextSlots);
      setSelectedStart((current) => nextSlots.some((slot) => slot.start === current) ? current : "");
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Unable to load available times.");
    } finally {
      if (!signal?.aborted) setLoadingSlots(false);
    }
  }, [offering.id]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSlots(controller.signal); // eslint-disable-line react-hooks/set-state-in-effect
    return () => controller.abort();
  }, [loadSlots]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStart || submitting || !slots.some((slot) => slot.start === selectedStart)) return;
    if (message.trim().length > 1000) {
      setError("Your message must be 1,000 characters or fewer.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/student/mate-requests", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          offeringId: offering.id,
          message: message.trim() || null,
          requestedStart: selectedStart,
          arrangementType,
          recurrenceEveryWeeks: arrangementType === "RECURRING" ? Number(recurrenceEveryWeeks) : null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as RequestResponse;
      if (!response.ok) {
        if (response.status === 409) await loadSlots();
        throw new Error(body.error || "Unable to submit your request. Please try again.");
      }
      if (!body.request?.id || !body.request.status) {
        throw new Error("The request response was incomplete. Refresh your requests before trying again.");
      }
      onSubmitted({ id: body.request.id, status: body.request.status });
      setSuccess(body.message || "Your request and proposed first session have been sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit your request.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedSlot = slots.find((slot) => slot.start === selectedStart) ?? null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="session-request-title"
      onClose={onClose}
      onCancel={(event) => { if (submitting) event.preventDefault(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !submitting) event.currentTarget.close(); }}
      className="fixed inset-0 m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-[#e2d9d0] bg-white p-0 text-[#282321] shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#eee7df] px-4 py-3">
        <div>
          <h2 id="session-request-title" className="text-base font-semibold tracking-tight">Request support and choose a first session</h2>
          <p className="mt-1 text-xs text-[#6d6260]">Send one request to {offering.academicMateName}. If accepted, the proposed first session is scheduled automatically.</p>
        </div>
        <button type="button" aria-label="Close request form" disabled={submitting} onClick={() => dialogRef.current?.close()} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#6d6260] hover:bg-[#f6f1ec] disabled:opacity-50">×</button>
      </div>

      <div className="space-y-4 px-4 py-4">
        <section aria-label="Selected offering" className="rounded-lg border border-[#efe8e1] bg-[#fbf8f6] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#7d1f2a]">{offering.course.code}</p>
              <h3 className="text-sm font-semibold text-[#282321]">{offering.course.name}</h3>
              {offering.title && <p className="mt-0.5 text-xs text-[#6d6260]">{offering.title}</p>}
              <p className="mt-1 text-[11px] text-[#6d6260]">{offering.sessionDurationMinutes} minute session · {offering.rateType.toLowerCase().replace(/_/g, " ")}</p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-[#282321]">{formatMoney(offering.rate, offering.currency)}</p>
          </div>
        </section>

        {!success ? (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <div>
              <label htmlFor="first-session-slot" className="block text-xs font-semibold text-[#282321]">Choose the first session time</label>
              <p id="first-session-help" className="mt-1 text-[11px] leading-4 text-[#6d6260]">Times are shown in the Academic Mate&apos;s availability timezone. Only available, non-conflicting slots are listed.</p>
              <select
                id="first-session-slot"
                value={selectedStart}
                onChange={(event) => setSelectedStart(event.target.value)}
                disabled={loadingSlots || slots.length === 0 || submitting}
                required
                aria-describedby="first-session-help"
                className="mt-2 min-h-10 w-full rounded-md border border-[#d8cec5] bg-white px-3 py-2 text-sm outline-none focus:border-[#7d1f2a] disabled:bg-[#faf8f6]"
              >
                <option value="">{loadingSlots ? "Loading available times…" : slots.length ? "Select a date and time" : "No available times"}</option>
                {slots.map((slot) => (
                  <option key={slot.start} value={slot.start}>
                    {formatDate(slot.localDate)} · {slot.localStart}–{slot.localEnd} ({slot.timezone})
                  </option>
                ))}
              </select>
              {loadingSlots && <p role="status" className="mt-1.5 text-xs text-[#6d6260]">Checking the Academic Mate&apos;s current availability…</p>}
              {!loadingSlots && slots.length === 0 && !error && <p className="mt-1.5 text-xs text-amber-800">There are no available times in the next 30 days, so a request cannot be submitted yet.</p>}
              {selectedSlot && <p className="mt-1.5 text-[11px] text-[#6d6260]">Proposed first session: {formatDate(selectedSlot.localDate)}, {selectedSlot.localStart}–{selectedSlot.localEnd} · {selectedSlot.timezone}</p>}
            </div>

            <div className="space-y-3 rounded-lg border border-[#efe8e1] p-3">
              <div>
                <label htmlFor="arrangement-type" className="block text-xs font-semibold text-[#282321]">Tutoring arrangement</label>
                <select
                  id="arrangement-type"
                  value={arrangementType}
                  onChange={(event) => {
                    const next = event.target.value === "RECURRING" ? "RECURRING" : "ONE_TIME";
                    setArrangementType(next);
                  }}
                  disabled={submitting}
                  className="mt-2 min-h-10 w-full rounded-md border border-[#d8cec5] bg-white px-3 py-2 text-sm outline-none focus:border-[#7d1f2a] disabled:bg-[#faf8f6]"
                >
                  <option value="ONE_TIME">One-time session</option>
                  <option value="RECURRING">Recurring sessions</option>
                </select>
              </div>

              {arrangementType === "RECURRING" && (
                <>
                  <div>
                    <label htmlFor="recurrence-frequency" className="block text-xs font-semibold text-[#282321]">Repeat</label>
                    <select
                      id="recurrence-frequency"
                      value={recurrenceEveryWeeks}
                      onChange={(event) => setRecurrenceEveryWeeks(event.target.value)}
                      disabled={submitting}
                      className="mt-2 min-h-10 w-full rounded-md border border-[#d8cec5] bg-white px-3 py-2 text-sm outline-none focus:border-[#7d1f2a] disabled:bg-[#faf8f6]"
                    >
                      <option value="1">Every week</option>
                      <option value="2">Every 2 weeks</option>
                      <option value="3">Every 3 weeks</option>
                      <option value="4">Every 4 weeks</option>
                    </select>
                  </div>
                  {selectedSlot && <p className="rounded-md bg-[#fbf8f6] p-2 text-[11px] leading-4 text-[#625954]">Repeats every {recurrenceEveryWeeks} week{recurrenceEveryWeeks === "1" ? "" : "s"}, on the same weekday and at {selectedSlot.localStart} ({selectedSlot.timezone}). Future sessions use the same local weekday and time as your first session.</p>}
                </>
              )}
            </div>

            <div>
              <label htmlFor="session-request-message" className="block text-xs font-semibold text-[#282321]">Message <span className="font-normal text-[#8a7f7a]">(optional)</span></label>
              <p id="session-request-message-help" className="mt-1 text-[11px] text-[#6d6260]">Describe the topics you need help with or include relevant details.</p>
              <textarea id="session-request-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} rows={3} disabled={submitting} placeholder="Hello, I would like help understanding…" className="mt-2 w-full resize-y rounded-md border border-[#d8cec5] bg-white px-3 py-2 text-sm leading-5 outline-none focus:border-[#7d1f2a] disabled:bg-[#faf8f6]" />
              <p className="mt-1 text-right text-[10px] text-[#8a7f7a]">{message.length}/1000</p>
            </div>

            {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">{error}</div>}

            <p className="rounded-md border border-[#efe8e1] bg-[#fbf8f6] p-3 text-[11px] leading-5 text-[#625954]">This sends the support request and proposed first session together. The Academic Mate must accept before sessions are confirmed. For recurring arrangements, the selected weekly pattern is checked for conflicts before the request is sent; future sessions are added as they enter the 30-day scheduling window.</p>

            <div className="flex flex-col-reverse gap-2 border-t border-[#eee7df] pt-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={submitting} onClick={() => dialogRef.current?.close()} className="min-h-9 rounded-md border border-[#d8cec5] bg-white px-4 py-2 text-xs font-semibold text-[#4b423e] hover:bg-[#faf8f6] disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={submitting || loadingSlots || !selectedStart || slots.length === 0} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-[#7d1f2a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#681923] disabled:cursor-not-allowed disabled:opacity-50">
                {submitting && <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {submitting ? "Sending request…" : "Send request"}
              </button>
            </div>
          </form>
        ) : (
          <div aria-live="polite" className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <h3 className="text-sm font-semibold text-emerald-900">Request submitted</h3>
              <p className="mt-1 text-sm leading-5 text-emerald-800">{success}</p>
              <p className="mt-2 text-xs leading-5 text-emerald-800">The Academic Mate will review your request and proposed first-session time. You will not need to book that first session separately after acceptance.</p>
            </div>
            <div className="flex justify-end border-t border-[#eee7df] pt-3">
              <button type="button" onClick={() => dialogRef.current?.close()} className="min-h-9 rounded-md bg-[#7d1f2a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#681923]">Done</button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
