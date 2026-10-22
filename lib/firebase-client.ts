"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported, onMessage, type MessagePayload } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const TOKEN_STORAGE_KEY = "txmate-fcm-token";
let foregroundListenerAttached = false;

function getFirebaseApp() {
  for (const key of ["apiKey", "projectId", "messagingSenderId", "appId"] as const) {
    if (!firebaseConfig[key]) throw new Error(`Missing Firebase configuration: ${key}`);
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

function showForegroundNotification(payload: MessagePayload) {
  if (Notification.permission !== "granted") return;
  const title = payload.notification?.title || payload.data?.title || "TXMate";
  const body = payload.notification?.body || payload.data?.body || "You have a new notification.";
  void navigator.serviceWorker.ready.then((registration) =>
    registration.showNotification(title, { body, icon: "/icons/icon-192x192.png", data: { url: payload.data?.url || "/" } }),
  ).catch((error) => console.error("[push] Unable to display foreground notification:", error));
}

async function getBrowserMessaging() {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !(await isSupported())) {
    throw new Error("Push notifications are not supported in this browser.");
  }
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error("Firebase VAPID public key is missing.");
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { updateViaCache: "none" });
  await registration.update();
  const pendingWorker = registration.installing ?? registration.waiting;
  if (pendingWorker && pendingWorker.state !== "activated") {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pendingWorker.removeEventListener("statechange", onStateChange);
        reject(new Error("TXMate notification service worker did not activate. Reload the page and try again."));
      }, 15000);
      const onStateChange = () => {
        if (pendingWorker.state === "activated") {
          window.clearTimeout(timeout);
          pendingWorker.removeEventListener("statechange", onStateChange);
          resolve();
        } else if (pendingWorker.state === "redundant") {
          window.clearTimeout(timeout);
          pendingWorker.removeEventListener("statechange", onStateChange);
          reject(new Error("TXMate notification service worker update failed. Reload the page and try again."));
        }
      };
      pendingWorker.addEventListener("statechange", onStateChange);
      onStateChange();
    });
  }
  const activeRegistration = await navigator.serviceWorker.ready;
  if (!activeRegistration.active || activeRegistration.active.state !== "activated") {
    throw new Error("TXMate notification service worker is not active. Reload the page and try again.");
  }
  const messaging = getMessaging(getFirebaseApp());
  if (!foregroundListenerAttached) {
    onMessage(messaging, showForegroundNotification);
    foregroundListenerAttached = true;
  }
  return { messaging, vapidKey, registration: activeRegistration };
}

export async function initializeForegroundFirebasePushListener(): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  await getBrowserMessaging();
}

export async function getExistingFirebasePushToken(): Promise<string | null> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return null;
  const { messaging, vapidKey, registration } = await getBrowserMessaging();
  return (await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })) || null;
}

export async function enableAndSaveFirebasePush(): Promise<void> {
  const { messaging, vapidKey, registration } = await getBrowserMessaging();
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Firebase did not return a push registration token. Try again.");
  const response = await fetch("/api/push/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "same-origin",
    body: JSON.stringify({ token }),
  });
  const result = await response.json().catch(() => null) as { error?: string; success?: boolean } | null;
  if (!response.ok || !result?.success) throw new Error(result?.error || "Failed to register for notifications.");
  try { localStorage.setItem(TOKEN_STORAGE_KEY, token); } catch { /* Server registration remains authoritative. */ }
}

export async function disableFirebasePush(): Promise<void> {
  let token: string | null = null;
  try { token = await getExistingFirebasePushToken(); } catch { /* Fall back to the last saved browser token. */ }
  if (!token) {
    try { token = localStorage.getItem(TOKEN_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
  }
  if (!token) return;
  const response = await fetch("/api/push/subscribe", {
    method: "DELETE", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "same-origin",
    body: JSON.stringify({ token }),
  });
  const result = await response.json().catch(() => null) as { error?: string; success?: boolean } | null;
  if (!response.ok || !result?.success) throw new Error(result?.error || "Failed to disable notifications.");
  try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch { /* Server registration has already been removed. */ }
  try {
    const { messaging } = await getBrowserMessaging();
    await deleteToken(messaging);
  } catch (error) {
    console.error("[push] Server registration removed; local token cleanup failed:", error);
  }
}
