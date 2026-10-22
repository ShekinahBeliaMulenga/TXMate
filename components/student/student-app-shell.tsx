"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { usePendingRequestCount } from "./use-pending-requests";
import { useUnreadMessageCount } from "./use-unread-messages";
import { useAcceptedRequestCount } from "./use-accepted-requests";
import { usePendingRescheduleCount } from "./use-pending-reschedule-count";

type IconName =
  | "dashboard"
  | "search"
  | "user"
  | "settings"
  | "academic"
  | "inbox"
  | "messages"
  | "book"
  | "calendar"
  | "shield"
  | "edit"
  | "eye"
  | "logout"
  | "close"
  | "menu"
  | "list"
  | "id-card"
  | "user-check"
  | "layers"
  | "clock";

type NavigationItem = {
  label: string;
  href: string;
  icon: IconName;
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
      },
      {
        label: "Find a Mate",
        href: "/student/find-academic-mate",
        icon: "search",
      },
      {
        label: "My Requests",
        href: "/student/requests",
        icon: "inbox",
        showAcceptedBadge: true,
      },

      {
        label: "Sessions",
        href: "/student/sessions",
        icon: "calendar",
      },

      {
        label: "Messages",
        href: "/student/messages",
        icon: "messages",
        showUnreadBadge: true,
      },

      {
        label: "Your courses",
        href: "/student/repeating-courses",
        icon: "book",
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
      },
      {
        label: "Preview profile",
        href: "/student/academic-mate/profile",
        icon: "eye",
      },
      {
        label: "Mate profile",
        href: "/student/academic-mate/edit",
        icon: "edit",
      },
      {
        label: "Verification",
        href: "/student/academic-mate/verification",
        icon: "shield",
      },
      {
        label: "Offerings",
        href: "/student/academic-mate/offerings",
        icon: "layers",
      },
      {
        label: "Mate requests",
        href: "/student/academic-mate/requests",
        icon: "list",
        showPendingBadge: true,
      },
      {
        label: "Reschedules",
        href: "/student/academic-mate/sessions",
        icon: "calendar",
        showRescheduleBadge: true,
      },
      {
        label: "Availability",
        href: "/student/academic-mate/availability",
        icon: "clock",
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
      },
      {
        label: "Settings",
        href: "/student/settings",
        icon: "settings",
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
  { label: "Find", href: "/student/find-academic-mate", icon: "search" },
  {
    label: "Messages",
    href: "/student/messages",
    icon: "messages",
    badge: "unread",
  },
  {
    label: "My Requests",
    href: "/student/requests",
    icon: "inbox",
    badge: "accepted",
  },
];

const BOTTOM_TAB_HREFS = BOTTOM_TABS.map((tab) => tab.href);

function Icon({
  name,
  className = "h-[18px] w-[18px]",
}: {
  name: IconName;
  className?: string;
}) {
  const props = {
    "aria-hidden": true as const,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };

  switch (name) {
    case "dashboard":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="8" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="15" width="7" height="6" rx="1" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="10.8" cy="10.8" r="6.8" />
          <path d="m16 16 4.2 4.2" />
        </svg>
      );
    case "user":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6.8Z" />
        </svg>
      );
    case "academic":
      return (
        <svg {...props}>
          <path d="m2.5 9 9.5-5 9.5 5-9.5 5-9.5-5Z" />
          <path d="M6.5 11.2v5.2c3.6 2.7 7.4 2.7 11 0v-5.2M21.5 9v7" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 13h5l2 3h4l2-3h5" />
        </svg>
      );
    case "book":
      return (
        <svg {...props}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22Z" />
          <path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H20" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "edit":
      return (
        <svg {...props}>
          <path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" />
        </svg>
      );
    case "eye":
      return (
        <svg {...props}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "logout":
      return (
        <svg {...props}>
          <path d="M10 17l5-5-5-5M15 12H3" />
          <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
        </svg>
      );
    case "close":
      return (
        <svg {...props}>
          <path d="m18 6-12 12M6 6l12 12" />
        </svg>
      );
    case "menu":
      return (
        <svg {...props}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
    case "list":
      return (
        <svg {...props}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case "id-card":
      return (
        <svg {...props}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <circle cx="8" cy="12" r="2" />
          <path d="M12 11h4M12 14h2" />
        </svg>
      );
    case "user-check":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <polyline points="16 11 18 13 22 9" />
        </svg>
      );
    case "layers":
      return (
        <svg {...props}>
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );
    case "clock":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "messages":
      return (
        <svg {...props}>
          <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
        </svg>
      );
  }
}

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
                          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r bg-[#7d1f2a]"
                        />
                      )}

                      <Icon
                        name={item.icon}
                        className="h-[17px] w-[17px] shrink-0"
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
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#eee8e2] px-5">
        <Brand onClick={onNavigate} />

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
          <Icon name="logout" className="h-[17px] w-[17px] shrink-0" />
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
        className="sr-only z-[60] rounded-md bg-white px-4 py-2 font-medium text-[#7d1f2a] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/40"
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
        <div className="flex h-14 items-center px-4">
          <Brand />
        </div>
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
                      className={`h-[22px] w-[22px] ${
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
                <Icon name="menu" className="h-[22px] w-[22px]" />
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
    </div>
  );
}