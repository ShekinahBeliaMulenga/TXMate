import "dotenv/config";
import { sendMail, mailConfigurationProblems } from "../lib/email/mailer";
import { verificationEmail } from "../lib/email/templates";

/** Usage: npx tsx scripts/check-email.ts you@example.com   Sends a real test email and says exactly what failed. */
async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Give an address to send to: npx tsx scripts/check-email.ts you@example.com");
    process.exit(1);
  }
  const problems = mailConfigurationProblems();
  if (problems.length) {
    console.error("Email is not configured:\n- " + problems.join("\n- "));
    process.exit(1);
  }
  try {
    await sendMail(to, verificationEmail({ name: "Test", url: `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/verify-email`, expiresInMinutes: 60 }));
    console.log(`Sent. Check the inbox (and spam) of ${to}.`);
  } catch (error) {
    const e = error as { code?: string; responseCode?: number; message?: string };
    console.error(`Sending failed: ${e.message ?? error}`);
    if (e.responseCode === 535 || e.code === "EAUTH") console.error("The mail server refused the username or password. For Gmail, SMTP_USER must be the full address and SMTP_PASS a 16-character App Password for that same account.");
    process.exit(1);
  }
}
void main();
