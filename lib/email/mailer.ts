import nodemailer, { type Transporter } from "nodemailer";
import type { EmailContent } from "./templates";
import { readSmtpConfig, type SmtpConfig } from "./smtp-config";

export class MailNotConfiguredError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Email is not configured: ${problems.join(" ")}`);
    this.name = "MailNotConfiguredError";
  }
}

let cached: { config: SmtpConfig; transport: Transporter } | null = null;

function transport(): { config: SmtpConfig; transport: Transporter } {
  if (cached) return cached;
  const result = readSmtpConfig(process.env);
  if (!result.ok) throw new MailNotConfiguredError(result.problems);
  const { config } = result;
  cached = {
    config,
    transport: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
      requireTLS: !config.secure,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    }),
  };
  return cached;
}

/** Sends one email over SMTP. Throws if SMTP is not configured or the server refuses; it never pretends to succeed. */
export async function sendMail(to: string, content: EmailContent): Promise<void> {
  const { config, transport: smtp } = transport();
  await smtp.sendMail({ from: config.from, to, subject: content.subject, text: content.text, html: content.html });
}

/** For the health check and start-up logging. Does not open a connection. */
export function mailConfigurationProblems(): string[] {
  const result = readSmtpConfig(process.env);
  return result.ok ? [] : result.problems;
}
