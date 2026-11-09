/** Validation for the qualifications and experience an Academic Mate lists on their profile. Pure: no database, no clock argument other than `now`. */

export const MAX_CREDENTIALS = 10;
export const FIRST_YEAR = 1950;

export type QualificationInput = { name: string; issuer: string | null; year: number | null; credentialUrl: string | null };
export type ExperienceInput = { title: string; organisation: string | null; description: string | null; startYear: number | null; endYear: number | null };
type Result<T> = { ok: true; value: T[] } | { ok: false; error: string };

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function text(value: unknown, label: string, max: number, required: boolean, multiline = false): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") return required ? fail(`${label} is required.`) : { ok: true, value: null };
  if (typeof value !== "string") return fail(`${label} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) return required ? fail(`${label} is required.`) : { ok: true, value: null };
  if (trimmed.length > max) return fail(`${label} must be ${max} characters or fewer.`);
  if (CONTROL.test(trimmed) || (!multiline && /[\r\n]/.test(trimmed))) return fail(`${label} contains characters that aren't allowed.`);
  return { ok: true, value: trimmed };
}

function year(value: unknown, label: string, maxYear: number): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isInteger(value) || value < FIRST_YEAR || value > maxYear) return fail(`${label} must be a year between ${FIRST_YEAR} and ${maxYear}.`);
  return { ok: true, value };
}

function list(value: unknown, label: string): { ok: true; items: Record<string, unknown>[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return fail(`${label} must be a list.`);
  if (value.length > MAX_CREDENTIALS) return fail(`You can list up to ${MAX_CREDENTIALS} ${label.toLowerCase()}.`);
  if (value.some((item) => item === null || typeof item !== "object" || Array.isArray(item))) return fail(`${label} contains an invalid entry.`);
  return { ok: true, items: value as Record<string, unknown>[] };
}

export function parseQualifications(input: unknown, now = new Date()): Result<QualificationInput> {
  const items = list(input, "Qualifications");
  if (!items.ok) return items;
  const maxYear = now.getUTCFullYear() + 6; // a degree that is still in progress can show its expected year
  const out: QualificationInput[] = [];
  for (const [index, item] of items.items.entries()) {
    const where = `Qualification ${index + 1}`;
    const name = text(item.name, `${where}: name`, 120, true); if (!name.ok) return name;
    const issuer = text(item.issuer, `${where}: awarded by`, 120, false); if (!issuer.ok) return issuer;
    const awarded = year(item.year, `${where}: year`, maxYear); if (!awarded.ok) return awarded;
    const url = text(item.credentialUrl, `${where}: link`, 300, false); if (!url.ok) return url;
    if (url.value !== null) {
      let parsed: URL | null = null;
      try { parsed = new URL(url.value); } catch { /* handled below */ }
      if (!parsed || !["http:", "https:"].includes(parsed.protocol)) return fail(`${where}: the link must start with http:// or https://.`);
    }
    out.push({ name: name.value as string, issuer: issuer.value, year: awarded.value, credentialUrl: url.value });
  }
  return { ok: true, value: out };
}

export function parseExperiences(input: unknown, now = new Date()): Result<ExperienceInput> {
  const items = list(input, "Experience");
  if (!items.ok) return items;
  const maxYear = now.getUTCFullYear();
  const out: ExperienceInput[] = [];
  for (const [index, item] of items.items.entries()) {
    const where = `Experience ${index + 1}`;
    const title = text(item.title, `${where}: role`, 120, true); if (!title.ok) return title;
    const organisation = text(item.organisation, `${where}: where`, 120, false); if (!organisation.ok) return organisation;
    const description = text(item.description, `${where}: details`, 500, false, true); if (!description.ok) return description;
    const startYear = year(item.startYear, `${where}: start year`, maxYear); if (!startYear.ok) return startYear;
    const endYear = year(item.endYear, `${where}: end year`, maxYear); if (!endYear.ok) return endYear;
    if (endYear.value !== null && startYear.value === null) return fail(`${where}: add a start year, or clear the end year.`);
    if (endYear.value !== null && startYear.value !== null && endYear.value < startYear.value) return fail(`${where}: the end year is before the start year.`);
    out.push({ title: title.value as string, organisation: organisation.value, description: description.value, startYear: startYear.value, endYear: endYear.value });
  }
  return { ok: true, value: out };
}
