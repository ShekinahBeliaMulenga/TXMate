export type SmtpConfig = { host: string; port: number; secure: boolean; user: string | null; pass: string | null; from: string };

export type SmtpReadResult = { ok: true; config: SmtpConfig } | { ok: false; problems: string[] };

type Env = Record<string, string | undefined>;

/**
 * Reads SMTP settings from environment variables. Nothing is defaulted that would hide a mistake:
 * a missing host or sender is reported, never replaced with a placeholder.
 *
 *   SMTP_HOST (required)   SMTP_PORT (default 587)   SMTP_SECURE ("true" for implicit TLS; default true only on port 465)
 *   SMTP_USER + SMTP_PASS (both or neither)   SMTP_FROM (required), e.g.  TXMate <no-reply@example.com>
 */
export function readSmtpConfig(env: Env): SmtpReadResult {
  const problems: string[] = [];
  const host = env.SMTP_HOST?.trim() ?? "";
  const from = env.SMTP_FROM?.trim() ?? "";
  const user = env.SMTP_USER?.trim() || null;
  const pass = env.SMTP_PASS ? env.SMTP_PASS : null;

  if (!host) problems.push("SMTP_HOST is not set.");
  if (!from) problems.push("SMTP_FROM is not set.");
  else if (!/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/.test(from)) problems.push("SMTP_FROM must contain an email address.");
  if (/[\r\n]/.test(from)) problems.push("SMTP_FROM must be a single line.");

  const rawPort = env.SMTP_PORT?.trim();
  const port = rawPort ? Number(rawPort) : 587;
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push("SMTP_PORT must be a whole number from 1 to 65535.");

  const rawSecure = env.SMTP_SECURE?.trim().toLowerCase();
  if (rawSecure && !["true", "false"].includes(rawSecure)) problems.push('SMTP_SECURE must be "true" or "false".');
  const secure = rawSecure ? rawSecure === "true" : port === 465;

  if ((user && !pass) || (!user && pass)) problems.push("SMTP_USER and SMTP_PASS must be set together.");

  if (problems.length) return { ok: false, problems };
  return { ok: true, config: { host, port, secure, user, pass, from } };
}
