export const INVITE_NAME_MAX = 100;

export type InviteCheck = { ok: true; name: string; email: string } | { ok: false; message: string };

/** Checks the name and email on an admin invitation. */
export function validateInvite(input: { name: unknown; email: unknown }): InviteCheck {
  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (name.length < 2) return { ok: false, message: "Enter the person’s full name." };
  if (name.length > INVITE_NAME_MAX) return { ok: false, message: `Keep the name under ${INVITE_NAME_MAX} characters.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(name)) return { ok: false, message: "The name contains characters that aren’t allowed." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, message: "Enter a valid email address." };
  return { ok: true, name, email };
}
