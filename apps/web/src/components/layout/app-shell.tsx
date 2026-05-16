"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, ClipboardCheck, FileArchive, FileText, LayoutDashboard, Library, Settings, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/manuals", label: "Manuals", icon: Library },
  { href: "/app/drafts", label: "Drafts", icon: FileText },
  { href: "/app/reviews", label: "Reviews", icon: ClipboardCheck },
  { href: "/app/assets", label: "Assets", icon: FileArchive },
  { href: "/app/templates", label: "Templates", icon: BookOpen },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/app/admin", label: "Admin", icon: ShieldCheck }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/app") return pathname === "/app";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen bg-panel">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-line bg-white lg:block">
        <div className="flex h-16 items-center gap-2 border-b border-line px-5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white">
            <Settings size={18} />
          </span>
          <div>
            <p className="font-semibold text-slate-950">Manuals</p>
            <p className="text-xs text-slate-500">Governance Console</p>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
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
            );
          })}
        </nav>
      </aside>
      <main className="lg:pl-72">
        <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white px-5">
          <div>
            <p className="text-sm font-semibold text-slate-950">Manual governance platform</p>
            <p className="text-xs text-slate-500">Draft, review, publish, search, and audit manuals.</p>
          </div>
          <div className="flex items-center gap-2">
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
