"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0] ?? "A").slice(0, 2)).toUpperCase();
}

function NavLinks({ items, badges, collapsed, pathname }: { items: AdminNavItem[]; badges: Record<string, number>; collapsed: boolean; pathname: string }) {
  return (
    <nav aria-label="Admin sections" className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
      {groupNavItems(items).map(({ group, items: groupItems }) => (
        <div key={group}>
          {collapsed ? (
            <div aria-hidden="true" className="mx-3 mb-2 h-px bg-[#efe8e1]" />
          ) : (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9a8e86]">{group}</p>
          )}
          <ul className="space-y-1">
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
                    className={`relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${FOCUS} ${collapsed ? "justify-center" : ""} ${current ? "bg-[#7d1f2a] text-white shadow-sm shadow-[#7d1f2a]/20" : "text-[#5f5652] hover:bg-[#f6f1ec] hover:text-[#282321]"}`}
                  >
                    <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                    {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    {count > 0 ? (
                      collapsed ? (
                        <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#f5b324] ring-2 ring-white" />
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${current ? "bg-white/20 text-white" : "bg-[#f6e7e9] text-[#7d1f2a]"}`}>{count > 99 ? "99+" : count}</span>
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
    <Link href="/admin" className={`flex items-center gap-2 text-lg font-extrabold tracking-tight ${FOCUS} rounded-lg`} aria-label="TXMate Admin home">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#7d1f2a] text-sm font-extrabold text-[#f5b324]">TX</span>
      {collapsed ? null : <span className="text-[#282321]">Mate <span className="ml-0.5 rounded-md bg-[#f6e7e9] px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-[#7d1f2a]">Admin</span></span>}
    </Link>
  );
}

/**
 * The admin frame: a sidebar that starts collapsed to an icon rail (open it for labels), a slide-in
 * drawer on phones, and a top bar with the current section, who is signed in and sign out.
 */
export default function AdminFrame({ user, items, badges, initialCollapsed, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // The drawer is open only for the page it was opened on, so navigating closes it without an effect.
  const [drawerFor, setDrawerFor] = useState<string | null>(null);
  const drawerOpen = drawerFor === pathname;
  const current = currentNavItem(items, pathname);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerFor(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

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
    <div className="flex min-h-screen bg-[#f4f1ed] text-[#282321]">
      {/* Desktop sidebar */}
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[#e2d9d0] bg-white transition-[width] duration-200 lg:flex ${collapsed ? "w-[4.75rem]" : "w-64"}`}>
        <div className={`flex h-14 items-center border-b border-[#efe8e1] px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
          {collapsed ? null : <Brand collapsed={false} />}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-[#6d6260] transition hover:bg-[#f6f1ec] ${FOCUS}`}
          >
            <Icon name="sidebar" className="h-5 w-5" />
          </button>
        </div>
        <NavLinks items={items} badges={badges} collapsed={collapsed} pathname={pathname} />
      </aside>

      {/* Phone drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button type="button" aria-label="Close navigation" onClick={() => setDrawerFor(null)} className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-[#efe8e1] px-3">
              <Brand collapsed={false} />
              <button type="button" onClick={() => setDrawerFor(null)} aria-label="Close navigation" className={`flex h-10 w-10 items-center justify-center rounded-xl text-[#6d6260] hover:bg-[#f6f1ec] ${FOCUS}`}>
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <NavLinks items={items} badges={badges} collapsed={false} pathname={pathname} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[#e2d9d0] bg-white/90 px-3 backdrop-blur sm:px-5">
          <button type="button" onClick={() => setDrawerFor(pathname)} aria-label="Open navigation" className={`flex h-10 w-10 items-center justify-center rounded-xl text-[#4e4742] hover:bg-[#f6f1ec] lg:hidden ${FOCUS}`}>
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#282321]">{current?.label ?? "Admin"}</p>
          <div className="flex items-center gap-2.5">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-4">{user.name}</p>
              <p className="text-xs text-[#7a6f6a]">{user.roleLabel}</p>
            </div>
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f2e9e4] text-xs font-bold text-[#7d1f2a]">{initialsOf(user.name)}</span>
            <AdminSignOutButton />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
