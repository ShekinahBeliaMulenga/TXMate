"use client";

import Image from "next/image";
import {useCallback,useEffect,useRef,useState,type ReactNode,} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { usePendingRequestCount } from "./use-pending-requests";
import { useUnreadMessageCount } from "./use-unread-messages";
import { useAcceptedRequestCount } from "./use-accepted-requests";
import { usePendingRescheduleCount } from "./use-pending-reschedule-count";
import NotificationBell from "./notification-bell";
import SessionPromptHost from "./session-prompt";
import NavSearch, { type NavSearchItem } from "./nav-search";
import { Icon, type IconName } from "@/components/ui/icon";

type NavigationItem = {
  label: string;
  href: string;
  icon: IconName;
  /** Extra words the navigation search matches, besides the label. */
  keywords?: string;
  /** Shows the pending-requests count next to this item. */
  showPendingBadge?: boolean;
  /** Shows the unread-messages count next to this item. */
  showUnreadBadge?: boolean;
  /** Shows a green count of newly accepted requests (not yet opened) next to this item. */
  showAcceptedBadge?: boolean;
  /** Shows pending rescheduling proposals assigned to this Academic Mate. */
  showRescheduleBadge?: boolean;
};

const NAVIGATION_GROUPS: {
  title: string;
  items: NavigationItem[];
}[] = [
  {
    title: "Student Actions",
    items: [
      {
        label: "Dashboard",
        href: "/student/dashboard",
        icon: "dashboard",
        keywords: "home overview summary today",
      },
      {
        label: "Find a Mate",
        href: "/student/find-academic-mate",
        icon: "search",
        keywords: "tutor tutors academic mate find search book course help",
      },
      {
        label: "My Requests",
        href: "/student/requests",
        icon: "inbox",
        keywords: "requests pending accepted sent booking status",
        showAcceptedBadge: true,
      },

      {
        label: "Sessions",
        href: "/student/sessions",
        icon: "calendar",
        keywords: "attendance completion schedule upcoming past confirm tutoring",
      },

      {
        label: "Messages",
        href: "/student/messages",
        icon: "messages",
        keywords: "chat inbox conversations talk",
        showUnreadBadge: true,
      },

      {
        label: "Your courses",
        href: "/student/repeating-courses",
        icon: "book",
        keywords: "repeating courses subjects units modules",
      },
    ],
  },
  {
    title: "Academic Mate Profile",
    items: [
      {
        label: "Profile overview",
        href: "/student/academic-mate",
        icon: "academic",
        keywords: "academic mate dashboard earnings",
      },
      {
        label: "Preview profile",
        href: "/student/academic-mate/profile",
        icon: "eye",
        keywords: "public profile ratings reviews see how others see",
      },
      {
        label: "Mate profile",
        href: "/student/academic-mate/edit",
        icon: "edit",
        keywords: "edit bio headline about me",
      },
      {
        label: "Verification",
        href: "/student/academic-mate/verification",
        icon: "shield",
        keywords: "verify documents id transcript approval",
      },
      {
        label: "Offerings",
        href: "/student/academic-mate/offerings",
        icon: "layers",
        keywords: "courses price teach rates sessions offer",
      },
      {
        label: "Mate requests",
        href: "/student/academic-mate/requests",
        icon: "list",
        keywords: "incoming requests students accept decline",
        showPendingBadge: true,
      },
      {
        label: "Availability",
        href: "/student/academic-mate/availability",
        icon: "clock",
        keywords: "hours times slots free calendar",
      },
      {
        label: "Reschedules",
        href: "/student/academic-mate/sessions",
        icon: "refresh",
        keywords: "change time move session proposals",
        showRescheduleBadge: true,
      },
      
    ],
  },
  {
    title: "Account",
    items: [
      {
        label: "Student profile",
        href: "/student/profile",
        icon: "user",
        keywords: "photo name phone bio details",
      },
      {
        label: "Settings",
        href: "/student/settings",
        icon: "settings",
        keywords: "password security notifications push alerts privacy visibility photo account sign in",
      },
    ],
  },
];

/** The four main tabs pinned to the bottom bar on mobile (they are left out of the mobile drawer). */
const BOTTOM_TABS: {
  label: string;
  href: string;
  icon: IconName;
  badge?: "unread" | "accepted";
}[] = [
  { label: "Dashboard", href: "/student/dashboard", icon: "dashboard" },
  { label: "Find a Mate", href: "/student/find-academic-mate", icon: "search" },
  { label: "Sessions", href: "/student/sessions", icon: "calendar" },
  {
    label: "My Requests",
    href: "/student/requests",
    icon: "inbox",
    badge: "accepted",
  },
];

const BOTTOM_TAB_HREFS = BOTTOM_TABS.map((tab) => tab.href);

const NAV_SEARCH_ITEMS: NavSearchItem[] = NAVIGATION_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ label: item.label, href: item.href, keywords: item.keywords })),
);

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/student/academic-mate") return false;
  return pathname.startsWith(`${href}/`);
}

function CountBadge({
  count,
  active,
  singular,
  plural,
  tone = "brand",
}: {
  count: number;
  active: boolean;
  singular: string;
  plural: string;
  tone?: "brand" | "green";
}) {
  const label = count > 99 ? "99+" : String(count);
  const colors =
    tone === "green"
      ? "bg-emerald-600 text-white"
      : active
        ? "bg-[#7d1f2a] text-white"
        : "bg-[#f4eceb] text-[#7d1f2a]";

  return (
    <span
      className={`ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none tabular-nums ${colors}`}
    >
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">
        {count} {count === 1 ? singular : plural}
      </span>
    </span>
  );
}

function NavigationGroups({
  pathname,
  onNavigate,
  pendingCount = 0,
  unreadCount = 0,
  acceptedCount = 0,
  rescheduleCount = 0,
  excludeHrefs = [],
}: {
  pathname: string;
  onNavigate?: () => void;
  pendingCount?: number;
  unreadCount?: number;
  acceptedCount?: number;
  rescheduleCount?: number;

  /* Items already shown elsewhere (the mobile bottom bar) and so hidden here. */
  excludeHrefs?: string[];
}) {
  return (
    <nav aria-label="TXMate navigation" className="space-y-6">
      {NAVIGATION_GROUPS.map((group) => {
        const items = group.items.filter(
          (item) => !excludeHrefs.includes(item.href)
        );
        if (items.length === 0) return null;

        return (
          <section key={group.title}>
            <h2 className="px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#94877e]">
              {group.title}
            </h2>

            <ul className="mt-2 space-y-1">
              {items.map((item) => {
                const active = isActivePath(pathname, item.href);
                const badge = item.showRescheduleBadge
                  ? {
                      count: rescheduleCount,
                      singular: "pending rescheduling proposal",
                      plural: "pending rescheduling proposals",
                      tone: "brand" as const,
                    }
                  : item.showPendingBadge
                  ? {
                      count: pendingCount,
                      singular: "pending request",
                      plural: "pending requests",
                      tone: "brand" as const,
                    }
                  : item.showUnreadBadge
                    ? {
                        count: unreadCount,
                        singular: "unread message",
                        plural: "unread messages",
                        tone: "brand" as const,
                      }
                    : item.showAcceptedBadge
                      ? {
                          count: acceptedCount,
                          singular: "newly accepted request",
                          plural: "newly accepted requests",
                          tone: "green" as const,
                        }
                      : null;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 ${
                        active
                          ? "bg-[#f4eceb] font-semibold text-[#7d1f2a]"
                          : "text-[#625954] hover:bg-[#f8f5f2] hover:text-[#282321]"
                      }`}
                    >
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-2 left-0 top-2 w-0.75 rounded-r bg-[#7d1f2a]"
                        />
                      )}

                      <Icon
                        name={item.icon}
                        className="h-4.25 w-4.25 shrink-0"
                      />

                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>

                      {badge && badge.count > 0 && (
                        <CountBadge
                          count={badge.count}
                          active={active}
                          singular={badge.singular}
                          plural={badge.plural}
                          tone={badge.tone}
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/student/dashboard"
      onClick={onClick}
      aria-label="TXMate dashboard"
      className="text-xl font-semibold tracking-tight text-[#282321] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"
    >
      TX<span className="text-[#7d1f2a]">Mate</span>
    </Link>
  );
}

type ProfileUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

/** Profile card shown first in the mobile drawer. Links to the student profile page. */
function ProfileCard({
  user,
  onNavigate,
}: {
  user?: ProfileUser;
  onNavigate?: () => void;
}) {
  const name = user?.name?.trim() || "Student";
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "S";

  return (
    <Link
      href="/student/profile"
      onClick={onNavigate}
      className="flex items-center gap-3 border-b border-[#eee8e2] px-5 py-4 transition-colors hover:bg-[#f8f5f2] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7d1f2a]/40"
    >
      {user?.image ? (
            <Image
          src={user.image}
          alt="" width={64} height={64} unoptimized
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#7d1f2a] text-base font-semibold text-white"
        >
          {initials}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#282321]">
          {name}
        </span>
        {user?.email && (
          <span className="block truncate text-xs text-[#94877e]">
            {user.email}
          </span>
        )}
        <span className="mt-0.5 block text-xs font-medium text-[#7d1f2a]">
          View profile
        </span>
      </span>
    </Link>
  );
}

function SidebarContents({
  pathname,
  onNavigate,
  onSignOut,
  signingOut,
  signOutError,
  mobile = false,
  onClose,
  pendingCount = 0,
  unreadCount = 0,
  acceptedCount = 0,
  rescheduleCount = 0,
  user,
}: {
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  signOutError: string | null;
  mobile?: boolean;
  onClose?: () => void;
  pendingCount?: number;
  unreadCount?: number;
  acceptedCount?: number;
  rescheduleCount?: number;
  user?: ProfileUser;
}) {
  return (
    <>
      <div className="flex h-18 shrink-0 items-center justify-between border-b border-[#eee8e2] px-5">
        <Brand onClick={onNavigate} />

        {!mobile && <NotificationBell align="left" />}

        {mobile && (
          <button
            type="button"
            data-drawer-close
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-md p-2 text-[#625954] transition hover:bg-[#f5f0eb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      {/* Profile details come first in the mobile drawer */}
      {mobile && <ProfileCard user={user} onNavigate={onNavigate} />}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <NavigationGroups
          pathname={pathname}
          onNavigate={onNavigate}
          pendingCount={pendingCount}
          unreadCount={unreadCount}
          acceptedCount={acceptedCount}
          rescheduleCount={rescheduleCount}
          excludeHrefs={mobile ? BOTTOM_TAB_HREFS : []}
        />
      </div>

      <div className="shrink-0 border-t border-[#eee8e2] p-4">
        {signOutError && (
          <p role="alert" className="mb-3 text-xs leading-5 text-red-700">
            {signOutError}
          </p>
        )}

        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-[#625954] transition-colors hover:bg-[#f8f5f2] hover:text-[#7d1f2a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:cursor-wait disabled:opacity-60"
        >
          <Icon name="logout" className="h-4.25 w-4.25 shrink-0" />
          <span>{signingOut ? "Signing out..." : "Sign out"}</span>
        </button>

        {!mobile && (
          <p className="mt-3 px-3 text-[10px] text-[#a0958d]">
            TXMate · Shekinah B Mulenga
          </p>
        )}
      </div>
    </>
  );
}

/** Small count bubble sitting on a bottom-bar icon. */
function TabBadge({
  count,
  tone,
}: {
  count: number;
  tone: "brand" | "green";
}) {
  if (count <= 0) return null;

  return (
    <span
      aria-hidden="true"
      className={`absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums text-white ring-2 ring-white ${
        tone === "green" ? "bg-emerald-600" : "bg-[#7d1f2a]"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function StudentAppShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const pendingCount = usePendingRequestCount();
  const unreadCount = useUnreadMessageCount();
  const acceptedCount = useAcceptedRequestCount();
  const rescheduleCount = usePendingRescheduleCount();

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);

  const closeMobileDrawer = useCallback(() => {
    setMobileOpen(false);
  }, []);

  useEffect(() => {
    setMobileOpen(false); // eslint-disable-line react-hooks/set-state-in-effect
    setMobileSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const drawer = mobileDrawerRef.current;
    const menuButton = menuButtonRef.current;

    drawer
      ?.querySelector<HTMLButtonElement>("[data-drawer-close]")
      ?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        menuButton?.focus();
        return;
      }

      if (event.key !== "Tab" || !drawer) return;

      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      menuButton?.focus();
    };
  }, [mobileOpen]);

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);
    setSignOutError(null);

    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.replace("/login");
            router.refresh();
          },
          onError: (context) => {
            setSignOutError(
              context.error.message || "Unable to sign out. Please try again."
            );
            setSigningOut(false);
          },
        },
      });
    } catch {
      setSignOutError("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }

  const tabBadges = {
    unread: { count: unreadCount, tone: "brand" as const },
    accepted: { count: acceptedCount, tone: "green" as const },
  };

  const menuAttention = [
    pendingCount > 0
      ? `${pendingCount} pending ${pendingCount === 1 ? "request" : "requests"}`
      : "",
    rescheduleCount > 0
      ? `${rescheduleCount} pending rescheduling ${rescheduleCount === 1 ? "proposal" : "proposals"}`
      : "",
  ].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-[#f9f8f6] text-[#282321] antialiased">
      <a
        href="#main-content"
        className="sr-only z-60 rounded-md bg-white px-4 py-2 font-medium text-[#7d1f2a] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/40"
      >
        Skip to content
      </a>

      {/* Persistent desktop sidebar (with entrance fade-in & slide-in) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-[#e2d9d0] bg-white lg:flex animate-in fade-in slide-in-from-left duration-300">
        <SidebarContents
          pathname={pathname}
          onSignOut={handleSignOut}
          signingOut={signingOut}
          signOutError={signOutError}
          pendingCount={pendingCount}
          unreadCount={unreadCount}
          acceptedCount={acceptedCount}
          rescheduleCount={rescheduleCount}
        />
      </aside>

      {/* Mobile top bar: brand only, navigation lives in the bottom bar */}
      <header className="sticky top-0 z-30 border-b border-[#e2d9d0] bg-white lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <Brand />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileSearchOpen((value) => !value)}
              aria-label="Search TXMate"
              aria-expanded={mobileSearchOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#625954] transition hover:bg-[#f5f0eb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"
            >
              <Icon name="search" className="h-5 w-5" />
            </button>
            <Link
              href="/student/messages"
              aria-label={unreadCount > 0 ? `Messages, ${unreadCount} unread` : "Messages"}
              aria-current={isActivePath(pathname, "/student/messages") ? "page" : undefined}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg transition hover:bg-[#f5f0eb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 ${isActivePath(pathname, "/student/messages") ? "text-[#7d1f2a]" : "text-[#625954]"}`}
            >
              <span className="relative">
                <Icon name="messages" className="h-5 w-5" />
                <TabBadge count={unreadCount} tone="brand" />
              </span>
            </Link>
            <NotificationBell />
          </div>
        </div>
        {mobileSearchOpen && (
          <div className="border-t border-[#eee8e2] px-4 py-2.5">
            <NavSearch items={NAV_SEARCH_ITEMS} onNavigate={() => setMobileSearchOpen(false)} autoFocus />
          </div>
        )}
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e2d9d0] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {BOTTOM_TABS.map((tab) => {
            const active = isActivePath(pathname, tab.href);
            const badge = tab.badge ? tabBadges[tab.badge] : null;

            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={
                    badge && badge.count > 0
                      ? `${tab.label}, ${badge.count} ${
                          tab.badge === "unread" ? "unread" : "newly accepted"
                        }`
                      : tab.label
                  }
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7d1f2a]/40 ${
                    active ? "text-[#7d1f2a]" : "text-[#7a6f68]"
                  }`}
                >
                  <span className="relative">
                    <Icon
                      name={tab.icon}
                      className={`h-5.5 w-5.5 ${
                        active ? "stroke-[2.1]" : ""
                      }`}
                    />
                    {badge && <TabBadge count={badge.count} tone={badge.tone} />}
                  </span>
                  <span>{tab.label}</span>
                </Link>
              </li>
            );
          })}

          {/* Hamburger in the bottom corner opens the side drawer */}
          <li>
            <button
              ref={menuButtonRef}
              type="button"
              aria-label={menuAttention ? `Open menu, ${menuAttention}` : "Open menu"}
              aria-controls="student-mobile-navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
              className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium text-[#7a6f68] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7d1f2a]/40"
            >
              <span className="relative">
                <Icon name="menu" className="h-5.5 w-5.5" />
                {/* Mate requests live inside the drawer, so flag them here */}
                {(pendingCount > 0 || rescheduleCount > 0) && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#7d1f2a] ring-2 ring-white"
                  />
                )}
              </span>
              <span>Menu</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* Mobile side drawer: slides in from the right, the side of the menu button */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-300 ${
          mobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          type="button"
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={closeMobileDrawer}
          className="absolute inset-0 cursor-default bg-black/40"
        />

        <aside
          id="student-mobile-navigation"
          ref={mobileDrawerRef}
          aria-label="Mobile navigation"
          className={`absolute inset-y-0 right-0 flex w-[min(86vw,300px)] flex-col border-l border-[#e2d9d0] bg-white shadow-xl transition-transform duration-300 ease-in-out ${
            mobileOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <SidebarContents
            pathname={pathname}
            onNavigate={closeMobileDrawer}
            onSignOut={handleSignOut}
            signingOut={signingOut}
            signOutError={signOutError}
            mobile
            onClose={closeMobileDrawer}
            pendingCount={pendingCount}
            unreadCount={unreadCount}
            acceptedCount={acceptedCount}
            rescheduleCount={rescheduleCount}
            user={session?.user}
          />
        </aside>
      </div>

      {/* Every student page is rendered inside this shared content area.
          Bottom padding keeps content clear of the mobile tab bar. */}
      <div
        id="main-content"
        className="min-w-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-72"
      >
        {children}
      </div>
      <SessionPromptHost />
    </div>
  );
}