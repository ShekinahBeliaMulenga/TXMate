/**
 * The one place TXMate reads, validates, stores and displays phone numbers. It replaces the Zambia-only helpers.
 *
 * - Stored format: E.164 (for example +260971234567), in `StudentProfile.phoneNumber`.
 * - Default country: Zambia, so a number typed as 097 123 4567 still works.
 * - Validation is about format only. Whether the person can actually receive calls on the number is a
 *   separate question (verification) and is not decided here.
 * Safe to import in both server and client code.
 */
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

import { DEFAULT_PHONE_COUNTRY } from "./phone-shared";

export type { CountryCode };
export { DEFAULT_PHONE_COUNTRY, PHONE_FORMAT_MESSAGE, PHONE_TAKEN_MESSAGE, phoneVariants } from "./phone-shared";
const MAX_INPUT_LENGTH = 30;

export type PhoneParse =
  | { ok: true; e164: string; country: CountryCode; callingCode: string; national: string; international: string }
  | { ok: false; empty: boolean };

const digitsOf = (value: string) => value.replace(/\D/g, "");

function parseOnce(text: string, country: CountryCode | undefined) {
  try {
    const parsed = parsePhoneNumberFromString(text, country);
    return parsed && parsed.isValid() ? parsed : null;
  } catch {
    return null;
  }
}

/** First country that uses a calling code; used when the library cannot tell shared codes (such as +1) apart. */
function countryForCallingCode(callingCode: string): CountryCode {
  return getCountries().find((code) => getCountryCallingCode(code) === callingCode) ?? DEFAULT_PHONE_COUNTRY;
}

/**
 * Reads a phone number. A leading "+" means the number already includes its country code; otherwise it is
 * read as a number from `country`. A number typed with its country code but no "+" (260971234567) is accepted too.
 */
export function parsePhone(raw: string | null | undefined, country: CountryCode = DEFAULT_PHONE_COUNTRY): PhoneParse {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, empty: true };
  if (text.length > MAX_INPUT_LENGTH || /[^\d\s+().-]/.test(text) || digitsOf(text).length < 4) return { ok: false, empty: false };

  const parsed = text.startsWith("+")
    ? parseOnce(text, undefined)
    : parseOnce(text, country) ?? parseOnce(`+${digitsOf(text)}`, undefined);
  if (!parsed) return { ok: false, empty: false };
  return {
    ok: true,
    e164: parsed.number,
    country: parsed.country ?? countryForCallingCode(parsed.countryCallingCode),
    callingCode: parsed.countryCallingCode,
    national: parsed.nationalNumber,
    international: parsed.formatInternational(),
  };
}

/** The E.164 form of a valid number, or null. */
export function normalizePhone(raw: string | null | undefined, country: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  const result = parsePhone(raw, country);
  return result.ok ? result.e164 : null;
}

/** How a stored number is shown everywhere: +260 97 1234567. Unreadable legacy values are shown as saved. */
export function formatPhone(stored: string | null | undefined): string {
  const result = parsePhone(stored);
  return result.ok ? result.international : (stored ?? "").trim();
}

/** Splits a stored number into the country and the number without its country code, for the edit form. */
export function splitPhone(stored: string | null | undefined): { country: CountryCode; national: string } {
  const result = parsePhone(stored);
  if (result.ok) return { country: result.country, national: result.national };
  return { country: DEFAULT_PHONE_COUNTRY, national: digitsOf(stored ?? "") };
}

export type PhoneCountryOption = { code: CountryCode; name: string; callingCode: string };
let cachedOptions: PhoneCountryOption[] | null = null;

/** Every supported country, Zambia first, then alphabetical by name. */
export function phoneCountryOptions(): PhoneCountryOption[] {
  if (cachedOptions) return cachedOptions;
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames(["en"], { type: "region" }); } catch { names = null; }
  const options = getCountries().map((code) => ({ code, name: names?.of(code) ?? code, callingCode: getCountryCallingCode(code) }));
  options.sort((a, b) => (a.code === DEFAULT_PHONE_COUNTRY ? -1 : b.code === DEFAULT_PHONE_COUNTRY ? 1 : a.name.localeCompare(b.name)));
  cachedOptions = options;
  return options;
}

/** The text shown in a country picker: "Zambia (+260)". */
export const phoneCountryLabel = (option: PhoneCountryOption) => `${option.name} (+${option.callingCode})`;
