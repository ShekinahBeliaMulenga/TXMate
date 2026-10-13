"use client";

import { useEffect, useState } from "react";

type BookingSlot = {
  start: string;
  end: string;
  timezone: string;
  localDate: string | null;
  localStart: string | null;
  localEnd: string | null;
};

type SlotsResponse = {
  slots?: BookingSlot[];
  error?: string;
};

type BookingResponse = {
  message?: string;
  error?: string;
};

type SessionBookingDialogProps = {
  requestId: string;
  courseLabel: string;
  onClose: () => void;
  onBooked: () => void | Promise<void>;
};

function formatSlotDate(value: string | null) {
  if (!value) return "Date unavailable";

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

export default function SessionBookingDialog({
  requestId,
  courseLabel,
  onClose,
  onBooked,
}: SessionBookingDialogProps) {
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [selectedStart, setSelectedStart] = useState("");
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadSlots() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/student/mate-requests/${encodeURIComponent(requestId)}/booking`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: controller.signal,
          },
        );

        const body = (await response.json()) as SlotsResponse;

        if (!response.ok) {
          throw new Error(body.error || "Unable to load available slots.");
        }

        const availableSlots = Array.isArray(body.slots)
          ? body.slots
          : [];

        setSlots(availableSlots);
        setSelectedStart((current) =>
          availableSlots.some((slot) => slot.start === current)
            ? current
            : "",
        );
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load available slots.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadSlots();

    return () => controller.abort();
  }, [requestId]);

  async function handleBooking() {
    if (!selectedStart || booking) return;

    setBooking(true);
    setError("");

    try {
      const response = await fetch(
        `/api/student/mate-requests/${encodeURIComponent(requestId)}/booking`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scheduledStart: selectedStart,
          }),
        },
      );

      const body = (await response.json()) as BookingResponse;

      if (!response.ok) {
        throw new Error(body.error || "Unable to book this session.");
      }

      setSuccess(body.message || "Session booked successfully.");
      await onBooked();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to book this session.",
      );
    } finally {
      setBooking(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !booking) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-dialog-title"
        className="my-auto w-full max-w-lg rounded-lg border border-[#e2d9d0] bg-white p-4 shadow-xl sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="booking-dialog-title"
              className="text-base font-semibold text-[#282321]"
            >
              Book a session
            </h2>
            <p className="mt-1 text-xs text-[#6d6260]">{courseLabel}</p>
          </div>

          <button
            type="button"
            disabled={booking}
            onClick={onClose}
            aria-label="Close booking dialog"
            className="rounded-md px-2 py-1 text-lg leading-none text-[#6d6260] hover:bg-[#f7f4f0] disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-sm leading-5 text-[#625954]">
          Choose an available time. Times are shown in the Academic Mate&apos;s
          availability timezone.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-800"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800"
          >
            {success}
          </p>
        )}

        <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
          {loading ? (
            <p role="status" className="py-8 text-center text-sm text-[#6d6260]">
              Loading available times...
            </p>
          ) : slots.length === 0 ? (
            <div className="rounded-md border border-[#e2d9d0] bg-[#fcfbfa] px-3 py-6 text-center">
              <p className="text-sm font-medium text-[#282321]">
                No available sessions
              </p>
              <p className="mt-1 text-xs leading-5 text-[#6d6260]">
                There are no bookable slots. You can check
                again later.
              </p>
            </div>
          ) : (
            slots.map((slot) => {
              const selected = selectedStart === slot.start;

              return (
                <label
                  key={slot.start}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                    selected
                      ? "border-[#7d1f2a] bg-[#fbf4f4]"
                      : "border-[#e2d9d0] hover:bg-[#fcfbfa]"
                  }`}
                >
                  <input
                    type="radio"
                    name="session-slot"
                    value={slot.start}
                    checked={selected}
                    onChange={() => setSelectedStart(slot.start)}
                    disabled={booking}
                    className="mt-1 accent-[#7d1f2a]"
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[#282321]">
                      {formatSlotDate(slot.localDate)}
                    </span>
                    <span className="mt-1 block text-xs text-[#625954]">
                      {slot.localStart ?? "Time unavailable"} to{" "}
                      {slot.localEnd ?? "Time unavailable"}
                    </span>
                    <span className="mt-1 block break-all text-[11px] text-[#8a7f7a]">
                      {slot.timezone}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={booking}
            onClick={onClose}
            className="rounded-md border border-[#d8cec5] px-3 py-2 text-xs font-medium text-[#625954] hover:bg-[#f7f4f0] disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading || booking || !selectedStart || slots.length === 0}
            onClick={() => void handleBooking()}
            className="rounded-md bg-[#7d1f2a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#681923] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {booking ? "Booking..." : "Confirm booking"}
          </button>
        </div>
      </section>
    </div>
  );
}