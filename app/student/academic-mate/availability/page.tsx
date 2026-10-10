"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Weekday = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";

type Offering = {
  id: string;
  course: { id: string; code: string; name: string };
  title: string | null;
  rate: string | number;
  currency: string;
  rateType: string;
  rateDetails: string | null;
  sessionDurationMinutes: number;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  verificationStatus: string;
};

type Availability = {
  id: string;
  mateOfferingId: string;
  day: Weekday;
  startMinute: number;
  endMinute: number;
  timezone: string;
  isActive: boolean;
  mateOffering?: {
    id: string;
    title: string | null;
    sessionDurationMinutes: number;
    course: { id: string; code: string; name: string };
  } | null;
};

type ApiResponse<T> = { data?: T; offerings?: T; availability?: T; error?: string; message?: string };

type View = "schedule" | "form";

const DAYS: { value: Weekday; label: string; short: string }[] = [
  { value: "MONDAY", label: "Monday", short: "Mon" },
  { value: "TUESDAY", label: "Tuesday", short: "Tue" },
  { value: "WEDNESDAY", label: "Wednesday", short: "Wed" },
  { value: "THURSDAY", label: "Thursday", short: "Thu" },
  { value: "FRIDAY", label: "Friday", short: "Fri" },
  { value: "SATURDAY", label: "Saturday", short: "Sat" },
  { value: "SUNDAY", label: "Sunday", short: "Sun" },
];

const ICONS = {
  back: "M10 19l-7-7m0 0l7-7m-7 7h18",
  plus: "M12 5v14M5 12h14",
  edit: "M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z",
  trash: "M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12M10 11v6m4-6v6",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
  alert: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  check: "M12 21a9 9 0 100-18 9 9 0 000 18zM8.5 12l2.3 2.3 4.7-5",
} as const;

type IconName = keyof typeof ICONS;

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ICONS[name]} />
    </svg>
  );
}

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2";
const INPUT =
  "w-full rounded-lg border border-[#d9cec5] bg-white px-3.5 py-2.5 text-sm text-[#282321] outline-none transition focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10";

function minuteToTime(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToMinute(value: string): number {
  if (!value || !value.includes(":")) return Number.NaN;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours}h ${remainingMinutes}m`;
}

function getDayLabel(day: Weekday): string {
  return DAYS.find((item) => item.value === day)?.label ?? day;
}

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lusaka";
  } catch {
    return "Africa/Lusaka";
  }
}

async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    return { error: "The server returned an unexpected response." };
  }
}

export default function AcademicMateAvailabilityPage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [view, setView] = useState<View>("schedule");

  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [selectedDay, setSelectedDay] = useState<Weekday>("MONDAY");
  const [startTime, setStartTime] = useState("15:00");
  const [timezone, setTimezone] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedOffering = useMemo(
    () => offerings.find((offering) => offering.id === selectedOfferingId),
    [offerings, selectedOfferingId]
  );

  const calculatedEndTime = useMemo(() => {
    if (!selectedOffering || !startTime) return "";
    const startMinute = timeToMinute(startTime);
    if (Number.isNaN(startMinute)) return "";
    const endMinute = startMinute + selectedOffering.sessionDurationMinutes;
    if (endMinute > 1440) return "";
    return minuteToTime(endMinute);
  }, [selectedOffering, startTime]);

  const groupedAvailability = useMemo(() => {
    const groups = new Map<string, Availability[]>();
    for (const item of availability) {
      const existing = groups.get(item.mateOfferingId) ?? [];
      existing.push(item);
      groups.set(item.mateOfferingId, existing);
    }
    return Array.from(groups.entries());
  }, [availability]);

  const activeSlotsCount = useMemo(() => availability.filter((item) => item.isActive).length, [availability]);
  const inactiveSlotsCount = availability.length - activeSlotsCount;

  useEffect(() => {
    setTimezone(getBrowserTimezone());
    void loadData();
  }, []);

  async function loadData(showLoader = true) {
    if (showLoader) setLoading(true);
    setError("");

    try {
      const [offeringsResponse, availabilityResponse] = await Promise.all([
        fetch("/api/student/academic-mate/offerings", { credentials: "include", cache: "no-store" }),
        fetch("/api/student/academic-mate/availability", { credentials: "include", cache: "no-store" }),
      ]);

      const offeringsJson = await readJson<Offering[]>(offeringsResponse);
      const availabilityJson = await readJson<Availability[]>(availabilityResponse);

      if (!offeringsResponse.ok) throw new Error(offeringsJson.error || "Failed to load your offerings.");
      if (!availabilityResponse.ok) throw new Error(availabilityJson.error || "Failed to load your availability.");

      const loadedOfferings = offeringsJson.data ?? offeringsJson.offerings ?? [];
      const loadedAvailability = availabilityJson.data ?? availabilityJson.availability ?? [];

      setOfferings(Array.isArray(loadedOfferings) ? loadedOfferings : []);
      setAvailability(Array.isArray(loadedAvailability) ? loadedAvailability : []);

      if (!selectedOfferingId && Array.isArray(loadedOfferings) && loadedOfferings.length > 0) {
        const activeOffering = loadedOfferings.find((offering) => offering.status === "ACTIVE");
        setSelectedOfferingId(activeOffering?.id ?? loadedOfferings[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong while loading availability.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm(clearMessages = true) {
    setEditingId(null);
    const firstActiveOffering = offerings.find((offering) => offering.status === "ACTIVE");
    setSelectedOfferingId(firstActiveOffering?.id ?? "");
    setSelectedDay("MONDAY");
    setStartTime("15:00");
    setTimezone(getBrowserTimezone());
    if (clearMessages) {
      setError("");
      setSuccess("");
    }
  }

  function beginEdit(item: Availability) {
    setEditingId(item.id);
    setSelectedOfferingId(item.mateOfferingId);
    setSelectedDay(item.day);
    setStartTime(minuteToTime(item.startMinute));
    setTimezone(item.timezone);
    setError("");
    setSuccess("");
    setView("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: View = view === "schedule" ? "form" : "schedule";
    setView(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedOfferingId) return setError("Select an offering.");
    if (!selectedOffering) return setError("The selected offering could not be found.");

    const startMinute = timeToMinute(startTime);
    if (Number.isNaN(startMinute) || startMinute < 0 || startMinute > 1439) {
      return setError("Enter a valid start time.");
    }

    const endMinute = startMinute + selectedOffering.sessionDurationMinutes;
    if (endMinute > 1440) return setError("This start time does not leave enough time for the full session.");
    if (!timezone.trim()) return setError("A valid timezone is required.");

    setSaving(true);

    try {
      const payload = {
        mateOfferingId: selectedOfferingId,
        day: selectedDay,
        startMinute,
        endMinute,
        timezone: timezone.trim(),
      };
      const wasEditing = Boolean(editingId);
      const url = editingId
        ? `/api/student/academic-mate/availability/${editingId}`
        : "/api/student/academic-mate/availability";

      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await readJson<Availability>(response);
      if (!response.ok) throw new Error(json.error || json.message || "Failed to save availability.");

      await loadData(false);
      resetForm(false);
      setView("schedule");
      setSuccess(wasEditing ? "Availability updated successfully." : "Availability added successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save availability.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(item: Availability) {
    setError("");
    setSuccess("");
    setTogglingId(item.id);

    try {
      const response = await fetch(`/api/student/academic-mate/availability/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const json = await readJson<Availability>(response);
      if (!response.ok) throw new Error(json.error || json.message || "Failed to update availability.");

      setAvailability((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, isActive: !entry.isActive } : entry))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update availability.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(item: Availability) {
    const courseCode =
      item.mateOffering?.course?.code ??
      offerings.find((offering) => offering.id === item.mateOfferingId)?.course.code ??
      "this course";

    const confirmed = window.confirm(
      `Delete the ${getDayLabel(item.day)} ${formatTime(item.startMinute)} availability for ${courseCode}?`
    );
    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingId(item.id);

    try {
      const response = await fetch(`/api/student/academic-mate/availability/${item.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await readJson<unknown>(response);
      if (!response.ok) throw new Error(json.error || json.message || "Failed to delete availability.");

      setAvailability((current) => current.filter((entry) => entry.id !== item.id));
      if (editingId === item.id) resetForm();
      setSuccess("Availability deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete availability.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f4f1ed] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="h-5 w-40 animate-pulse rounded bg-[#e8e0d8]" />
          <div className="mt-6 h-8 w-56 animate-pulse rounded bg-[#e8e0d8]" />
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="h-72 animate-pulse rounded-xl border border-[#e2d9d0] bg-white" />
            <div className="h-96 animate-pulse rounded-xl border border-[#e2d9d0] bg-white" />
          </div>
        </div>
      </main>
    );
  }

  const canSubmit = !saving && !!selectedOfferingId && !!calculatedEndTime;
  const startMinuteNow = timeToMinute(startTime);

  const tabs: { id: View; label: string; count: number | null }[] = [
    { id: "schedule", label: "Your schedule", count: availability.length },
    { id: "form", label: editingId ? "Edit slot" : "Add slot", count: null },
  ];

  return (
    <main className="min-h-screen bg-[#f4f1ed] text-[#282321]">
      <div className="mx-auto max-w-6xl px-6 py-2 sm:px-6 lg:px-8">
        <header>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Availability</h1>
          <p className="mt-1 text-sm text-[#6d6260]">Set the weekly times students can book sessions with you.</p>

          {availability.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#6d6260]">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
                <strong className="font-semibold text-emerald-800">{activeSlotsCount}</strong> active
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#b9b0a8]" />
                <strong className="font-semibold text-[#5f5650]">{inactiveSlotsCount}</strong> inactive
              </span>
              <span>
                across <strong className="font-semibold text-[#3f3734]">{groupedAvailability.length}</strong>{" "}
                {groupedAvailability.length === 1 ? "course" : "courses"}
              </span>
            </p>
          )}
        </header>

        <div aria-live="polite" className="mt-6 space-y-3 empty:hidden">
          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              {error}
            </div>
          )}
          {success && (
            <div role="status" className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              {success}
            </div>
          )}
        </div>

        {offerings.length === 0 ? (
          <section className="mt-6 flex flex-col items-center rounded-xl border border-[#e2d9d0] bg-white px-6 py-12 text-center shadow-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7d1f2a]/10 text-[#7d1f2a]">
              <Icon name="plus" className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Add a course first</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#6d6260]">
              Availability is linked to the courses you offer. Add a course, then come back to set your times.
            </p>
            <Link href="/student/academic-mate/offerings" className={`mt-6 rounded-lg bg-[#7d1f2a] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#681a23] ${FOCUS}`}>
              Manage courses
            </Link>
          </section>
        ) : (
          <>
            {/* Tabs */}
            <div
              role="tablist"
              aria-label="Availability sections"
              onKeyDown={handleTabKeyDown}
              className="mt-6 flex w-full gap-1 rounded-xl border border-[#e2d9d0] bg-white p-1 shadow-sm sm:inline-flex sm:w-auto"
            >
              {tabs.map((tab) => {
                const selected = view === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setView(tab.id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${FOCUS} ${
                      selected ? "bg-[#7d1f2a] text-white shadow-sm" : "text-[#514b46] hover:bg-[#f6f1ec]"
                    }`}
                  >
                    {tab.label}
                    {tab.count !== null && tab.count > 0 ? (
                      <span
                        className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                          selected ? "bg-white/20 text-white" : "bg-[#7d1f2a]/10 text-[#7d1f2a]"
                        }`}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              {/* Form */}
              {view === "form" && (
                <div role="tabpanel" id="panel-form" aria-labelledby="tab-form" className="max-w-xl">
                  <aside id="slot-form">
                    <section className={`overflow-hidden rounded-xl border bg-white shadow-sm ${editingId ? "border-[#7d1f2a] ring-2 ring-[#7d1f2a]/10" : "border-[#e2d9d0]"}`}>
                      <div className="flex items-center justify-between gap-3 border-b border-[#ece5de] bg-[#fbf9f7] px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7d1f2a]/10 text-[#7d1f2a]">
                            <Icon name={editingId ? "edit" : "plus"} />
                          </span>
                          <h2 className="text-[15px] font-semibold">{editingId ? "Edit time slot" : "Add a time slot"}</h2>
                        </div>
                        {editingId && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Editing</span>}
                      </div>

                      <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
                        <div>
                          <label htmlFor="offering" className="mb-1.5 block text-sm font-semibold text-[#3f3734]">Course</label>
                          <select
                            id="offering"
                            value={selectedOfferingId}
                            onChange={(event) => {
                              setSelectedOfferingId(event.target.value);
                              setError("");
                            }}
                            className={INPUT}
                          >
                            <option value="">Select a course</option>
                            {offerings
                              .filter((offering) => offering.status === "ACTIVE" || offering.id === selectedOfferingId)
                              .map((offering) => (
                                <option key={offering.id} value={offering.id}>
                                  {offering.course.code} – {offering.course.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        <fieldset>
                          <legend className="mb-1.5 text-sm font-semibold text-[#3f3734]">Day</legend>
                          <div className="grid grid-cols-7 gap-1">
                            {DAYS.map((day) => {
                              const selected = selectedDay === day.value;
                              return (
                                <button
                                  key={day.value}
                                  type="button"
                                  aria-pressed={selected}
                                  aria-label={day.label}
                                  onClick={() => setSelectedDay(day.value)}
                                  className={`rounded-lg py-2 text-xs font-semibold transition ${FOCUS} ${
                                    selected ? "bg-[#7d1f2a] text-white shadow-sm" : "border border-[#e2d9d0] bg-white text-[#514b46] hover:bg-[#f6f1ec]"
                                  }`}
                                >
                                  {day.short}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="startTime" className="mb-1.5 block text-sm font-semibold text-[#3f3734]">Start</label>
                            <input
                              id="startTime"
                              type="time"
                              value={startTime}
                              onChange={(event) => {
                                setStartTime(event.target.value);
                                setError("");
                              }}
                              className={INPUT}
                            />
                          </div>
                          <div>
                            <label htmlFor="endTime" className="mb-1.5 block text-sm font-semibold text-[#3f3734]">End</label>
                            <input id="endTime" type="time" value={calculatedEndTime} readOnly className="w-full cursor-not-allowed rounded-lg border border-[#e2d9d0] bg-[#f8f5f2] px-3.5 py-2.5 text-sm text-[#6d6260] outline-none" />
                          </div>
                        </div>

                        {selectedOffering && (
                          <p className="flex items-start gap-2 rounded-lg bg-[#f6f1ec] px-3.5 py-2.5 text-xs leading-5 text-[#6d6260]">
                            <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-[#7d1f2a]" />
                            <span>
                              {formatDuration(selectedOffering.sessionDurationMinutes)} per session
                              {calculatedEndTime && !Number.isNaN(startMinuteNow)
                                ? `, ${formatTime(startMinuteNow)} to ${formatTime(startMinuteNow + selectedOffering.sessionDurationMinutes)}`
                                : ". Choose an earlier start so the session fits in the day."}
                            </span>
                          </p>
                        )}

                        <div>
                          <label htmlFor="timezone" className="mb-1.5 block text-sm font-semibold text-[#3f3734]">Timezone</label>
                          <input id="timezone" type="text" value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Africa/Lusaka" className={INPUT} />
                          <p className="mt-1.5 text-xs text-[#7a6f6a]">Students see times converted from this timezone.</p>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button type="submit" disabled={!canSubmit} className={`flex-1 rounded-lg bg-[#7d1f2a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#681a23] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}>
                            {saving ? "Saving..." : editingId ? "Update slot" : "Add slot"}
                          </button>
                          {editingId && (
                            <button
                              type="button"
                              onClick={() => {
                                resetForm();
                                setView("schedule");
                              }}
                              className={`rounded-lg border border-[#d9cec5] bg-white px-4 py-2.5 text-sm font-medium text-[#514b46] hover:bg-[#f6f1ec] ${FOCUS}`}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </form>
                    </section>
                  </aside>
                </div>
              )}

              {/* Schedule */}
              {view === "schedule" && (
                <div role="tabpanel" id="panel-schedule" aria-labelledby="tab-schedule">
                  <section className="min-w-0" aria-labelledby="schedule-title">
                    <div className="mb-3">
                      <h2 id="schedule-title" className="text-lg font-semibold">Your schedule</h2>
                      <p className="mt-0.5 text-sm text-[#6d6260]">Students can only book slots marked active.</p>
                    </div>

                    {groupedAvailability.length === 0 ? (
                      <div className="flex flex-col items-center rounded-xl border border-dashed border-[#d8cec5] bg-white px-6 py-12 text-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7d1f2a]/10 text-[#7d1f2a]">
                          <Icon name="calendar" className="h-6 w-6" />
                        </span>
                        <p className="mt-3 text-sm font-medium">No time slots yet</p>
                        <p className="mt-1 max-w-xs text-sm text-[#6d6260]">Use the form to add your first weekly slot.</p>
                        <button
                          type="button"
                          onClick={() => setView("form")}
                          className={`mt-5 rounded-lg bg-[#7d1f2a] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#681a23] ${FOCUS}`}
                        >
                          Add a slot
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {groupedAvailability.map(([offeringId, entries]) => {
                          const fallback = offerings.find((offering) => offering.id === offeringId);
                          const course = entries[0].mateOffering?.course ?? fallback?.course;
                          const title = entries[0].mateOffering?.title ?? fallback?.title ?? null;
                          const duration = entries[0].mateOffering?.sessionDurationMinutes ?? fallback?.sessionDurationMinutes;
                          const activeInGroup = entries.filter((entry) => entry.isActive).length;

                          const dayOrder = DAYS.map((day) => day.value);
                          const sortedEntries = [...entries].sort((a, b) => {
                            const dayDifference = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
                            return dayDifference !== 0 ? dayDifference : a.startMinute - b.startMinute;
                          });

                          return (
                            <div key={offeringId} className="overflow-hidden rounded-xl border border-[#e2d9d0] bg-white shadow-sm">
                              <div className="flex items-center justify-between gap-3 border-b border-[#ece5de] bg-[#fbf9f7] px-5 py-3.5">
                                <div className="flex min-w-0 items-center gap-3">
                                  <span className="flex h-10 min-w-12 shrink-0 items-center justify-center rounded-lg bg-[#7d1f2a]/10 px-2 text-[11px] font-bold text-[#7d1f2a]">
                                    {course?.code ?? "—"}
                                  </span>
                                  <div className="min-w-0">
                                    <h3 className="truncate text-sm font-semibold">{course?.name ?? "Course"}</h3>
                                    <p className="truncate text-xs text-[#6d6260]">
                                      {title ? `${title} · ` : ""}
                                      {activeInGroup} of {entries.length} active
                                    </p>
                                  </div>
                                </div>
                                {duration !== undefined && (
                                  <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-[#e2d9d0] bg-white px-2.5 py-1 text-xs font-medium text-[#514b46] sm:inline-flex">
                                    <Icon name="clock" className="h-3.5 w-3.5 text-[#7d1f2a]" />
                                    {formatDuration(duration)}
                                  </span>
                                )}
                              </div>

                              <ul className="divide-y divide-[#ece5de]">
                                {sortedEntries.map((item) => {
                                  const isEditing = editingId === item.id;
                                  return (
                                    <li
                                      key={item.id}
                                      className={`flex items-center gap-3 border-l-[3px] px-5 py-3.5 ${
                                        item.isActive ? "border-l-emerald-500" : "border-l-[#d3cbc3] bg-[#f8f6f3]"
                                      } ${isEditing ? "bg-[#fdf7f8]" : ""}`}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p
                                          className={`text-sm font-medium tabular-nums ${
                                            item.isActive ? "text-[#282321]" : "text-[#9a8f88]"
                                          }`}
                                        >
                                          {formatTime(item.startMinute)} – {formatTime(item.endMinute)}
                                        </p>
                                        <p className="truncate text-xs text-[#7a6f6a]">
                                          <span
                                            className={`inline-flex items-center gap-1 font-semibold ${
                                              item.isActive ? "text-emerald-700" : "text-[#8a7f78]"
                                            }`}
                                          >
                                            <span
                                              aria-hidden="true"
                                              className={`h-1.5 w-1.5 rounded-full ${item.isActive ? "bg-emerald-500" : "bg-[#b9b0a8]"}`}
                                            />
                                            {item.isActive ? "Active" : "Inactive"}
                                          </span>
                                          {" · "}
                                          {getDayLabel(item.day)} · {item.timezone}
                                        </p>
                                      </div>

                                      <button
                                        type="button"
                                        role="switch"
                                        aria-checked={item.isActive}
                                        aria-label={`${item.isActive ? "Deactivate" : "Activate"} ${getDayLabel(item.day)} ${formatTime(item.startMinute)}`}
                                        title={item.isActive ? "Active. Click to deactivate" : "Inactive. Click to activate"}
                                        onClick={() => void handleToggle(item)}
                                        disabled={togglingId === item.id}
                                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${FOCUS} ${
                                          item.isActive ? "bg-emerald-600" : "bg-[#cfc7c0]"
                                        }`}
                                      >
                                        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${item.isActive ? "translate-x-5" : ""}`} />
                                      </button>

                                      <div className="flex shrink-0 items-center gap-1">
                                        <button type="button" onClick={() => beginEdit(item)} aria-label="Edit slot" title="Edit" className={`rounded-lg p-2 text-[#6d6260] hover:bg-[#f6f1ec] hover:text-[#7d1f2a] ${FOCUS}`}>
                                          <Icon name="edit" />
                                        </button>
                                        <button type="button" onClick={() => void handleDelete(item)} disabled={deletingId === item.id} aria-label="Delete slot" title="Delete" className={`rounded-lg p-2 text-[#6d6260] hover:bg-red-50 hover:text-red-700 disabled:opacity-50 ${FOCUS}`}>
                                          <Icon name="trash" />
                                        </button>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}