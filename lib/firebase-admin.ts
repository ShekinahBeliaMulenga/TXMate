import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("Firebase project ID is missing.");

const app = getApps().find((item) => item.name === "txmate-admin") ?? initializeApp({
  credential: applicationDefault(),
  projectId,
}, "txmate-admin");

export const firebaseAdminMessaging = getMessaging(app);
