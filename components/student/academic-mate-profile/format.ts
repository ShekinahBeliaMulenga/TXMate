import type { AcademicMateStatus, MateOfferingRateType, VerificationStatus, Weekday } from "./types";

export const statusLabel: Record<AcademicMateStatus, string> = { ACTIVE: "Active", INACTIVE: "Inactive", SUSPENDED: "Suspended" };
export const statusDot: Record<AcademicMateStatus, string> = { ACTIVE: "bg-emerald-500", INACTIVE: "bg-stone-400", SUSPENDED: "bg-amber-500" };

export const verificationLabel: Record<VerificationStatus, string> = {
  UNVERIFIED: "Unverified",
  PENDING: "Verification pending",
  VERIFIED: "Verified",
  REJECTED: "Verification rejected",
};
export const verificationStyle: Record<VerificationStatus, string> = {
  UNVERIFIED: "bg-stone-100 text-stone-700 ring-stone-200",
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  VERIFIED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-red-50 text-red-800 ring-red-200",
};

export const rateTypeLabel: Record<MateOfferingRateType, string> = {
  PER_SESSION: "per session",
  PER_HOUR: "per hour",
  PER_WEEK: "per week",
  PER_MONTH: "per month",
  PER_COURSE: "per course",
  CUSTOM: "custom rate",
};

export const weekdayLabel: Record<Weekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};
export const weekdayOrder: readonly Weekday[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "TM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours % 12 || 12}:${String(mins).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function formatStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

/** "1+ yr" style label for the stats row. */
export function experienceShort(years: number | null) {
  if (years === null) return "—";
  return `${years} ${years === 1 ? "yr" : "yrs"}`;
}

export function reviewsLabel(count: number) {
  return `${count} ${count === 1 ? "review" : "reviews"}`;
}
