/**
 * Password rules shared by the change-password form.
 * The limits match better-auth's defaults (8–128), which the server enforces too,
 * and the 8-character minimum already used on the register page.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type ChangePasswordInput = { current: string; next: string; confirm: string };
export type ChangePasswordErrors = Partial<Record<keyof ChangePasswordInput, string>>;

/** Returns an error message per field; an empty object means the input is valid. */
export function validateChangePassword({ current, next, confirm }: ChangePasswordInput): ChangePasswordErrors {
  const errors: ChangePasswordErrors = {};
  if (!current) errors.current = "Enter your current password.";
  if (next.length < PASSWORD_MIN_LENGTH) errors.next = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  else if (next.length > PASSWORD_MAX_LENGTH) errors.next = `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  else if (current && next === current) errors.next = "Choose a password different from your current one.";
  if (!errors.next && next !== confirm) errors.confirm = "The two passwords don't match.";
  return errors;
}

/** Turns an auth-client failure into a message a person can act on. */
export function changePasswordErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  switch (error?.code) {
    case "INVALID_PASSWORD": return "Your current password is incorrect.";
    case "PASSWORD_TOO_SHORT": return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    case "PASSWORD_TOO_LONG": return `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`;
    case "CREDENTIAL_ACCOUNT_NOT_FOUND": return "This account doesn't use a password to sign in.";
  }
  if (error?.status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (error?.status === 401) return "Your session has expired. Please sign in again.";
  return "We couldn't change your password. Please try again.";
}
