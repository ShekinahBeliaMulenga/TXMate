import type { Metadata } from "next";
import type { ReactNode } from "react";

// The admin portal is internal: keep it out of search results and never cache its pages.
export const metadata: Metadata = {
  title: "TXMate Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
