import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-950">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white">
            <BookOpen size={18} />
          </span>
          Manuals
        </Link>
        <form action="/manuals" className="hidden flex-1 md:block">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              name="q"
              placeholder="Search manuals, policies, runbooks..."
              className="h-10 w-full rounded-md border border-line bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
            />
          </label>
        </form>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Login
          </Link>
        </div>
      </div>
    </header>
  );
}
