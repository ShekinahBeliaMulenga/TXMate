import { describe, expect, test } from "bun:test";
import {
  ACCOUNT_LINKING_POLICY,
  RATE_LIMIT_RULES,
  RESEND_COOLDOWN_SECONDS,
  VERIFICATION_LINK_TTL_SECONDS,
  googleErrorMessage,
  isEmailNotVerified,
  looksLikeToken,
  verificationErrorMessage,
} from "../lib/auth-policy";
import { readSmtpConfig } from "../lib/email/smtp-config";
import { changeEmailConfirmation, existingAccountNotice, verificationEmail } from "../lib/email/templates";
import { createSendThrottle } from "../lib/email/throttle";
import { consumeToken, hashToken, memoryTokenStore } from "../lib/email/token-use";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImFAYi5jIn0.signature_value-123";

describe("SMTP configuration", () => {
  test("is refused when the host or sender is missing; nothing is defaulted", () => {
    const result = readSmtpConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toEqual(["SMTP_HOST is not set.", "SMTP_FROM is not set."]);
  });
  test("reads host, port, credentials and sender from the environment", () => {
    const result = readSmtpConfig({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "TXMate <no-reply@example.com>" });
    expect(result).toEqual({ ok: true, config: { host: "smtp.example.com", port: 465, secure: true, user: "u", pass: "p", from: "TXMate <no-reply@example.com>" } });
  });
  test("port 587 uses STARTTLS unless SMTP_SECURE says otherwise", () => {
    const base = { SMTP_HOST: "h", SMTP_FROM: "a@b.co" };
    const normal = readSmtpConfig(base);
    expect(normal.ok && normal.config.port === 587 && !normal.config.secure).toBe(true);
    const forced = readSmtpConfig({ ...base, SMTP_SECURE: "true" });
    expect(forced.ok && forced.config.secure).toBe(true);
  });
  test("rejects half a login, a bad port and a header-injecting sender", () => {
    const base = { SMTP_HOST: "h", SMTP_FROM: "a@b.co" };
    expect(readSmtpConfig({ ...base, SMTP_USER: "u" }).ok).toBe(false);
    expect(readSmtpConfig({ ...base, SMTP_PORT: "abc" }).ok).toBe(false);
    expect(readSmtpConfig({ ...base, SMTP_FROM: "a@b.co\r\nBcc: x@y.z" }).ok).toBe(false);
  });
});

describe("email templates", () => {
  test("the verification email carries the link, the lifetime and escapes the name", () => {
    const mail = verificationEmail({ name: "<script>x</script>", url: "https://app.example.com/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email", expiresInMinutes: 60 });
    expect(mail.text).toContain("https://app.example.com/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email");
    expect(mail.text).toContain("60 minutes");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&amp;callbackURL");
  });
  test("refuses a link that is not http or https", () => {
    expect(() => verificationEmail({ name: "A", url: "javascript:alert(1)", expiresInMinutes: 60 })).toThrow();
    expect(() => existingAccountNotice({ name: "A", signInUrl: "data:text/html,x" })).toThrow();
  });
  test("the change-email approval names the new address", () => {
    const mail = changeEmailConfirmation({ name: "Ayana Mulenga", newEmail: "new@example.com", url: "https://app.example.com/x", expiresInMinutes: 60 });
    expect(mail.subject).toContain("email change");
    expect(mail.text).toContain("new@example.com");
    expect(mail.text.startsWith("Hi Ayana,")).toBe(true);
  });
});

describe("links expire", () => {
  test("verification links last at most an hour", () => {
    expect(VERIFICATION_LINK_TTL_SECONDS).toBeLessThanOrEqual(3600);
    expect(VERIFICATION_LINK_TTL_SECONDS).toBeGreaterThan(0);
  });
  test("an expired or invalid link gets a message that points to a new one", () => {
    expect(verificationErrorMessage("token_expired")).toContain("expired");
    expect(verificationErrorMessage("invalid_token")).toContain("isn’t valid");
    expect(verificationErrorMessage("anything_else")).toContain("new verification email");
    expect(verificationErrorMessage(null)).toBeNull();
  });
});

describe("links work once", () => {
  test("the first presentation succeeds and every later one is refused", async () => {
    const store = memoryTokenStore();
    expect(await consumeToken(store, TOKEN)).toBe(true);
    expect(await consumeToken(store, TOKEN)).toBe(false);
    expect(await consumeToken(store, TOKEN)).toBe(false);
  });
  test("a different link is unaffected", async () => {
    const store = memoryTokenStore();
    await consumeToken(store, TOKEN);
    expect(await consumeToken(store, `${TOKEN}x`)).toBe(true);
  });
  test("two requests at the same moment cannot both win", async () => {
    const store = memoryTokenStore();
    const results = await Promise.all([consumeToken(store, TOKEN), consumeToken(store, TOKEN), consumeToken(store, TOKEN)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  test("only a hash is stored, and old records are pruned", async () => {
    const store = memoryTokenStore();
    const t0 = new Date("2026-10-31T10:00:00Z");
    await consumeToken(store, TOKEN, t0);
    expect(hashToken(TOKEN)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(TOKEN)).not.toContain(TOKEN);
    await consumeToken(store, `${TOKEN}y`, new Date("2026-10-31T13:00:00Z"));
    expect(store.size()).toBe(1);
  });
  test("only token-shaped values are recorded", () => {
    expect(looksLikeToken(TOKEN)).toBe(true);
    expect(looksLikeToken("short")).toBe(false);
    expect(looksLikeToken("has spaces in it which is not a token")).toBe(false);
    expect(looksLikeToken(undefined)).toBe(false);
    expect(looksLikeToken("a".repeat(5000))).toBe(false);
  });
});

describe("sign-in is blocked until the email is verified", () => {
  test("the refusal Better Auth returns is recognised, by code or by status", () => {
    expect(isEmailNotVerified({ code: "EMAIL_NOT_VERIFIED", status: 403 })).toBe(true);
    expect(isEmailNotVerified({ status: 403, message: "Email not verified" })).toBe(true);
  });
  test("a wrong password or a rate limit is not mistaken for it", () => {
    expect(isEmailNotVerified({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" })).toBe(false);
    expect(isEmailNotVerified({ status: 429 })).toBe(false);
    expect(isEmailNotVerified(null)).toBe(false);
  });
});

describe("resend limits", () => {
  test("the same address must wait out the cooldown", () => {
    let now = 1_000_000;
    const throttle = createSendThrottle({ cooldownMs: 60_000, maxPerHour: 5, now: () => now });
    expect(throttle.take("a@b.co")).toEqual({ allowed: true });
    now += 10_000;
    expect(throttle.take("a@b.co")).toEqual({ allowed: false, retryAfterSeconds: 50 });
    now += 50_000;
    expect(throttle.take("a@b.co")).toEqual({ allowed: true });
  });
  test("addresses are counted case-insensitively and separately", () => {
    const throttle = createSendThrottle({ cooldownMs: 60_000, maxPerHour: 5, now: () => 1 });
    expect(throttle.take("A@b.co").allowed).toBe(true);
    expect(throttle.take("a@B.co").allowed).toBe(false);
    expect(throttle.take("other@b.co").allowed).toBe(true);
  });
  test("an address is capped per hour, then released", () => {
    let now = 0;
    const throttle = createSendThrottle({ cooldownMs: 60_000, maxPerHour: 3, now: () => now });
    for (let i = 0; i < 3; i++) { expect(throttle.take("a@b.co").allowed).toBe(true); now += 61_000; }
    expect(throttle.take("a@b.co").allowed).toBe(false);
    now = 60 * 60 * 1000 + 1;
    expect(throttle.take("a@b.co").allowed).toBe(true);
  });
  test("a send that failed is refunded", () => {
    const throttle = createSendThrottle({ cooldownMs: 60_000, maxPerHour: 5, now: () => 1 });
    throttle.take("a@b.co");
    throttle.refund("a@b.co");
    expect(throttle.take("a@b.co").allowed).toBe(true);
  });
  test("Better Auth also limits the endpoints per IP", () => {
    expect(RATE_LIMIT_RULES["/send-verification-email"].max).toBeLessThanOrEqual(5);
    expect(RATE_LIMIT_RULES["/sign-in/email"].window).toBe(60);
    expect(RESEND_COOLDOWN_SECONDS).toBeGreaterThanOrEqual(30);
  });
});

describe("Google account linking", () => {
  test("Google never links itself to an existing account", () => {
    expect(ACCOUNT_LINKING_POLICY.disableImplicitLinking).toBe(true);
  });
  test("linking stays on, so a signed-in person can connect Google explicitly", () => {
    expect(ACCOUNT_LINKING_POLICY.enabled).toBe(true);
  });
  test("a different email is not accepted, and the last sign-in method cannot be removed", () => {
    expect(ACCOUNT_LINKING_POLICY.allowDifferentEmails).toBe(false);
    expect(ACCOUNT_LINKING_POLICY.allowUnlinkingAll).toBe(false);
  });
  test("a refused Google sign-in tells the person how to link", () => {
    expect(googleErrorMessage("account_not_linked")).toContain("Settings");
    expect(googleErrorMessage("access_denied")).toContain("cancelled");
    expect(googleErrorMessage(null)).toBeNull();
  });
});

import { canDisconnectAccount } from "../lib/auth-policy";
import { validateSetPassword } from "../lib/password-policy";
import { adminSessionState } from "../lib/admin/session-state";

describe("disconnecting a sign-in method", () => {
  const google = { id: "g", providerId: "google" };
  const password = { id: "p", providerId: "credential" };
  test("a Google-only account cannot disconnect Google", () => {
    expect(canDisconnectAccount([google], "g")).toBe(false);
  });
  test("Google can be disconnected once a password exists", () => {
    expect(canDisconnectAccount([google, password], "g")).toBe(true);
  });
  test("the password is never disconnected, and unknown accounts are refused", () => {
    expect(canDisconnectAccount([google, password], "p")).toBe(false);
    expect(canDisconnectAccount([google, password], "nope")).toBe(false);
  });
});

describe("setting a first password", () => {
  test("needs a long enough password that matches", () => {
    expect(validateSetPassword({ next: "short", confirm: "short" }).next).toContain("at least 8");
    expect(validateSetPassword({ next: "longenough1", confirm: "different1" }).confirm).toContain("don't match");
    expect(validateSetPassword({ next: "longenough1", confirm: "longenough1" })).toEqual({});
  });
});

describe("session state shown to admins", () => {
  const base = { status: "IN_PROGRESS", requestStatus: "ACCEPTED", arrangementStatus: "ACTIVE" };
  const start = Date.parse("2026-10-20T10:00:00Z");
  const end = Date.parse("2026-10-20T11:00:00Z");
  test("a session that ended days ago is not shown as in progress", () => {
    const state = adminSessionState({ ...base, scheduledStart: start, scheduledEnd: end }, Date.parse("2026-10-21T10:00:00Z"));
    expect(state).not.toBe("In progress");
  });
  test("after 24 hours with no answers it reads No response", () => {
    expect(adminSessionState({ ...base, scheduledStart: start, scheduledEnd: end }, Date.parse("2026-10-25T10:00:00Z"))).toBe("No response");
  });
  test("during the session it reads In progress, before it Upcoming", () => {
    expect(adminSessionState({ ...base, status: "SCHEDULED", scheduledStart: start, scheduledEnd: end }, start - 3600_000)).toBe("Upcoming");
    expect(adminSessionState({ ...base, scheduledStart: start, scheduledEnd: end }, start + 5 * 60_000)).toBe("In progress");
  });
  test("completed, cancelled and review states win over the clock", () => {
    expect(adminSessionState({ ...base, status: "COMPLETED", scheduledStart: start, scheduledEnd: end }, end + 1e9)).toBe("Completed");
    expect(adminSessionState({ ...base, status: "CANCELLED", scheduledStart: start, scheduledEnd: end }, end + 1e9)).toBe("Cancelled");
    expect(adminSessionState({ ...base, status: "DISPUTED", scheduledStart: start, scheduledEnd: end }, end + 1e9)).toBe("Needs review");
  });
});

import { passwordResetEmail } from "../lib/email/templates";
import { resetErrorMessage } from "../lib/auth-policy";

describe("password reset", () => {
  test("the email carries the link and says it works once", () => {
    const mail = passwordResetEmail({ name: "Ayana Mulenga", url: "https://app.example.com/api/auth/reset-password/abc?callbackURL=%2Freset-password", expiresInMinutes: 60 });
    expect(mail.subject).toContain("Reset");
    expect(mail.text).toContain("reset-password/abc");
    expect(mail.text).toContain("works once");
    expect(mail.text).toContain("If you didn’t ask for this");
  });
  test("refuses a link that is not http or https", () => {
    expect(() => passwordResetEmail({ name: "A", url: "javascript:alert(1)", expiresInMinutes: 60 })).toThrow();
  });
  test("a bad link says so; a good one shows no message", () => {
    expect(resetErrorMessage("INVALID_TOKEN")).toContain("invalid");
    expect(resetErrorMessage(null)).toBeNull();
  });
  test("reset mail is limited per address", () => {
    expect(RATE_LIMIT_RULES["/request-password-reset"].max).toBeLessThanOrEqual(5);
  });
});

import { validateInvite } from "../lib/admin/admin-invite-rules";
import { adminInviteEmail } from "../lib/email/templates";

describe("admin invitations", () => {
  test("a name and a valid email are required", () => {
    expect(validateInvite({ name: "", email: "a@b.co" }).ok).toBe(false);
    expect(validateInvite({ name: "Ayana", email: "not-an-email" }).ok).toBe(false);
    expect(validateInvite({ name: "<b>x</b>", email: "a@b.co" }).ok).toBe(false);
  });
  test("the name is tidied and the email lower-cased", () => {
    const result = validateInvite({ name: "  Ayana   Mulenga ", email: " Ayana@Example.COM " });
    expect(result).toEqual({ ok: true, name: "Ayana Mulenga", email: "ayana@example.com" });
  });
  test("the invitation email names the role and says the link works once", () => {
    const mail = adminInviteEmail({ name: "Ayana Mulenga", roleLabel: "University admin", url: "https://app.example.com/x", expiresInMinutes: 60 });
    expect(mail.text).toContain("University admin");
    expect(mail.text).toContain("works once");
    expect(mail.html).toContain("Choose your password");
  });
});

import { CLEANUP_BATCH_SIZE, UNVERIFIED_MAX_AGE_DAYS, isStaleUnverified, unverifiedCutoff } from "../lib/account-cleanup-rules";

describe("stale unverified accounts", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const old = new Date("2026-11-01T12:00:00Z");
  test("the limit is a week and each run is capped", () => {
    expect(UNVERIFIED_MAX_AGE_DAYS).toBe(7);
    expect(CLEANUP_BATCH_SIZE).toBeLessThanOrEqual(100);
    expect(unverifiedCutoff(now).toISOString()).toBe("2026-11-03T12:00:00.000Z");
  });
  test("an old unverified account is stale", () => {
    expect(isStaleUnverified({ emailVerified: false, createdAt: old, anonymisedAt: null }, now)).toBe(true);
  });
  test("a verified, recent or anonymised account is never stale", () => {
    expect(isStaleUnverified({ emailVerified: true, createdAt: old, anonymisedAt: null }, now)).toBe(false);
    expect(isStaleUnverified({ emailVerified: false, createdAt: new Date("2026-11-08T12:00:00Z"), anonymisedAt: null }, now)).toBe(false);
    expect(isStaleUnverified({ emailVerified: false, createdAt: old, anonymisedAt: new Date() }, now)).toBe(false);
  });
});
