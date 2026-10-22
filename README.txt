TXMate push-toggle patch

Replace only these four files in your existing txmate project:
- app/student/settings/page.tsx
- app/api/push/subscribe/route.ts
- app/api/push/test/route.ts
- lib/firebase-client.ts

No other source files are changed. The switch is green when enabled and gray when disabled. It checks the current browser registration on page load, registers an actual FCM token when enabled, and removes that browser's server-side registration and Firebase token when disabled.

Important database compatibility note: to avoid a schema migration and avoid touching unrelated code, the existing PushSubscription.fid database column is retained but now stores the FCM registration token. Existing rows that contain Firebase Installation IDs are not valid FCM tokens and are ignored by the test route. Toggle notifications off/on to create a valid registration for this browser.

After replacing the files, run:
  npm run build

Then test the switch in Settings. Firebase delivery still requires valid server credentials in GOOGLE_APPLICATION_CREDENTIALS and working Firebase Cloud Messaging configuration.
