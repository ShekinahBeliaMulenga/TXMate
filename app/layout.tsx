import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import FirebaseForegroundPushListener from "@/components/firebase-foreground-push-listener";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TXMate",
  description: "TXMate is a platform that connects students with verified academic mates for personalized tutoring and academic support.",
  applicationName: "TXMate",
  appleWebApp: { capable: true, title: "TXMate", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#7d1f2a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><FirebaseForegroundPushListener />{children}</body>
    </html>
  );
}
