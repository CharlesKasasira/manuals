"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BookOpen, ChevronUp, ClipboardCheck, FileArchive, FileText, LayoutDashboard, Library, LogOut, Settings, ShieldCheck, UserCircle } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";
import { api, clearToken } from "@/lib/api";
import type { Role } from "@/lib/types";

type NavItem = {
  href: Route;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
  children?: Array<{ href: Route; label: string }>;
};

const nav: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/manuals", label: "Manuals", icon: Library },
  { href: "/app/drafts", label: "Drafts", icon: FileText },
  { href: "/app/reviews", label: "Reviews", icon: ClipboardCheck },
  { href: "/app/assets", label: "Assets", icon: FileArchive },
  { href: "/app/templates", label: "Templates", icon: BookOpen },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
  {
    href: "/app/admin",
    label: "Admin",
    icon: ShieldCheck,
    roles: ["admin"],
    children: [
      { href: "/app/admin/users", label: "Users" },
      { href: "/app/admin/teams", label: "Groups" },
      { href: "/app/admin/permissions", label: "Permissions" },
      { href: "/app/admin/api-keys", label: "API keys" },
      { href: "/app/admin/mail", label: "Email" },
      { href: "/app/admin/audit", label: "Audit" },
      { href: "/app/admin/comments", label: "Comments" },
      { href: "/app/admin/auth", label: "Authentication" },
      { href: "/app/admin/analytics", label: "Analytics" },
      { href: "/app/admin/system", label: "System Info" }
    ]
  }
];

type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export function visibleNavItemsForRole(role?: Role | null) {
  return nav.filter((item) => !item.roles?.length || (role ? item.roles.includes(role) : false));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const visibleNav = visibleNavItemsForRole(user?.role);

  useEffect(() => {
    let active = true;

    api<{ data: CurrentUser }>("/auth/me")
      .then((response) => {
        if (active) setUser(response.data);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setUserLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  function isActive(href: string) {
    if (href === "/app") return pathname === "/app";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function initials() {
    const value = user?.name || user?.email || "User";
    return value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      clearToken();
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-panel">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-line bg-white lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-line px-5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white">
            <Settings size={18} />
          </span>
          <div>
            <p className="font-semibold text-slate-950">Manuals</p>
            <p className="text-xs text-slate-500">Governance Console</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleNav.map((item) => {
            const active = isActive(item.href);
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active && pathname === item.href ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
                    active
                      ? "bg-slate-950 text-white shadow-sm"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full transition",
                      active ? "bg-emerald-400" : "bg-transparent group-hover:bg-slate-300"
                    )}
                  />
                  <item.icon size={17} className={cn("shrink-0 transition", active ? "text-emerald-200" : "text-slate-500 group-hover:text-slate-900")} />
                  <span>{item.label}</span>
                </Link>
                {item.children?.length && active ? (
                  <div className="mt-1 space-y-1 pl-9">
                    {item.children.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          aria-current={childActive ? "page" : undefined}
                          className={cn(
                            "block rounded-md px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
                            childActive ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="relative border-t border-line p-3">
          {accountOpen ? (
            <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-md border border-line bg-white shadow-soft">
              <div className="border-b border-line px-3 py-3">
                <p className="truncate text-sm font-semibold text-slate-950">{user?.name ?? (userLoaded ? "Signed in user" : "Loading user...")}</p>
                <p className="truncate text-xs text-slate-500">{user?.email ?? (userLoaded ? "Account details unavailable" : "Loading account...")}</p>
              </div>
              <Link href="/" className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => setAccountOpen(false)}>
                <BookOpen size={16} />
                Public reader
              </Link>
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setAccountOpen((open) => !open)}
            className="flex w-full items-center gap-3 rounded-md border border-line bg-slate-50 p-3 text-left transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            aria-expanded={accountOpen}
            aria-label="User account menu"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white">
              {user ? initials() : <UserCircle size={20} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-950">{user?.name ?? (userLoaded ? "Signed in user" : "Loading user...")}</span>
              <span className="block truncate text-xs capitalize text-slate-500">{user?.role ?? "account"}</span>
            </span>
            <ChevronUp size={16} className={cn("shrink-0 text-slate-500 transition", accountOpen && "rotate-180")} />
          </button>
        </div>
      </aside>
      <main className="lg:pl-72">
        <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white px-5">
          <div>
            <p className="text-sm font-semibold text-slate-950">Manual governance platform</p>
            <p className="text-xs text-slate-500">Draft, review, publish, search, and audit manuals.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => window.dispatchEvent(new Event("manualflow:open-quick-search"))} className="hidden h-10 items-center gap-2 rounded-md border border-line bg-slate-50 px-3 text-sm font-semibold text-slate-500 hover:bg-white md:inline-flex">
              Search <kbd className="rounded border border-line bg-white px-1.5 py-0.5 text-[10px]">Cmd K</kbd>
            </button>
            <ThemeToggle />
            <Link href="/" className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Public reader
            </Link>
          </div>
        </div>
        <div className="p-5">{children}</div>
      </main>
    </div>
  );
}
