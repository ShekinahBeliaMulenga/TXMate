# Admin portal

One app, one auth system, a separate door. Admins sign in at `/admin/login`; students and Academic
Mates are unaffected.

## How access works

- **Who is an admin:** a row in `AdminProfile` (role) plus optional `AdminUniversityAccess` rows.
  Nothing on the public register page can create one. Create admins with `scripts/create-admin.ts`
  (reads `ADMIN_EMAIL`, `ADMIN_ROLE`, `ADMIN_UNIVERSITY_CODES` from the environment; no credentials in code).
- **One guard:** `lib/admin/guard.ts`. API routes start with `authorizeAdmin("<permission>")`; server pages
  and layouts start with `requireAdminPage("<permission>")`. Never check role names in a route.
- **Permissions:** `lib/admin/permissions.ts` maps each role to explicit permissions (least privilege).
  Platform admins see every university; everyone else is limited to `AdminUniversityAccess`
  (`universityScopeFilter` / `canAccessUniversity`).
- **Sessions:** admin access additionally requires the session to be younger than 12 hours
  (`lib/admin/session-policy.ts`), whatever the app-wide session length is. Signing out revokes the session.
- **Not-an-admin:** signed-out users are sent to `/admin/login`; signed-in non-admins get a 404.
  The sign-in form shows one generic error for every failure.

## Audit log

`AdminAuditLog` is append-only (the app never updates or deletes it). `recordAudit(tx, ...)` is called inside the
same transaction as the change, so a sensitive action cannot commit without its audit row. Recorded today:
admin sign-in, verification approved/rejected, dispute resolved (with the decision note).
Add an action to `AUDIT_ACTIONS` in `lib/admin/audit.ts` before using it.

## Sessions needing review (disputes)

`/admin/disputes` lists sessions the student app labels "Needs review" (attendance mismatch, reported
problem, overdue confirmation), scoped to the admin's universities. Deciding requires `disputes:resolve`
and a written reason. Outcomes:

- **Took place** → session COMPLETED; a one-time arrangement is COMPLETED.
- **Did not take place** → session NO_SHOW; a one-time arrangement is released (EXPIRED) so the student can request again.

Both people are notified. The original answers stay on the record; the decision is stamped on the attendance row.

## Adding a new admin feature

1. Add a permission in `permissions.ts` and grant it to roles.
2. API route: `authorizeAdmin(permission)` first, scope queries with `universityScopeFilter`, audit inside the transaction.
3. Page: `requireAdminPage(permission)`, wrap in `AdminShell`, add the nav entry in `components/admin/admin-shell.tsx`.
4. Keep client-imported types in a file with no server imports (see `lib/admin/dispute-types.ts`).

## Not built yet

MFA for admins, user suspension/reactivation, university settings (student ID rules), an audit log viewer page.

## Round 2: navigation, users and audit log

**Layout.** Every admin page lives inside one frame (`components/admin/admin-frame.tsx`): a sidebar that starts collapsed to an icon rail (open it for labels; the choice is remembered in the `txmate_admin_nav` cookie so there is no flicker), a phone drawer, and a top bar with the signed-in admin and sign out. Section layouts (`app/admin/<section>/layout.tsx`) wrap their pages with `AdminSection`, which enforces the permission on the server and loads the sidebar badges. The dashboard wraps itself.

**Adding a page.** Add one entry to `lib/admin/nav.ts` (label, href, icon, group, permission), create `app/admin/<section>/layout.tsx` using `AdminSection`, and build the page with `AdminPage`, `Card`, `Badge` and `EmptyState`. Roles without the permission never see the entry.

**Users (`/admin/users`).** Search by name, email or student ID; filter by students/mates and suspended. Detail page shows each account's status and admin history. `users:suspend` (platform and university admins) can suspend or reactivate the student account or the Academic Mate profile with a required reason. Rules enforced in `lib/admin/users.ts`: only ACTIVE <-> SUSPENDED moves; admin accounts and your own account are refused; scope by university; status is claimed with a conditional update so two admins cannot both act; the person is notified; the action and reason are written to the audit log in the same transaction.

Effects of suspension:
- Student: all sessions are deleted (signed out everywhere), `/api/auth/redirect` refuses a new sign-in with a clear message (the login page shows it and signs out), and existing student APIs already require an ACTIVE profile for requests and booking.
- Academic Mate: the profile is hidden and cannot take requests (existing visibility rules require ACTIVE and VERIFIED). They can still sign in.
- A hard block at the auth layer (for example Google sign-in) would need a better-auth database hook; it is not part of this change.

**Audit log (`/admin/audit`).** Newest first, filter by action, load more. Platform admins see everything; others see entries for their universities.

No schema change in this round.

## Round 3: premium redesign, console, universities and admin roles

**Design kit** (`components/admin/admin-ui.tsx`, `admin-controls.tsx`, `admin-page.tsx`): flat panels with hairline borders, data tables that collapse to two-line rows on phones, underline tabs, dot-style status badges, rectangular toolbars. Build new pages from these instead of ad hoc cards. Dark sidebar, gold active marker and badge counts.

**Audit log**: grouped by day, one row per action with a coloured status dot, admin and summary; click a row for the full record (time, who, target, IP, stored reason). Filter by action and admin name.

**Console (`/admin/console`, press the backtick key anywhere)**: type `?` for the commands your role may run. All commands are read-only (`stats`, `queue`, `users`, `user`, `audit`, `universities`, `admins`, `goto`, `whoami`, `clear`). Each command re-checks its permission on the server (`lib/admin/console.ts`); changes stay in the pages where they are confirmed and audited. Add a command by adding it to `CONSOLE_COMMANDS` and a `case` in `runConsoleCommand`.

**Universities (`/admin/universities`, platform admin)**: add a university (name and unique code), set active/inactive and student ID rules (length, prefix, regular expression with a live example check, university email domain). Patterns are validated for compile errors and nested-quantifier backtracking before saving. All changes are audited.

**Admins (`/admin/admins`, platform admin)**: give an existing account a role (Platform, University admin, Moderator, Support) and choose which universities it covers; edit or remove later. The person must already have a TXMate account. You cannot change or remove yourself, and the last platform admin cannot be demoted or removed. Changes apply on the person's next request. All changes are audited.

First platform admin is still created with `scripts/create-admin.ts`; after that, admins are managed in the portal.

No schema change in this round.

## Academic structure import

Open **Universities → a university → Schools, departments and programmes**. Upload or paste a CSV, press **Preview changes** to see exactly what will be created or updated, then **Import**. Columns: `school_code, school_name, department_code, department_name, programme_code, programme_name, level, duration_years` (departments optional; level defaults to BACHELOR, duration to 4). The import is all-or-nothing, upserts by code, never deletes, never moves an existing programme to another school, and creates programme years 1 to the duration. It is recorded in the audit log. Ready-made files for UNZA and CBU, with their caveats, are in `docs/academic-data/`.  Courses are imported separately (see Round 6).

## Round 4

Added: a working Console page (`/admin/console`) with the commands listed by `?`; consequential commands (`user suspend`, `user activate`, `dispute resolve`) need a written reason and a yes/no confirmation, and use the same functions, permission checks and audit entries as the pages. Tutoring directory (`/admin/tutoring`: requests, arrangements and sessions with search, status filter, paging and full details). System health (`/admin/health`: database, notification delivery failures, six real data checks). Academic structure (`/admin/structure`: add departments, assign a programme's department, set its years). A fuller dashboard (all counts real and scoped to the admin's universities). Permissions `tutoring:view` (all roles) and `system:view` (platform and university admins). Warnings and confirmations before: importing academic data, changing a programme that has students, deactivating a university, removing an admin, suspending or reactivating, resolving a session. Text is wrapped everywhere instead of cut off.

Import change: a blank `duration_years` now means "unknown" and creates no programme years (previously 4). The import panel offers an optional default for blank rows and warns how many programmes students cannot pick yet.

Not built yet: verification approve/reject from the console, messaging access, deletion and anonymisation, complaints and support cases, platform configuration, moderation tools, analytics beyond the dashboard counts, and admin MFA.

## Round 5

Needs a database migration: run `npx prisma migrate deploy` (or `migrate dev`) so `20261030000000_support_cases_moderation` is applied, then `npx prisma generate`.

Added:
- **Support cases** (`/admin/support`): open a case about a person or a university, take it, add append-only notes, set priority, and resolve or close it with a written outcome. Console: `cases`.
- **Review moderation** (`/admin/reviews`): hide or restore a review with a reason. Hidden reviews are not shown to students and are not counted in ratings (the student-facing routes and `getRatingSummary` now filter `hiddenAt`). Moderators and above.
- **Message access**: in Tutoring, an expanded request has "Read messages". It needs a reason and writes `MESSAGES_VIEWED` to the audit log. The same panel turns a student's messaging off or on for that conversation. Platform and university admins only (`messages:view`).
- **Account anonymisation** (user page, platform admins only): removes personal details irreversibly after typing the email, a reason and a tick. Refused while the person has unfinished sessions. Earlier audit log lines may still show the old name.
- **Analytics** (`/admin/analytics`): eight weekly windows of new students, new mates, requests and completed sessions; 30-day acceptance and completion rates; 90-day average rating and most requested courses; per-university counts. Console: `analytics`.
- New permissions: `support:manage`, `reviews:moderate`, `messages:view`, `users:anonymise`, `analytics:view`.

Deliberately not built: admin two-factor sign-in (it changes the sign-in flow and needs a real browser test so admins are not locked out) and platform-wide configuration (the app has no global settings to configure; per-university rules already live on the Universities page).

## Round 6

Needs a migration: `npx prisma migrate deploy`, then `npx prisma generate`. Also run `npm install` (adds `nodemailer`).

- **Courses import** (Universities → a university → Courses import): columns `programme_code, year_number, course_code, course_name, semester, type, elective_group, min_selections, max_selections, credits`. Programmes and their years must already exist. Upserts only; renames are listed in the preview. No course data file is shipped, because none has been verified.
- **Start from headings**: the structure template is now headings only. An empty file is refused, and the preview lists existing names that will be overwritten.
- **Structure page** shows how many courses each programme has.
- **Console**: `users all [page]` lists every user, 25 per page. The terminal now behaves like one (inline prompt, history with the arrow keys, Tab completion, Ctrl+L, Ctrl+C, `clear`, `history`, `exit`).
- **Analytics** is a Power BI-style report with a university slicer and 4/8/12/26-week range, KPI cards compared with the previous period, line, column, donut and bar charts.
- **Email verification**: see `docs/EMAIL_VERIFICATION.md`.

## Round 12: session states and date search

- **Session state.** The database keeps a session as "In progress" until both people confirm. The admin dashboard, the Tutoring list, analytics and the console now show the real state instead (`lib/admin/session-state.ts`): Upcoming, In progress (happening right now), Ended awaiting confirmation, No response (ended more than 24 hours ago with no answer), Needs review, Completed, No show, Cancelled. The status filter and the dashboard counts use the same rules as the label on each row.
- **Date search.** Tutoring (requests by date requested, sessions by start date), Users (date joined), Reviews (date written), Support (date opened) and the audit log (date recorded) have From / To fields. Days are Zambia time and both ends are inclusive.
- **Search boxes.** Admins and Structure (programmes) now have one. Universities, Verification, Disputes and Health have none because they are short, fixed lists or queues worked from the top.

## Round 13: two-step sign-in for admins

**What it is.** After the password, every admin enters a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password). Ten one-time backup codes are shown once at setup for a lost phone. Admins who have not set it up are taken through setup on their next visit; nothing else in the portal opens until they do.

**Where it is enforced.** In `lib/admin/guard.ts`, the one place every admin page and route goes through. A session counts as an admin session only when `AdminSessionMfa` has a row for it. Signing in from the student login page does not get around it: the check is on the admin side, not on the form.

**Safeguards.**
- The authenticator secret is stored encrypted (AES-256-GCM) and tied to its admin. Backup codes are stored only as keyed hashes and each works once.
- A code cannot be used twice (the last accepted 30-second step is stored and claimed in the database).
- Five wrong codes in a row lock two-step attempts for 15 minutes. Wrong codes, locks, setup, backup-code use and resets are all in the audit log.
- If no key is configured the portal stays closed (503) instead of skipping the step.
- Resetting someone is done by another platform admin (Admins, open a row, Reset two-step sign-in), never for yourself. It signs the person out everywhere. If the only platform admin is locked out: `npx tsx scripts/reset-admin-two-step.ts admin@example.com` on the server.
- An admin cannot decide a session they took part in, or review their own Academic Mate application.

**To deploy.**
1. `npx prisma migrate deploy` then `npx prisma generate` (new tables: AdminTwoFactor, AdminBackupCode, AdminSessionMfa).
2. Set `ADMIN_MFA_ENCRYPTION_KEY` in the environment: 32 random bytes, base64. Create one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. If it is not set, a key is derived from `BETTER_AUTH_SECRET`. Changing either later makes every existing setup unreadable, so keep it and back it up; if it is lost, every admin must be reset.
3. Restart. Every admin will be asked to set up on their next sign-in.

## Two-step setup QR code
The setup screen shows a QR code to scan with the authenticator app, with the typed setup key kept underneath as a fallback. The code is drawn in the browser by `lib/qr.ts` (no package, nothing sent to a QR service), so the secret never leaves the admin's own screen. It handles setup links up to 213 characters, far more than the real link needs.
