"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Search, SlidersHorizontal } from "lucide-react";
import { Manual } from "@/lib/types";
import { humanizeStatus } from "@/lib/utils";
import { ManualCard } from "./manual-card";

export function ManualBrowser({ manuals, hrefPrefix = "/manuals", initialStatus = "all" }: { manuals: Manual[]; hrefPrefix?: string; initialStatus?: string }) {
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [status, setStatus] = useState(initialStatus);
  const [space, setSpace] = useState("all");
  const [review, setReview] = useState("all");
  const [sort, setSort] = useState("updated");

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return manuals.filter((manual) => {
      const matchesQuery = !q || [manual.title, manual.description, manual.space?.name, ...(manual.tags ?? []).map((tag) => tag.name)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      const matchesVisibility = visibility === "all" || manual.visibility === visibility;
      const matchesStatus = status === "all" || manual.status === status;
      const matchesSpace = space === "all" || manual.space?.slug === space;
      const matchesReview = review === "all" || manual.knowledgeSignals?.reviewDueStatus === review;
      return matchesQuery && matchesVisibility && matchesStatus && matchesSpace && matchesReview;
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
  }, [manuals, query, review, sort, space, status, visibility]);

  const spaces = useMemo(() => Array.from(new Map(manuals.filter((manual) => manual.space).map((manual) => [manual.space!.slug, manual.space!])).values()), [manuals]);
  const signals = manuals.map((manual) => manual.knowledgeSignals).filter(Boolean);
  const averageQuality = signals.length ? Math.round(signals.reduce((total, item) => total + item!.qualityScore, 0) / signals.length) : 0;
  const overdueReviews = signals.filter((item) => item?.reviewDueStatus === "overdue").length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Manual Library</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">Find trusted operating guidance.</h1>
            <p className="mt-1 text-sm text-slate-600">Browse manuals by status, space, visibility, tags, and usage.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-line bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{manuals.length} manuals</span>
            <span className="rounded-full border border-line bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{filtered.length} shown</span>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px] xl:grid-cols-[minmax(0,1fr)_170px_170px_170px_170px_170px]">
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
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="grid gap-4">
          {filtered.length ? filtered.map((manual) => <ManualCard key={manual.id} manual={manual} hrefPrefix={hrefPrefix} />) : (
            <div className="rounded-lg border border-dashed border-line bg-white p-10 text-center text-sm text-slate-500">No matching manuals found.</div>
          )}
        </div>
        <aside className="space-y-4">
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
              {Array.from(new Set(manuals.flatMap((manual) => manual.tags?.map((tag) => tag.name) ?? []))).slice(0, 12).map((tag) => (
                <button key={tag} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" onClick={() => setQuery(tag)}>#{tag}</button>
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
