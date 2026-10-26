/*
 * Zambian mobile numbers: +260 followed by 9 digits (prefixes 95/96/97, 75/76/77, 55/56/57).
 * The phone field holds only the 9 local digits.
 */
export const ZAMBIA_MOBILE_PATTERN = /^[579][567]\d{7}$/;
export const PHONE_TAKEN_MESSAGE = "This phone number is already registered to another account.";
export const PHONE_FORMAT_MESSAGE = "Enter a valid Zambian mobile number, for example 97 123 4567.";

/** Turns a stored value (+260971234567, 0971234567, 971234567) into the 9 local digits. */
export function toLocalPhone(value: string | null | undefined) {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("260")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 9);
}

/** Digits only; drops a pasted leading 260 or 0; at most 9 digits. */
export function cleanPhoneInput(raw: string) {
  return raw.replace(/\D/g, "").replace(/^260|^0/, "").slice(0, 9);
}
