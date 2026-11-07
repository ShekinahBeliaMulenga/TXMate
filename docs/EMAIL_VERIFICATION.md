# Email verification

## What you must provide (environment variables)

| Variable | Required | Notes |
| --- | --- | --- |
| `SMTP_HOST` | yes | e.g. `smtp.gmail.com`, `smtp.sendgrid.net`, your university relay |
| `SMTP_PORT` | no (587) | 587 uses STARTTLS, 465 uses TLS from the start |
| `SMTP_SECURE` | no | `true` for TLS from the start. Defaults to true only on port 465 |
| `SMTP_USER`, `SMTP_PASS` | together | Omit both only for a relay that needs no login |
| `SMTP_FROM` | yes | e.g. `TXMate <no-reply@yourdomain.com>`. Use an address your SMTP provider allows |
| `BETTER_AUTH_URL` | yes in production | Public address of the app, e.g. `https://txmate.example.com`. Verification links are built from it |
| `BETTER_AUTH_SECRET` | yes | Already required by Better Auth |

If SMTP is not configured, sending fails with an error that names what is missing. Nothing pretends to succeed, and nobody is marked verified.
STARTTLS is required when `SMTP_SECURE` is not true, so a relay that offers no TLS will be refused.

## Behaviour

- Sign-up creates the account but no session. A verification email is sent; the person opens the link (valid 1 hour, usable once) and is signed in.
- Password sign-in is refused until the email is verified. A correct password with an unverified email sends a fresh link and shows the "Check your email" screen.
- Resend: 60 seconds between emails to one address, 5 per hour per address, plus Better Auth limits per IP (3 resends, 10 sign-ins, 5 sign-ups, 3 email changes per minute).
- Signing up with an address that already has an account looks the same as a new sign-up. The owner gets an email saying someone tried.
- Google sign-in works for Google-created accounts. It never attaches itself to an existing account with the same email. Link it from Settings → Email and sign-in while signed in.
- Changing email: the current address approves, then the new address confirms. The email changes only after both.
- Links work once. The first time a link is opened its hash is stored (`UsedEmailToken`). A scanner that opens the link first will use it up; the person then asks for a new one.

## Existing accounts

The migration marks nobody verified and deletes no data. It ends the sign-in sessions of accounts that are not verified. Those people verify through the link emailed when they next try to sign in. Admin accounts are included: configure SMTP before deploying, or an unverified admin cannot sign in.

## Limits to know

- The per-address throttle is held in the server process. With more than one server instance, move it to shared storage.
- Better Auth's per-IP rate limit uses its default (memory) storage.
