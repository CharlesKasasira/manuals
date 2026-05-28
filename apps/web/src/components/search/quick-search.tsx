"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FileArchive, Loader2, Search, Sparkles, X } from "lucide-react";
import { API_URL, getToken } from "@/lib/api";
import type { SearchAsset, SearchManual, SearchResponse } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const RECENT_QUICK_SEARCHES_KEY = "manualflow.quickSearches";

type QuickResult =
  | { id: string; type: "manual"; title: string; subtitle: string; href: string; snippet: string; updatedAt?: string; score: number }
  | { id: string; type: "asset"; title: string; subtitle: string; href: string; snippet: string; updatedAt?: string; score: number };

export function quickSearchHref(manual: Pick<SearchManual, "slug" | "matchedPages">, appMode: boolean) {
  const topPage = manual.matchedPages?.[0];
  const prefix = appMode ? "/app/manuals" : "/manuals";
  return `${prefix}/${manual.slug}${topPage ? `#page-${topPage.slug}` : ""}`;
}

export function quickAnswerFromResults(results: QuickResult[], query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2 || !results.length) return "";
  const best = results.find((result) => result.type === "manual" && result.snippet) ?? results[0];
  if (!best.snippet) return "";
  return `${best.snippet}${best.title ? ` Source: ${best.title}.` : ""}`;
}

function loadRecentSearches() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_QUICK_SEARCHES_KEY) || "[]").slice(0, 5) as string[];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return loadRecentSearches();
  const next = [trimmed, ...loadRecentSearches().filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 5);
  window.localStorage.setItem(RECENT_QUICK_SEARCHES_KEY, JSON.stringify(next));
  return next;
}

export function QuickSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const appMode = pathname?.startsWith("/app") ?? false;
  const answer = useMemo(() => quickAnswerFromResults(results, query), [query, results]);

  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  useEffect(() => {
    function openSearch() {
      setOpen(true);
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editable = target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key === "Escape") setOpen(false);
      if (event.key === "/" && !editable && !open) {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("manualflow:open-quick-search", openSearch);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("manualflow:open-quick-search", openSearch);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const token = getToken();
        const response = await fetch(`${API_URL}/search?q=${encodeURIComponent(trimmed)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
          cache: "no-store"
        });
        if (!response.ok) throw new Error("Search failed.");
        const payload = await response.json() as { data: SearchResponse };
        setResults(toQuickResults(payload.data, appMode));
        setActiveIndex(0);
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setError(searchError instanceof Error ? searchError.message : "Search failed.");
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [appMode, open, query]);

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setError("");
  }

  function openResult(result: QuickResult) {
    setRecentSearches(saveRecentSearch(query || result.title));
    close();
    router.push(result.href as Route);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      openResult(results[activeIndex]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Quick search">
      <button type="button" className="absolute inset-0 cursor-default" onClick={close} aria-label="Close search" />
      <div className="relative mx-auto mt-[8vh] w-full max-w-3xl overflow-hidden rounded-lg border border-line bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
            placeholder="Search manuals, pages, assets, and runbooks..."
          />
          {loading ? <Loader2 className="animate-spin text-slate-400" size={18} /> : null}
          <button type="button" onClick={close} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Close quick search">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[min(68vh,46rem)] overflow-y-auto p-3">
          {answer ? (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><Sparkles size={16} />Derived answer</div>
              <p className="mt-2 text-sm leading-6 text-emerald-950">{answer}</p>
            </div>
          ) : null}

          {query.trim().length < 2 ? (
            <div className="space-y-2 p-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Recent searches</p>
              {recentSearches.length ? recentSearches.map((item) => (
                <button key={item} type="button" onClick={() => setQuery(item)} className="block w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  {item}
                </button>
              )) : <p className="rounded-md border border-dashed border-line p-4 text-sm text-slate-500">Type at least two characters to search.</p>}
            </div>
          ) : error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>
          ) : results.length ? (
            <div className="space-y-1">
              {results.map((result, index) => (
                <button
                  key={result.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openResult(result)}
                  className={`flex w-full items-start gap-3 rounded-md p-3 text-left transition ${index === activeIndex ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  <span className={`mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${index === activeIndex ? "bg-white/10 text-emerald-200" : "bg-slate-100 text-slate-500"}`}>
                    {result.type === "asset" ? <FileArchive size={16} /> : <Search size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{result.title}</span>
                    <span className={`mt-1 block text-xs ${index === activeIndex ? "text-slate-300" : "text-slate-500"}`}>{result.subtitle}</span>
                    {result.snippet ? <span className={`mt-1 line-clamp-2 block text-sm leading-6 ${index === activeIndex ? "text-slate-200" : "text-slate-600"}`}>{result.snippet}</span> : null}
                  </span>
                  <ArrowRight size={16} className="mt-2 shrink-0 opacity-70" />
                </button>
              ))}
            </div>
          ) : loading ? (
            <p className="p-8 text-center text-sm text-slate-500">Searching...</p>
          ) : (
            <p className="rounded-md border border-dashed border-line p-4 text-sm text-slate-500">No results found.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <span><kbd className="rounded border border-line bg-white px-1.5 py-0.5">Cmd</kbd> <kbd className="rounded border border-line bg-white px-1.5 py-0.5">K</kbd> opens search</span>
          <span>Enter to open, Esc to close</span>
        </div>
      </div>
    </div>
  );
}

function toQuickResults(data: SearchResponse, appMode: boolean): QuickResult[] {
  const manuals = data.manuals.map((manual) => {
    const topPage = manual.matchedPages[0];
    return {
      id: `manual-${manual.id}`,
      type: "manual" as const,
      title: manual.title,
      subtitle: `${manual.space?.name || "Manual"}${manual.updatedAt ? ` / Updated ${formatDate(manual.updatedAt)}` : ""}`,
      href: quickSearchHref(manual, appMode),
      snippet: topPage?.snippet || manual.description || "",
      updatedAt: manual.updatedAt,
      score: manual.rank.score
    };
  });

  const assets = appMode ? data.assets.map((asset: SearchAsset) => ({
    id: `asset-${asset.id}`,
    type: "asset" as const,
    title: asset.fileName,
    subtitle: "Asset",
    href: "/app/assets",
    snippet: asset.snippet,
    updatedAt: asset.createdAt,
    score: asset.rank.score
  })) : [];

  return [...manuals, ...assets].sort((a, b) => b.score - a.score).slice(0, 12);
}
