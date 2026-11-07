import { describe, expect, test } from "bun:test";
import { lockMessage, lockRemainingMs, MAX_FAILED_ATTEMPTS, shouldLock } from "../lib/admin/mfa-policy";
import { decryptSecret, encryptSecret, hashBackupCode, MfaConfigError } from "../lib/admin/mfa-crypto";
import {
  base32Decode, base32Encode, BACKUP_ALPHABET, classifyCode, codeForStep, formatBackupCode, formatSecret, generateBackupCodes, generateSecret,
  hotp, normalizeBackupCode, normalizeTotpInput, otpauthUri, stepAt, verifyTotp,
} from "../lib/admin/totp";

// RFC 6238 test secret "12345678901234567890" and its published SHA-1 values (last 6 of the 8 digits).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const ENV = { BETTER_AUTH_SECRET: "a-long-enough-test-secret-value" };

describe("totp", () => {
  test("base32 round trips and rejects junk", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))?.equals(bytes)).toBe(true);
    expect(base32Decode("not base32 !")).toBeNull();
    expect(base32Decode("")).toBeNull();
  });
  test("matches the RFC 6238 SHA-1 test vectors", () => {
    expect(codeForStep(RFC_SECRET, stepAt(59_000))).toBe("287082");
    expect(codeForStep(RFC_SECRET, stepAt(1111111109_000))).toBe("081804");
    expect(codeForStep(RFC_SECRET, stepAt(1234567890_000))).toBe("005924");
    expect(hotp(Buffer.from("12345678901234567890"), 0)).toBe("755224");
  });
  test("accepts the current code and one step either side, nothing further", () => {
    const now = 1234567890_000;
    const step = stepAt(now);
    for (const offset of [-1, 0, 1]) expect(verifyTotp(RFC_SECRET, codeForStep(RFC_SECRET, step + offset)!, now, null)).toEqual({ ok: true, step: step + offset });
    expect(verifyTotp(RFC_SECRET, codeForStep(RFC_SECRET, step + 2)!, now, null).ok).toBe(false);
    expect(verifyTotp(RFC_SECRET, codeForStep(RFC_SECRET, step - 2)!, now, null).ok).toBe(false);
  });
  test("a code cannot be used twice, nor an older one after a newer", () => {
    const now = 1234567890_000;
    const step = stepAt(now);
    const code = codeForStep(RFC_SECRET, step)!;
    expect(verifyTotp(RFC_SECRET, code, now, step).ok).toBe(false);
    expect(verifyTotp(RFC_SECRET, codeForStep(RFC_SECRET, step - 1)!, now, step).ok).toBe(false);
    expect(verifyTotp(RFC_SECRET, code, now, step - 1)).toEqual({ ok: true, step });
  });
  test("input shape", () => {
    expect(normalizeTotpInput("123 456")).toBe("123456");
    expect(normalizeTotpInput("12345")).toBeNull();
    expect(normalizeTotpInput("12345a")).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", 59_000, null).ok).toBe(false);
    expect(verifyTotp("!!!", "123456", 59_000, null).ok).toBe(false);
  });
  test("secrets are 32 characters and different each time", () => {
    const a = generateSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateSecret()).not.toBe(a);
    expect(formatSecret(a).split(" ")).toHaveLength(8);
  });
  test("the setup link names the account and the app", () => {
    const uri = otpauthUri("ABCDEFGH", "a.b@example.com");
    expect(uri).toBe("otpauth://totp/TXMate:a.b%40example.com?secret=ABCDEFGH&issuer=TXMate&algorithm=SHA1&digits=6&period=30");
  });
});

describe("backup codes", () => {
  test("ten distinct codes from the unambiguous alphabet", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toHaveLength(10);
      for (const char of code) expect(BACKUP_ALPHABET).toContain(char);
    }
  });
  test("typed codes are normalised whatever the spacing and case", () => {
    expect(formatBackupCode("ABCDEFGHJK")).toBe("ABCDE-FGHJK");
    expect(normalizeBackupCode("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(normalizeBackupCode(" ABCDE FGHJK ")).toBe("ABCDEFGHJK");
    expect(normalizeBackupCode("ABCDE-FGHJ0")).toBeNull();
    expect(normalizeBackupCode("short")).toBeNull();
  });
  test("a code is told apart from an authenticator code", () => {
    expect(classifyCode("123456")).toBe("totp");
    expect(classifyCode("ABCDE-FGHJK")).toBe("backup");
    expect(classifyCode("hello")).toBeNull();
  });
});

describe("secret protection", () => {
  test("encrypts, and only the same admin can read it back", () => {
    const stored = encryptSecret("JBSWY3DPEHPK3PXP", "admin-1", ENV);
    expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(stored, "admin-1", ENV)).toBe("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(stored, "admin-2", ENV)).toBeNull();
  });
  test("damaged, foreign or re-keyed values read as nothing", () => {
    const stored = encryptSecret("JBSWY3DPEHPK3PXP", "admin-1", ENV);
    expect(decryptSecret(stored.slice(0, -4) + "AAAA", "admin-1", ENV)).toBeNull();
    expect(decryptSecret("garbage", "admin-1", ENV)).toBeNull();
    expect(decryptSecret(stored, "admin-1", { BETTER_AUTH_SECRET: "another-long-enough-secret-value" })).toBeNull();
  });
  test("each encryption is different", () => {
    expect(encryptSecret("X", "a", ENV)).not.toBe(encryptSecret("X", "a", ENV));
  });
  test("with no usable key it refuses rather than guessing", () => {
    expect(() => encryptSecret("X", "a", {})).toThrow(MfaConfigError);
    expect(() => encryptSecret("X", "a", { ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(8).toString("base64") })).toThrow(MfaConfigError);
    expect(() => encryptSecret("X", "a", { ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") })).not.toThrow();
  });
  test("backup codes are hashed, repeatably, and differently per code", () => {
    expect(hashBackupCode("ABCDEFGHJK", ENV)).toBe(hashBackupCode("ABCDEFGHJK", ENV));
    expect(hashBackupCode("ABCDEFGHJK", ENV)).not.toBe(hashBackupCode("ABCDEFGHJL", ENV));
    expect(hashBackupCode("ABCDEFGHJK", ENV)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("lockout", () => {
  test("locks at the limit and not before", () => {
    expect(shouldLock(MAX_FAILED_ATTEMPTS - 1)).toBe(false);
    expect(shouldLock(MAX_FAILED_ATTEMPTS)).toBe(true);
  });
  test("remaining lock time", () => {
    expect(lockRemainingMs(null, 5)).toBe(0);
    expect(lockRemainingMs(new Date(10_000), 4_000)).toBe(6_000);
    expect(lockRemainingMs(new Date(10_000), 20_000)).toBe(0);
  });
  test("the message rounds up to whole minutes", () => {
    expect(lockMessage(1)).toBe("Too many wrong codes. Try again in 1 minute.");
    expect(lockMessage(61_000)).toBe("Too many wrong codes. Try again in 2 minutes.");
  });
});
