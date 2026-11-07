export type EmailContent = { subject: string; text: string; html: string };

const APP = "TXMate";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Only http(s) links go into an email, so a bad value can never become a script link. */
function safeUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Email links must be http or https.");
  return parsed.toString();
}

function layout(heading: string, paragraphs: string[], button: { label: string; url: string }, footer: string): string {
  const url = escapeHtml(button.url);
  return `<!doctype html><html><body style="margin:0;background:#faf9f6;font-family:Arial,Helvetica,sans-serif;color:#282321">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:18px;font-weight:700;color:#4d0014">${APP}</td></tr>
<tr><td style="padding-top:16px;font-size:20px;font-weight:700">${escapeHtml(heading)}</td></tr>
${paragraphs.map((p) => `<tr><td style="padding-top:12px;font-size:14px;line-height:22px">${escapeHtml(p)}</td></tr>`).join("\n")}
<tr><td style="padding-top:24px"><a href="${url}" style="display:inline-block;background:#4d0014;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px">${escapeHtml(button.label)}</a></td></tr>
<tr><td style="padding-top:20px;font-size:12px;line-height:18px;color:#6d6260">If the button doesn’t work, copy this address into your browser:<br><span style="word-break:break-all">${url}</span></td></tr>
<tr><td style="padding-top:20px;font-size:12px;line-height:18px;color:#6d6260">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

function greet(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hi,";
}

export function verificationEmail(input: { name: string; url: string; expiresInMinutes: number }): EmailContent {
  const url = safeUrl(input.url);
  const expiry = `This link works once and expires in ${input.expiresInMinutes} minutes.`;
  const footer = "If you didn’t create a TXMate account, you can ignore this email.";
  const body = ["Please confirm your email address to finish setting up your TXMate account.", expiry];
  return {
    subject: "Confirm your TXMate email address",
    text: [greet(input.name), "", ...body, "", url, "", footer].join("\n"),
    html: layout(greet(input.name), body, { label: "Confirm email address", url }, footer),
  };
}

export function changeEmailConfirmation(input: { name: string; newEmail: string; url: string; expiresInMinutes: number }): EmailContent {
  const url = safeUrl(input.url);
  const body = [
    `You asked to change your TXMate email address to ${input.newEmail}.`,
    `Approve the change to continue. We will then ask the new address to confirm it. ${`This link works once and expires in ${input.expiresInMinutes} minutes.`}`,
  ];
  const footer = "If you didn’t ask for this, don’t click the button and change your password.";
  return {
    subject: "Approve your TXMate email change",
    text: [greet(input.name), "", ...body, "", url, "", footer].join("\n"),
    html: layout(greet(input.name), body, { label: "Approve email change", url }, footer),
  };
}

export function existingAccountNotice(input: { name: string; signInUrl: string }): EmailContent {
  const url = safeUrl(input.signInUrl);
  const body = ["Someone tried to create a TXMate account with this email address, but one already exists.", "If it was you, sign in instead. If it wasn’t, you don’t need to do anything."];
  const footer = "Your account has not been changed.";
  return {
    subject: "Someone tried to sign up with your TXMate email",
    text: [greet(input.name), "", ...body, "", url, "", footer].join("\n"),
    html: layout(greet(input.name), body, { label: "Go to sign in", url }, footer),
  };
}

export function passwordResetEmail(input: { name: string; url: string; expiresInMinutes: number }): EmailContent {
  const url = safeUrl(input.url);
  const body = ["We got a request to reset the password for your TXMate account.", `This link works once and expires in ${input.expiresInMinutes} minutes. Opening it lets you choose a new password; you will be signed out on your other devices.`];
  const footer = "If you didn’t ask for this, ignore this email. Your password has not changed.";
  return {
    subject: "Reset your TXMate password",
    text: [greet(input.name), "", ...body, "", url, "", footer].join("\n"),
    html: layout(greet(input.name), body, { label: "Choose a new password", url }, footer),
  };
}

export function adminInviteEmail(input: { name: string; roleLabel: string; url: string; expiresInMinutes: number }): EmailContent {
  const url = safeUrl(input.url);
  const body = [`You have been invited to the TXMate admin portal as ${input.roleLabel}.`, `Choose your own password to activate your account. This link works once and expires in ${input.expiresInMinutes} minutes. If it expires, ask the person who invited you to send a new one.`];
  const footer = "If you weren’t expecting this, ignore this email. No account is active until you choose a password.";
  return {
    subject: "You’ve been invited to the TXMate admin portal",
    text: [greet(input.name), "", ...body, "", url, "", footer].join("\n"),
    html: layout(greet(input.name), body, { label: "Choose your password", url }, footer),
  };
}
