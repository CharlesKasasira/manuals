"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpenCheck, Clock3, Search, SlidersHorizontal, X } from "lucide-react";
import { api } from "@/lib/api";
import { Manual, SearchManual, SearchResponse } from "@/lib/types";
import { formatDate, humanizeStatus } from "@/lib/utils";
import { ManualCard } from "./manual-card";

const RECENT_SEARCHES_KEY = "manualflow.recentSearches";

function highlight(value: string, query: string) {
  const q = query.trim();
  if (!q) return value;
  const index = value.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return value;
  return (
    <>
      {value.slice(0, index)}
      <mark className="rounded bg-amber-100 px-0.5 text-slate-950">{value.slice(index, index + q.length)}</mark>
      {value.slice(index + q.length)}
    </>
  );
}

function loadRecentSearches() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === "undefined") return [];
  const trimmed = query.trim();
  if (trimmed.length < 2) return loadRecentSearches();
  const next = [trimmed, ...loadRecentSearches().filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6);
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  return next;
}

type ManualHrefPrefix = "/manuals" | "/app/manuals";

export function ManualBrowser({ manuals, hrefPrefix = "/manuals", initialStatus = "all", initialQuery = "" }: { manuals: Manual[]; hrefPrefix?: ManualHrefPrefix; initialStatus?: string; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [visibility, setVisibility] = useState("all");
  const [status, setStatus] = useState(initialStatus);
  const [space, setSpace] = useState("all");
  const [tag, setTag] = useState("all");
  const [review, setReview] = useState("all");
  const [sort, setSort] = useState("updated");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  const searchParams = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (space !== "all") params.set("space", space);
    if (visibility !== "all") params.set("visibility", visibility);
    if (tag !== "all") params.set("tag", tag);
    params.set("type", "manual");
    return params;
  }, [query, space, tag, visibility]);
  const usingSearchEndpoint = Boolean(query.trim() || space !== "all" || visibility !== "all" || tag !== "all");
  const search = useQuery({
    queryKey: ["search", searchParams.toString()],
    queryFn: async () => (await api<{ data: SearchResponse }>(`/search?${searchParams.toString()}`)).data,
    enabled: usingSearchEndpoint,
    retry: false
  });
  const searchManuals = useMemo(() => search.data?.manuals ?? [], [search.data?.manuals]);

  useEffect(() => {
    if (search.data?.query) setRecentSearches(saveRecentSearch(search.data.query));
  }, [search.data?.query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = usingSearchEndpoint ? searchManuals : manuals;
    return source.filter((manual) => {
      const matchesQuery = !q || [manual.title, manual.description, manual.space?.name, ...(manual.tags ?? []).map((tag) => tag.name)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      const matchesVisibility = visibility === "all" || manual.visibility === visibility;
      const matchesStatus = status === "all" || manual.status === status;
      const matchesSpace = space === "all" || manual.space?.slug === space;
      const matchesTag = tag === "all" || manual.tags?.some((item) => item.slug === tag);
      const matchesReview = review === "all" || manual.knowledgeSignals?.reviewDueStatus === review;
      return matchesQuery && matchesVisibility && matchesStatus && matchesSpace && matchesTag && matchesReview;
    }).sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title);
        case "views":
          return (b.viewCount ?? 0) - (a.viewCount ?? 0);
        case "quality":
          return (b.knowledgeSignals?.qualityScore ?? 0) - (a.knowledgeSignals?.qualityScore ?? 0);
        default:
          return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      }
    });
  }, [manuals, query, review, searchManuals, sort, space, status, tag, usingSearchEndpoint, visibility]);

  const spaces = useMemo(() => Array.from(new Map(manuals.filter((manual) => manual.space).map((manual) => [manual.space!.slug, manual.space!])).values()), [manuals]);
  const tags = useMemo(() => Array.from(new Map(manuals.flatMap((manual) => manual.tags ?? []).map((item) => [item.slug, item])).values()), [manuals]);
  const searchFacets = search.data?.facets;
  const signals = manuals.map((manual) => manual.knowledgeSignals).filter(Boolean);
  const averageQuality = signals.length ? Math.round(signals.reduce((total, item) => total + item!.qualityScore, 0) / signals.length) : 0;
  const overdueReviews = signals.filter((item) => item?.reviewDueStatus === "overdue").length;
  const hasSearchError = usingSearchEndpoint && search.isError;
  const resultCount = usingSearchEndpoint && !hasSearchError ? searchManuals.length : filtered.length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">{usingSearchEndpoint ? "Search trusted operating guidance." : "Find trusted operating guidance."}</h1>
            <p className="mt-1 text-sm text-slate-600">Ranked results, matched pages, facets, and readable snippets.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-line bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{manuals.length} manuals</span>
            <span className="rounded-full border border-line bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{resultCount} results</span>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px] xl:grid-cols-[minmax(0,1fr)_150px_150px_150px_150px_150px_150px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full rounded-md border border-line bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-slate-400 focus:bg-white" placeholder="Search procedures, policy, systems..." />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-md border border-line bg-white px-3 text-sm">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="in_review">In review</option>
            <option value="approved">Approved</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="h-11 rounded-md border border-line bg-white px-3 text-sm">
            <option value="all">All visibility</option>
            <option value="public">Public</option>
            <option value="internal">Internal</option>
            <option value="private">Private</option>
            <option value="restricted">Restricted</option>
          </select>
          <select value={space} onChange={(event) => setSpace(event.target.value)} className="h-11 rounded-md border border-line bg-white px-3 text-sm">
            <option value="all">All spaces</option>
            {spaces.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
          </select>
          <select value={tag} onChange={(event) => setTag(event.target.value)} className="h-11 rounded-md border border-line bg-white px-3 text-sm">
            <option value="all">All tags</option>
            {tags.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
          </select>
          <select value={review} onChange={(event) => setReview(event.target.value)} className="h-11 rounded-md border border-line bg-white px-3 text-sm">
            <option value="all">All review states</option>
            <option value="current">Current</option>
            <option value="due_soon">Due soon</option>
            <option value="overdue">Overdue</option>
            <option value="not_scheduled">Not scheduled</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 rounded-md border border-line bg-white px-3 text-sm">
            <option value="updated">Recently updated</option>
            <option value="title">Title</option>
            <option value="views">Most viewed</option>
            <option value="quality">Quality score</option>
          </select>
        </div>
        {recentSearches.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Recent:</span>
            {recentSearches.map((item) => (
              <button key={item} type="button" onClick={() => setQuery(item)} className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                {item}
              </button>
            ))}
            <button type="button" onClick={() => { window.localStorage.removeItem(RECENT_SEARCHES_KEY); setRecentSearches([]); }} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
              <X size={13} /> Clear
            </button>
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="grid gap-4">
          {hasSearchError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">Search is unavailable. Start the API or try browsing the library.</div>
          ) : search.isLoading ? (
            <div className="rounded-lg border border-line bg-white p-10 text-center text-sm text-slate-500">Searching manuals...</div>
          ) : filtered.length ? filtered.map((manual) => (
            usingSearchEndpoint ? <SearchResultCard key={manual.id} manual={manual as SearchManual} hrefPrefix={hrefPrefix} query={query} /> : <ManualCard key={manual.id} manual={manual} hrefPrefix={hrefPrefix} />
          )) : (
            <div className="rounded-lg border border-dashed border-line bg-white p-10 text-center text-sm text-slate-500">No matching manuals found.</div>
          )}
        </div>
        <aside className="space-y-4">
          {usingSearchEndpoint && searchFacets ? (
            <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><SlidersHorizontal size={16} />Search facets</div>
              <FacetButtons title="Spaces" items={searchFacets.spaces} active={space} onPick={setSpace} />
              <FacetButtons title="Tags" items={searchFacets.tags} active={tag} onPick={setTag} />
              <FacetButtons title="Visibility" items={searchFacets.visibility} active={visibility} onPick={setVisibility} />
            </div>
          ) : null}
          <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><BookOpenCheck size={16} />Knowledge health</div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Average quality</dt>
                <dd className="font-semibold text-slate-900">{averageQuality}%</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Review overdue</dt>
                <dd className="font-semibold text-slate-900">{overdueReviews}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Review filter</dt>
                <dd className="font-semibold capitalize text-slate-900">{humanizeStatus(review)}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><SlidersHorizontal size={16} />Popular tags</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {tags.slice(0, 12).map((item) => (
                <button key={item.slug} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" onClick={() => setTag(item.slug)}>#{item.name}</button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-950">Recently updated</p>
            <div className="mt-3 space-y-3">
              {manuals.slice(0, 5).map((manual) => (
                <a key={manual.id} href={`${hrefPrefix}/${manual.slug}`} className="block rounded-md border border-line p-3 hover:border-emerald-300">
                  <p className="text-sm font-semibold text-slate-800">{manual.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{manual.space?.name || "General"} / v{manual.version}</p>
                </a>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SearchResultCard({ manual, hrefPrefix, query }: { manual: SearchManual; hrefPrefix: ManualHrefPrefix; query: string }) {
  const topPage = manual.matchedPages[0];
  const href = `${hrefPrefix}/${manual.slug}${topPage ? `#page-${topPage.slug}` : ""}`;
  const reasons = manual.rank.reasons.join(", ");

  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link href={href as Route} className="group inline-flex items-center gap-2 text-lg font-semibold text-slate-950 hover:text-emerald-700">
            {highlight(manual.title, query)}
            <ArrowUpRight className="opacity-0 transition group-hover:opacity-100" size={16} />
          </Link>
          <p className="mt-2 text-sm leading-6 text-slate-600">{highlight(manual.description || topPage?.snippet || "No description available.", query)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-line bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">{manual.space?.name || "General"}</span>
            <span className="rounded-full border border-line bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">Score {manual.rank.score}</span>
            <span className="inline-flex items-center gap-1"><Clock3 size={13} /> Updated {formatDate(manual.updatedAt)}</span>
            <span>Matched by {reasons}</span>
          </div>
        </div>
        <Link href={href as Route} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
          Open result <ArrowUpRight size={15} />
        </Link>
      </div>
      {manual.matchedPages.length ? (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          {manual.matchedPages.slice(0, 3).map((page) => (
            <Link key={page.id} href={`${hrefPrefix}/${manual.slug}#page-${page.slug}` as Route} className="block rounded-md border border-line bg-slate-50 p-3 hover:border-emerald-300 hover:bg-emerald-50">
              <span className="text-sm font-semibold text-slate-900">{highlight(page.title, query)}</span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">{highlight(page.snippet, query)}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function FacetButtons({ title, items, active, onPick }: { title: string; items: Array<{ value: string; label: string; count: number }>; active: string; onPick: (value: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.slice(0, 8).map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onPick(active === item.value ? "all" : item.value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${active === item.value ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {item.label} {item.count}
          </button>
        ))}
      </div>
    </div>
  );
}
