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
