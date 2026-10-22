/* global importScripts, firebase, self */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.focus();
        if ("navigate" in client && client.url !== target) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBQvkgThXmRjpQ6KVSMkhREGHutV5kaIcU",
  authDomain: "txmate-x1122.firebaseapp.com",
  projectId: "txmate-x1122",
  storageBucket: "txmate-x1122.firebasestorage.app",
  messagingSenderId: "400428780721",
  appId: "1:400428780721:web:8d38fec9cef9c3657ce690"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  // FCM displays notification payloads automatically when no page is visible.
  // Only create our own notification for data-only messages to avoid duplicates.
  if (payload.notification) return;
  const title = payload.data?.title || "TXMate";
  const options = {
    body: payload.data?.body || payload.notification?.body || "You have a new notification.",
    icon: "/icons/icon-192x192.png",
    data: { url: payload.data?.url || "/" }
  };
  return self.registration.showNotification(title, options);
});
