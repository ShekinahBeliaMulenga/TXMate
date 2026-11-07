import type { ReactNode } from "react";
import AdminSection from "@/components/admin/admin-section";

export default function Layout({ children }: { children: ReactNode }) {
  return <AdminSection permission="system:view">{children}</AdminSection>;
}
