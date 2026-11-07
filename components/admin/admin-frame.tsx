"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { ADMIN_NAV_COOKIE, currentNavItem, groupNavItems, isNavActive, type AdminNavItem } from "@/lib/admin/nav";
import AdminSignOutButton from "./admin-sign-out-button";

type Props = {
  user: { name: string; roleLabel: string };
  items: AdminNavItem[];
  badges: Record<string, number>;
  /** Read from a cookie on the server so the sidebar renders in the right state on first paint. */
  initialCollapsed: boolean;
  children: ReactNode;
};

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b324]/70";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0] ?? "A").slice(0, 2)).toUpperCase();
}

function NavLinks({ items, badges, collapsed, pathname }: { items: AdminNavItem[]; badges: Record<string, number>; collapsed: boolean; pathname: string }) {
  return (
    <nav aria-label="Admin sections" className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
      {groupNavItems(items).map(({ group, items: groupItems }) => (
        <div key={group}>
          {collapsed ? (
            <div aria-hidden="true" className="mx-3 mb-2 h-px bg-white/10" />
          ) : (
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#7d726b]">{group}</p>
          )}
          <ul className="space-y-0.5">
            {groupItems.map((item) => {
              const current = isNavActive(item, pathname);
              const count = badges[item.id] ?? 0;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    aria-label={collapsed ? (count > 0 ? `${item.label}, ${count} waiting` : item.label) : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`relative flex h-10 items-center gap-3 rounded-md px-3 text-[13.5px] font-medium transition-colors ${FOCUS} ${collapsed ? "justify-center" : ""} ${current ? "bg-white/10 text-white" : "text-[#b8aea7] hover:bg-white/5 hover:text-white"}`}
                  >
                    {current ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[#f5b324]" /> : null}
                    <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
                    {collapsed ? null : <span className="min-w-0 flex-1 break-words">{item.label}</span>}
                    {count > 0 ? (
                      collapsed ? (
                        <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#f5b324]" />
                      ) : (
                        <span className="rounded bg-[#f5b324] px-1.5 text-[11px] font-bold tabular-nums text-[#2a1f00]">{count > 99 ? "99+" : count}</span>
                      )
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/admin" className={`flex items-center gap-2.5 rounded-md ${FOCUS}`} aria-label="TXMate Admin home">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#7d1f2a] text-[13px] font-extrabold text-[#f5b324]">TX</span>
      {collapsed ? null : <span className="text-[15px] font-semibold tracking-tight text-white">TXMate <span className="font-normal text-[#8e837c]">Admin</span></span>}
    </Link>
  );
}

/**
 * The admin frame: a dark sidebar that starts collapsed to an icon rail (open it for labels), a slide-in
 * drawer on phones, and a slim top bar with the current section, console shortcut and the signed-in admin.
 */
export default function AdminFrame({ user, items, badges, initialCollapsed, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // The drawer is open only for the page it was opened on, so navigating closes it without an effect.
  const [drawerFor, setDrawerFor] = useState<string | null>(null);
  const drawerOpen = drawerFor === pathname;
  const current = currentNavItem(items, pathname);
  const hasConsole = items.some((item) => item.id === "console");

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerFor(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // ` opens the console from anywhere (unless the person is typing).
  useEffect(() => {
    if (!hasConsole) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "`" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      router.push("/admin/console");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasConsole, router]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      document.cookie = `${ADMIN_NAV_COOKIE}=${next ? "collapsed" : "open"}; path=/admin; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: the sidebar still works, it just won't be remembered.
    }
  }

  return (
    <div className="flex min-h-screen bg-[#f6f5f3] text-[#1f1a17]">
      {/* Desktop sidebar */}
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-[#1a1614] transition-[width] duration-200 lg:flex ${collapsed ? "w-[4.5rem]" : "w-60"}`}>
        <div className={`flex h-14 items-center border-b border-white/10 px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
          {collapsed ? null : <Brand collapsed={false} />}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex h-9 w-9 items-center justify-center rounded-md text-[#b8aea7] transition-colors hover:bg-white/10 hover:text-white ${FOCUS}`}
          >
            <Icon name="sidebar" className="h-[18px] w-[18px]" />
          </button>
        </div>
        <NavLinks items={items} badges={badges} collapsed={collapsed} pathname={pathname} />
      </aside>

      {/* Phone drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button type="button" aria-label="Close navigation" onClick={() => setDrawerFor(null)} className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[#1a1614] shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-3">
              <Brand collapsed={false} />
              <button type="button" onClick={() => setDrawerFor(null)} aria-label="Close navigation" className={`flex h-10 w-10 items-center justify-center rounded-md text-[#b8aea7] hover:bg-white/10 ${FOCUS}`}>
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <NavLinks items={items} badges={badges} collapsed={false} pathname={pathname} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-[#e4dfd9] bg-white px-2 sm:gap-2 sm:px-4">
          <button type="button" onClick={() => setDrawerFor(pathname)} aria-label="Open navigation" className="flex h-10 w-10 items-center justify-center rounded-md text-[#3a332f] hover:bg-[#f1ede8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 lg:hidden">
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <p className="min-w-0 flex-1 break-words px-1 text-sm font-semibold text-[#1f1a17]">{current?.label ?? "Admin"}</p>
          {hasConsole ? (
            <Link href="/admin/console" aria-label="Open console" title="Console (press `)" className="flex h-10 w-10 items-center justify-center rounded-md text-[#3a332f] hover:bg-[#f1ede8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">
              <Icon name="terminal" className="h-5 w-5" />
            </Link>
          ) : null}
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-[13px] font-semibold">{user.name}</p>
            <p className="text-xs text-[#7a716a]">{user.roleLabel}</p>
          </div>
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1614] text-[11px] font-bold text-[#f5b324]">{initialsOf(user.name)}</span>
          <AdminSignOutButton />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
