/** Phone constants and rules that need no library, so they can be used and tested anywhere. */
export const DEFAULT_PHONE_COUNTRY = "ZM" as const;
export const PHONE_TAKEN_MESSAGE = "This phone number is already registered to another account.";
export const PHONE_FORMAT_MESSAGE = "Enter a valid phone number for the selected country.";

/**
 * Every format an older Zambian row may have been saved in, plus the E.164 form, so duplicate checks catch them all.
 * Older rows were stored as +260XXXXXXXXX, 0XXXXXXXXX, 260XXXXXXXXX or XXXXXXXXX.
 */
export function phoneVariants(e164: string): string[] {
  if (/^\+260\d{9}$/.test(e164)) {
    const local = e164.slice(4);
    return [e164, local, `0${local}`, `260${local}`];
  }
  return [e164];
}
