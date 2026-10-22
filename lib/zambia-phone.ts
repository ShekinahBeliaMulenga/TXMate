/* Zambian mobile numbers. Stored format: +260XXXXXXXXX (prefixes 95/96/97, 75/76/77, 55/56/57). */
export const ZAMBIA_MOBILE_LOCAL_PATTERN = /^[579][567]\d{7}$/;
export const PHONE_TAKEN_MESSAGE = "This phone number is already registered to another account.";
export const PHONE_FORMAT_MESSAGE = "Enter a valid Zambian mobile number, for example 97 123 4567.";

/** "+260971234567", "260971234567", "0971234567" or "971234567" -> "+260971234567", else null. */
export function normalizeZambianMobile(raw: string): string | null {
  if (/[^\d\s+().-]/.test(raw)) return null;
  let d = raw.replace(/\D/g, "");
  d = d.startsWith("260") ? d.slice(3) : d.startsWith("0") ? d.slice(1) : d;
  return ZAMBIA_MOBILE_LOCAL_PATTERN.test(d) ? `+260${d}` : null;
}

/** Every format an older row may have been saved in, so duplicate checks catch them all. */
export function zambianPhoneVariants(e164: string): string[] {
  const local = e164.slice(4);
  return [e164, local, `0${local}`, `260${local}`];
}
