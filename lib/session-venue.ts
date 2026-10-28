/**
 * Meeting place (venue) rules shared by the API and the screens.
 *
 * The Academic Mate chooses the venue. A student can suggest one, which the mate
 * accepts or declines. Until a venue is chosen a session keeps the default text below.
 */
export const DEFAULT_MEETING_LOCATION = "To be agreed in conversation";
export const VENUE_MIN_LENGTH = 3;
export const VENUE_MAX_LENGTH = 120;

export type VenueCheck = { ok: true; value: string } | { ok: false; message: string };

/** Trims, collapses whitespace and rejects empty, too long or control-character input. */
export function checkVenue(input: unknown): VenueCheck {
  if (typeof input !== "string") return { ok: false, message: "Enter where you will meet." };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(input.replace(/[\t\n\r]/g, " "))) return { ok: false, message: "The venue contains characters that aren't allowed." };
  const value = input.replace(/\s+/g, " ").trim();
  if (value.length < VENUE_MIN_LENGTH) return { ok: false, message: `Enter at least ${VENUE_MIN_LENGTH} characters, for example "Library, Room 2".` };
  if (value.length > VENUE_MAX_LENGTH) return { ok: false, message: `Keep the venue under ${VENUE_MAX_LENGTH} characters.` };
  if (value.toLowerCase() === DEFAULT_MEETING_LOCATION.toLowerCase()) return { ok: false, message: "Enter a real place, not the placeholder." };
  return { ok: true, value };
}

/** True while nobody has chosen a venue yet. */
export const isVenueUnset = (location: string | null | undefined) => !location || location.trim().toLowerCase() === DEFAULT_MEETING_LOCATION.toLowerCase();
