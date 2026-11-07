import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238) for admin sign-in: HMAC-SHA1, 6 digits, 30 second steps,
 * the settings every authenticator app supports. Pure functions: the clock and the stored state are passed in.
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Codes from one step either side of now are accepted, so a phone clock a few seconds off still works. */
export const TOTP_WINDOW_STEPS = 1;
export const ISSUER = "TXMate";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Null for anything that is not valid base32 (spaces and padding are ignored). */
export function base32Decode(text: string): Buffer | null {
  const clean = text.replace(/[\s=]/g, "").toUpperCase();
  if (clean.length === 0) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random 160-bit secret as 32 base32 characters. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The secret in groups of four, easier to type into an authenticator app. */
export function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", secret).update(message).digest();
  const offset = hash[hash.length - 1] & 15;
  const binary = ((hash[offset] & 127) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function stepAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function codeForStep(secretBase32: string, step: number): string | null {
  const secret = base32Decode(secretBase32);
  return secret ? hotp(secret, step) : null;
}

/** Six digits, with spaces and dashes allowed while typing. Null when it is not that shape. */
export function normalizeTotpInput(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks a typed code. A step that was already accepted (or an older one) is refused, so a code seen
 * over someone's shoulder or in a log cannot be used a second time.
 */
export function verifyTotp(secretBase32: string, input: string, nowMs: number, lastUsedStep: number | null): { ok: true; step: number } | { ok: false } {
  const code = normalizeTotpInput(input);
  const secret = base32Decode(secretBase32);
  if (!code || !secret) return { ok: false };
  const current = stepAt(nowMs);
  let matched: number | null = null;
  // Every step is compared, so the time taken does not show which one matched.
  for (let offset = -TOTP_WINDOW_STEPS; offset <= TOTP_WINDOW_STEPS; offset++) {
    const step = current + offset;
    if (step < 0) continue;
    if (same(hotp(secret, step), code) && matched === null) matched = step;
  }
  if (matched === null) return { ok: false };
  if (lastUsedStep !== null && matched <= lastUsedStep) return { ok: false };
  return { ok: true, step: matched };
}

/** The address an authenticator app opens to add the account. */
export function otpauthUri(secretBase32: string, accountEmail: string): string {
  const label = `${encodeURIComponent(ISSUER)}:${encodeURIComponent(accountEmail)}`;
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

// ---------------------------------------------------------------- backup codes

/** No 0, O, 1, I or L, so a code read off paper cannot be mistyped. */
export const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const BACKUP_CODE_LENGTH = 10;
export const BACKUP_CODE_COUNT = 10;

export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let code = "";
    for (let i = 0; i < BACKUP_CODE_LENGTH; i++) code += BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)];
    return code;
  });
}

/** XXXXX-XXXXX for display. */
export function formatBackupCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** The stored form of a typed backup code, or null when it cannot be one. */
export function normalizeBackupCode(input: string): string | null {
  const clean = input.replace(/[\s-]/g, "").toUpperCase();
  if (clean.length !== BACKUP_CODE_LENGTH) return null;
  for (const char of clean) if (!BACKUP_ALPHABET.includes(char)) return null;
  return clean;
}

export type CodeKind = "totp" | "backup";

export function classifyCode(input: string): CodeKind | null {
  if (normalizeTotpInput(input)) return "totp";
  if (normalizeBackupCode(input)) return "backup";
  return null;
}
