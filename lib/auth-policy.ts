/** Security settings for sign-in, verification and account linking, kept free of imports so tests can read them. */

/** How long an emailed verification link works. */
export const VERIFICATION_LINK_TTL_SECONDS = 60 * 60;

/** Minimum wait before the same address is sent another verification email. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Most verification emails one address can be sent in an hour. */
export const RESEND_MAX_PER_HOUR = 5;

/** Per-IP limits enforced by Better Auth. `window` is in seconds. */
export const RATE_LIMIT_RULES = {
  "/send-verification-email": { window: 60, max: 3 },
  "/sign-in/email": { window: 60, max: 10 },
  "/sign-up/email": { window: 60, max: 5 },
  "/change-email": { window: 60, max: 3 },
  "/request-password-reset": { window: 60, max: 3 },
  "/reset-password": { window: 60, max: 10 },
} as const;

/**
 * Google never signs someone into an existing account on its own.
 * A person with a password account links Google while signed in (Settings → Email and sign-in).
 * Without this, anyone could register a password account on a victim's address and wait for the victim to use Google.
 */
export const ACCOUNT_LINKING_POLICY = {
  enabled: true,
  disableImplicitLinking: true,
  allowDifferentEmails: false,
  allowUnlinkingAll: false,
} as const;

/** The only token values the verify link may carry: a JWT-shaped string. */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= 4096 && /^[A-Za-z0-9._-]+$/.test(value);
}

type AuthErrorLike = { status?: number; code?: string; message?: string } | null | undefined;

/** True when Better Auth refused a password sign-in because the address is not verified yet. */
export function isEmailNotVerified(error: AuthErrorLike): boolean {
  if (!error) return false;
  return error.code === "EMAIL_NOT_VERIFIED" || (error.status === 403 && /verif/i.test(error.message ?? ""));
}

/** Messages for the `error` value Better Auth puts on the verification callback URL. */
export function verificationErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code.toLowerCase()) {
    case "token_expired":
      return "This link has expired. Request a new verification email below.";
    case "token_used":
      return "This link has already been used. If your email is verified you can sign in; otherwise request a new link below.";
    case "invalid_token":
    case "invalid_token_provided":
      return "This link isn’t valid. Request a new verification email below.";
    case "user_not_found":
      return "We couldn’t find that account. Request a new verification email below.";
    default:
      return "We couldn’t verify that link. Request a new verification email below.";
  }
}

/** Messages for the `error` value on the sign-in page after a Google attempt. */
export function googleErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code.toLowerCase()) {
    case "account_not_linked":
      return "An account with this email already exists. Sign in with your password, then connect Google from Settings → Email and sign-in.";
    case "email_not_found":
      return "Google didn’t share an email address, so we couldn’t sign you in.";
    case "access_denied":
      return "Google sign-in was cancelled.";
    default:
      return "Unable to sign in with Google. Please try again.";
  }
}

export type LinkedAccountLike = { id: string; providerId: string };

/**
 * Whether a sign-in method may be disconnected. The password is never removed here, and Google can only be
 * disconnected once a password exists, so a person can never lock themselves out.
 */
export function canDisconnectAccount(accounts: LinkedAccountLike[], accountId: string): boolean {
  const target = accounts.find((account) => account.id === accountId);
  if (!target || target.providerId === "credential") return false;
  return accounts.some((account) => account.providerId === "credential");
}

/** Messages for the `error` value Better Auth puts on the reset page address. */
export function resetErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return "This reset link is invalid, has expired or has already been used. Ask for a new one.";
}
