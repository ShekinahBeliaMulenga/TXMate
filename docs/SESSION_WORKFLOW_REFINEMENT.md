# TXMate session workflow refinement

## 1. Gaps found in the original zip

### Workflow
The original `app/api/student/sessions/[sessionId]/route.ts` (received in the second zip) already implemented attendance answers, the comparison, completion, review flags and closing a one-time arrangement. Its behaviour is preserved. The gaps against your spec were:

| # | Gap | Effect |
|---|-----|--------|
| 1 | No group-session model. One session = one student = one arrangement. | The Academic Mate would answer once per student. |
| 2 | The mate prompt was one notification per student. | 8 students = 8 notifications. |
| 3 | The completion prompt went to both sides at the scheduled end even when attendance was not verified. | Prompts for actions that are not allowed yet. |
| 4 | Notifications had no uniqueness key. Duplicate protection relied on claim columns; the conflict notice used `findFirst` on the body text. | Retries and races could duplicate. |
| 5 | No API or UI reads in-app notifications. `Notification` rows only fed push. | Users had nothing to open. |
| 6 | Reminders linked to the conversation; push fell back to `/student/sessions`. | Not "straight to the action". |
| 7 | An overdue 12 h window was only flagged when a user tried to act or the cron ran. | Small window where state was stale. Now self-heals. |
| 8 | Answers did not lock the session row, so a late cancellation could interleave. | Now serialised with row locks. |
| 9 | A student could not correct a mistaken attendance answer (your mockup says they can until the mate confirms). | |
| 10 | Reminders ran before grouping in the cron, and a rescheduled session kept its old slot. | Fixed: the cron groups first. |

### Interface
- Two nav items (Sessions, Reschedules) shared the calendar icon; no search anywhere in the shell.
- One badge mixed time and resolution ("Next action available", "Arrangement paused", "Review required").
- Four tabs mixed concepts (To do / Schedule / Issues / History); two-pane layout hidden on mobile, so every action needed a tap into a detail page.
- Misleading copy: "Manage session", "Report a completion issue", "Confirm your attendance" (for the mate), "Both confirmations are still outstanding".

## 2. What changed

**Data model** (`prisma/migrations/20261024000000_session_groups_and_notification_dedupe`)
- `SessionGroup` (offering + exact time window, unique) and nullable `TutoringSession.groupId`. Each student keeps their own session, arrangement, chat, payment and reschedule. The group only lets the mate answer once.
- `Notification.dedupeKey` (unique, nullable so old rows are untouched).
- Backfills groups for open sessions. Completed/cancelled sessions stay ungrouped.

**Rules** (`lib/session-lifecycle-rules.ts`, pure, no DB): 20 min / 10 min windows, comparison, 12 h deadline, time status vs resolution status, available actions. Server, scheduler and UI all use it.

**Writes** (`lib/session-lifecycle-service.ts`): row-locked transactions; conditional updates so cancelled sessions are never revived; sessions start themselves if the cron is late; overdue completion self-flags; one-time arrangement closes on valid completion, recurring is untouched.

**Routes**
- `GET/POST /api/student/sessions/[sessionId]`: detail, attendance, confirm, dispute.
- `GET/POST /api/student/academic-mate/session-groups/[groupId]`: the group sheet, one attendance submit, one completion confirm.
- `GET/POST /api/student/notifications`: list, unread count, mark read.
- `GET /api/student/sessions`: now returns `groupId` / `offeringId`, uses the shared serializer.

**Scheduler / notifications**: student prompt per session; mate prompt once per group; completion prompt only after end + verified attendance; one reminder 2 h before the deadline; review flag at 12 h; every one-off event has a `dedupeKey`.

**UI**: Sessions list, session page, group attendance sheet, notification bell, nav search (also `/student/sessions?q=`), distinct icons.

## 3. Deploy
```
npm ci
npx prisma generate          # regenerates generated/prisma with SessionGroup + dedupeKey
npx prisma migrate deploy
npm run build
bun test tests               # or: npx tsx --test tests/session-lifecycle-rules.test.ts
```

## 4. Reconciliation with your original files
- `app/api/student/sessions/[sessionId]/route.ts` is **replaced** by a thinner route that calls `lib/session-lifecycle-service.ts`. Kept from the original: same request bodies (`ATTENDANCE`, `COMPLETION` + `CONFIRM`/`DISPUTE`), 403 for non-participants, a completion dispute sets the session to `DISPUTED`, a one-time arrangement closes on valid completion, and a recurring arrangement with a passed end date closes with its last open session (same advisory lock as the generator).
- `app/student/sessions/[sessionId]/page.tsx`, the cancel / cancel-arrangement / reschedule / conversation routes and pages are **unchanged**. Cancel only works on future `SCHEDULED` sessions, so it cannot touch a session that has started; the row lock makes that race safe either way.
- The `*.bak` files in your zip are not part of this work. Consider deleting them, and `messages/route.tsx` next to a `.bak` of `route.ts` looks like a leftover.

## 5. Open decisions
1. **Attendance never resolves** if one side never answers. The spec says "remains pending", so it does, forever. Consider flagging for review N hours after the end.
2. **NO_SHOW does not close a one-time arrangement.** Only valid completion does, per the spec.
3. **Independence.** Following your mockup, the mate sees what each student said before answering (prefilled). That makes disagreements rare. Hide the column if you want strictly independent answers.
4. Payments are not touched on completion.

## Automatic in-app prompt

A small card slides up on any student page when a session needs the user's answer, so they rarely have to open Sessions.

- Student: "Did you attend …?" (Yes / No) from 20 minutes after the start; later "Was your session completed?" once attendance is verified and the session has ended.
- Academic Mate: one card per group ("Confirm attendance for N students") opening the group sheet from 10 minutes before the end; a single-student session gets inline Yes / No.
- Same rules as the server (`availableActions`), polled every 30 s while the tab is visible, and on focus. Stops 48 h after the end. Hidden on `/student/sessions/*`, where the action is already on screen. "✕" hides it for the browser session only; it returns on a new visit if still unanswered.
- Files: `lib/session-prompts-core.ts` (pure), `lib/session-prompts.ts`, `app/api/student/session-prompts/route.ts`, `components/student/session-prompt.tsx`, mounted in `student-app-shell.tsx`. Tests: `tests/session-prompts.test.ts`.
- Not compiled or tried in a browser here; run the build and check it on a phone-width screen.

## Round 3 changes

**Attendance rules**
- The Academic Mate answers after the student. Until a student has answered, their row shows "waiting" and the mate can't answer for them. The mate prompt/notification is sent once a student has answered. If a student never answers, attendance stays pending (still an open decision).
- A student may change an attendance answer at most 3 times (`Attendance.studentAnswerChanges`, migration `20261024120000_attendance_answer_changes`). Enforced in the rules, the API and the database update.

**Sessions UI**
- Session details and the mate's attendance list open as pop-ups on `/student/sessions` (`?session=<id>` / `?group=<id>`). The old `/student/sessions/<id>` and `/student/sessions/group/<id>` URLs redirect there, so old notification links still work.
- Icon-only controls (chat, close, back, show/hide password, delete, mark read). The mate list is compact: a tick per student, prefilled from the student's answer, "All attended", one confirm. A small two-step tracker (attendance, completion) sits on cards and in the pop-ups.

**Messages status**: the Messages list now judges a session by the clock as well as its stored status (Upcoming / In progress / Awaiting confirmation / Completed / Needs review), and refreshes every 30 s.

**Navigation**: Messages sits next to the bell on mobile; Find a Mate replaces it in the bottom bar; the bell is also in the desktop sidebar. Top search ranks by exact/prefix/keyword/typo (`lib/nav-search.ts`) and can search mates, sessions and messages (`?q=`).

**Notifications**: can be deleted one by one or all at once (hidden with `Notification.deletedAt`, migration `20261025000000_notification_soft_delete`, so dedupe keys keep working). Opening or deleting one lowers the unread count at once.

**Reviews and ratings** (uses the existing `Review` table; no new migration)
- A student reviews a completed session: 1–5 stars plus an optional comment (500 characters). One review per student per arrangement, so a weekly recurring student can't stack ratings. It can be edited for 30 days.
- After completion a slide-up asks "How was …?" for 14 days. Tapping a star saves the rating straight away; the comment can be added from the session pop-up. Skipping is remembered on that device.
- The Academic Mate gets a "New N-star review" notification. Reviews show on the mate's profile (and the preview page) with a rating summary and per-star bars; Find a Mate cards show the average and count.
- Averages come from database totals, and only the latest 50 reviews are listed.

**Push notifications**: "Registration failed – push service error" comes from the browser's push service, not from the app logic. Registration now clears a stale subscription and retries once, and otherwise explains what to check (VPN/ad blocker, Brave's "Use Google services for push messaging", network access to Google).

**Deploy**: `npx prisma generate`, `npx prisma migrate deploy` (two new migrations), `npm run build`.


## Round 4 changes
- **Cancellation transparency**: `TutoringSession.cancelledByUserId` (migration `20261026000000_session_cancelled_by`, with backfill). `lib/cancellation.ts` builds one "who / when / why / scope" record used by Messages, the chat header, Sessions cards and the session pop-up. Withdrawn requests now record the student as the canceller.
- **No response**: a finished session unresolved for 24h is filed as "No response" (still answerable late). Own filter on Sessions.
- **Closed conversations**: a COMPLETED or CANCELLED arrangement (all one-time ones, once done) rejects new messages on the server and in the UI.
- Opening the notification panel clears the unread badge; Sessions filter is a collapsed menu; larger Messages icon; push registration retries with back-off.
