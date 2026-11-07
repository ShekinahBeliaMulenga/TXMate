# Notifications page and installing TXMate (round 18)

## Notifications page (`/student/notifications`)
- Reachable from the bell ("See all notifications") and from the navigation under Account.
- Layout matches the Messages page: type pills (All, Sessions, Requests, Messages, Reviews, Updates) with unread counts, a "Latest first / Oldest first" sort, compact rows grouped Today, Yesterday, Earlier, and a small trash button on each row.
- The header has "Search" (opens a slim search box), "Mark all as read" and a trash button that deletes everything after asking first.
- There is no Payments tab because TXMate has no payments yet; payment-type notifications would appear under Updates.
- The API still accepts `unread=1`, `from` and `to`; the page no longer shows controls for them.
- Loads 20 at a time with a "Load more" button (cursor paging, so new notifications arriving meanwhile never cause repeats or gaps).
- API: `GET /api/student/notifications?q=&type=&unread=1&from=&to=&cursor=&limit=`. Every query is scoped to the signed-in user in `lib/notifications-query.ts`. The bell's existing request (`?limit=20`) behaves as before.
- Opening the bell still marks everything read, as before. The page does not; it marks read when an item is opened or when asked.

## Installing the app
- `app/manifest.ts` makes TXMate installable (name, colours, icons, shortcuts to Find a Mate, Sessions and Notifications). It opens on the student dashboard; signed-out people are sent to sign in as usual.
- Icons are in `public/icons/` (192, 512, and a maskable 512). `app/apple-icon.png` now has a white background, because iPhones paint transparent icons black. The push worker already referred to `/icons/icon-192x192.png`; that file now exists.
- `components/install-app-prompt.tsx` shows a small card with an "Install app" button when the browser allows installing (Chrome, Edge, Android). On iPhone Safari it shows the Share, then Add to Home Screen steps. It never shows in the installed app, and "Not now" hides it for 30 days.
- There is deliberately no offline mode and no new service worker: a second worker would clash with the push worker (`firebase-messaging-sw.js`) at the same scope, and caching signed-in pages is a privacy risk.
- Needs HTTPS in production (localhost works for testing). Installing is not possible on plain http.
- Dark mode was not attempted: colours are hard-coded throughout.

## Tests
`tests/notifications-query.test.ts`. Run `bun test tests`.
