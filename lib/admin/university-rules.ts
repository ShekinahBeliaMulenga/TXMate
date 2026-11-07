/**
 * Pure validation for university records and student-ID rules. No server imports so it is unit tested
 * and shared by the API and the form.
 */

export const UNIVERSITY_NAME_MIN = 3;
export const UNIVERSITY_NAME_MAX = 120;
export const CODE_PATTERN = /^[A-Z0-9]{2,12}$/;
export const PATTERN_MAX = 120;

export function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

export function slugFromCode(code: string): string {
  return code.trim().toLowerCase();
}

export function validateName(value: string): string | null {
  const name = value.trim();
  if (name.length < UNIVERSITY_NAME_MIN || name.length > UNIVERSITY_NAME_MAX) return `Name must be ${UNIVERSITY_NAME_MIN} to ${UNIVERSITY_NAME_MAX} characters.`;
  return null;
}

export function validateCode(value: string): string | null {
  return CODE_PATTERN.test(normalizeCode(value)) ? null : "Code must be 2 to 12 letters or numbers, for example CBU.";
}

/** A regular expression is applied to every student ID typed at sign-up, so it must compile and must not be a ReDoS trap. */
export function validateStudentIdPattern(value: string): string | null {
  if (value.length > PATTERN_MAX) return `The pattern can be at most ${PATTERN_MAX} characters.`;
  try {
    new RegExp(value);
  } catch {
    return "That isn’t a valid pattern.";
  }
  // A quantified group that itself contains a quantifier, such as (a+)+ or (.*)*, can take exponential time.
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(value)) return "That pattern is too complex. Avoid repeating a group that already repeats.";
  return null;
}

export function validateEmailDomain(value: string): string | null {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value.trim().toLowerCase()) ? null : "Enter a domain such as cbu.ac.zm.";
}

export type SettingsInput = {
  studentIdMinLength?: unknown;
  studentIdMaxLength?: unknown;
  studentIdPrefix?: unknown;
  studentIdPattern?: unknown;
  requireUniversityEmail?: unknown;
  universityEmailDomain?: unknown;
};

export type CleanSettings = {
  studentIdMinLength?: number;
  studentIdMaxLength?: number;
  studentIdPrefix?: string | null;
  studentIdPattern?: string | null;
  requireUniversityEmail?: boolean;
  universityEmailDomain?: string | null;
};

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Validates only the fields that were sent. Returns the cleaned patch or the first problem found. */
export function cleanSettings(input: SettingsInput): { ok: true; value: CleanSettings } | { ok: false; error: string } {
  const out: CleanSettings = {};

  if (input.studentIdMinLength !== undefined) {
    if (!isInt(input.studentIdMinLength) || input.studentIdMinLength < 1 || input.studentIdMinLength > 50) return { ok: false, error: "Minimum ID length must be a whole number from 1 to 50." };
    out.studentIdMinLength = input.studentIdMinLength;
  }
  if (input.studentIdMaxLength !== undefined) {
    if (!isInt(input.studentIdMaxLength) || input.studentIdMaxLength < 1 || input.studentIdMaxLength > 50) return { ok: false, error: "Maximum ID length must be a whole number from 1 to 50." };
    out.studentIdMaxLength = input.studentIdMaxLength;
  }
  if (out.studentIdMinLength !== undefined && out.studentIdMaxLength !== undefined && out.studentIdMinLength > out.studentIdMaxLength) {
    return { ok: false, error: "Minimum ID length can’t be more than the maximum." };
  }

  if (input.studentIdPrefix !== undefined) {
    if (input.studentIdPrefix !== null && typeof input.studentIdPrefix !== "string") return { ok: false, error: "Prefix must be text." };
    const prefix = (input.studentIdPrefix ?? "").trim();
    if (prefix.length > 20) return { ok: false, error: "Prefix can be at most 20 characters." };
    out.studentIdPrefix = prefix || null;
  }
  if (input.studentIdPattern !== undefined) {
    if (input.studentIdPattern !== null && typeof input.studentIdPattern !== "string") return { ok: false, error: "Pattern must be text." };
    const pattern = (input.studentIdPattern ?? "").trim();
    if (pattern) {
      const problem = validateStudentIdPattern(pattern);
      if (problem) return { ok: false, error: problem };
    }
    out.studentIdPattern = pattern || null;
  }
  if (input.requireUniversityEmail !== undefined) {
    if (typeof input.requireUniversityEmail !== "boolean") return { ok: false, error: "requireUniversityEmail must be true or false." };
    out.requireUniversityEmail = input.requireUniversityEmail;
  }
  if (input.universityEmailDomain !== undefined) {
    if (input.universityEmailDomain !== null && typeof input.universityEmailDomain !== "string") return { ok: false, error: "Email domain must be text." };
    const domain = (input.universityEmailDomain ?? "").trim().toLowerCase();
    if (domain) {
      const problem = validateEmailDomain(domain);
      if (problem) return { ok: false, error: problem };
    }
    out.universityEmailDomain = domain || null;
  }
  return { ok: true, value: out };
}
