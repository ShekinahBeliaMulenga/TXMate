import type { Metadata } from "next";
import NotificationsCenter from "@/components/student/notifications-center";

export const metadata: Metadata = { title: "Notifications · TXMate" };

export default function NotificationsPage() {
  return <NotificationsCenter />;
}
