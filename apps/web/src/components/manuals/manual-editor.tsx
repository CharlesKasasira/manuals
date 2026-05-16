"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  FileText,
  Loader2,
  Pencil,
  Send,
  Trash2,
  Upload,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { Manual, ManualPage } from "@/lib/types";
import { formatDate, humanizeStatus } from "@/lib/utils";

type FlatPage = ManualPage & { depth: number };
type LifecycleAction = "submit-review" | "approve" | "request-changes" | "publish" | "archive";

const blankPage = {
  title: "",
  markdown: "",
  parentId: ""
};

function flattenPages(pages: ManualPage[] = [], depth = 0): FlatPage[] {
  return pages.flatMap((page) => [{ ...page, depth }, ...flattenPages(page.children ?? [], depth + 1)]);
}

function pageMarkdown(page?: ManualPage | null) {
  return page?.draftMarkdown ?? page?.publishedMarkdown ?? "";
}

function hasUnpublishedChanges(pages: ManualPage[]) {
  return pages.some((page) => {
    const draftMarkdown = page.draftMarkdown ?? page.publishedMarkdown ?? "";
    const publishedMarkdown = page.publishedMarkdown ?? "";
    const draftHtml = page.draftContentHtml ?? page.publishedContentHtml ?? "";
    const publishedHtml = page.publishedContentHtml ?? "";
    return page.status !== "published" || draftMarkdown !== publishedMarkdown || draftHtml !== publishedHtml;
  });
}

function descendantsOf(pageId: string, pages: ManualPage[] = []) {
  const found = new Set<string>();

  function visit(items: ManualPage[]) {
    for (const item of items) {
      if (item.parentId === pageId || found.has(item.parentId ?? "")) {
        found.add(item.id);
      }
      visit(item.children ?? []);
    }
  }

  visit(pages);
  return found;
}

export function ManualEditor({ slug }: { slug: string }) {
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMarkdown, setEditMarkdown] = useState("");
  const [editParentId, setEditParentId] = useState("");
  const [newPage, setNewPage] = useState(blankPage);
  const [reviewComment, setReviewComment] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const manualQuery = useQuery({
    queryKey: ["manual", slug],
    queryFn: async () => (await api<{ data: Manual }>(`/manuals/${slug}`)).data,
    retry: false
  });

  const manual = manualQuery.data;
  const flatPages = useMemo(() => flattenPages(manual?.tableOfContents ?? manual?.pages ?? []), [manual]);
  const selectedPage = flatPages.find((page) => page.id === selectedPageId) ?? flatPages[0] ?? null;
  const blockedParentIds = selectedPage ? descendantsOf(selectedPage.id, manual?.tableOfContents ?? manual?.pages ?? []) : new Set<string>();
  const signals = manual?.knowledgeSignals;
  const hasDraftChanges = hasUnpublishedChanges(flatPages);
  const lifecycleActions = manual ? [
    manual.status === "draft" ? { action: "submit-review" as const, label: "Submit", icon: Send, variant: "secondary" as const } : null,
    manual.status === "in_review" ? { action: "approve" as const, label: "Approve", icon: CheckCircle2, variant: "secondary" as const } : null,
    ["in_review", "approved"].includes(manual.status) ? { action: "request-changes" as const, label: "Changes", icon: XCircle, variant: "secondary" as const } : null,
    manual.status === "approved" || (manual.status === "published" && hasDraftChanges)
      ? { action: "publish" as const, label: manual.status === "published" ? "Publish changes" : "Publish", icon: Upload, variant: "primary" as const }
      : null,
    manual.status !== "archived" ? { action: "archive" as const, label: "Archive", icon: Archive, variant: "danger" as const } : null
  ].filter(Boolean) as Array<{ action: LifecycleAction; label: string; icon: typeof Send; variant: "primary" | "secondary" | "danger" }> : [];

  useEffect(() => {
    if (!manual || selectedPageId) return;
    setSelectedPageId(flatPages[0]?.id ?? null);
  }, [flatPages, manual, selectedPageId]);

  useEffect(() => {
    setEditTitle(selectedPage?.title ?? "");
    setEditMarkdown(pageMarkdown(selectedPage));
    setEditParentId(selectedPage?.parentId ?? "");
  }, [selectedPage?.id]);

  async function refresh(statusMessage?: string) {
    await manualQuery.refetch();
    if (statusMessage) setMessage(statusMessage);
  }

  async function run<T>(label: string, action: () => Promise<T>, done?: string) {
    setBusy(label);
    setMessage("");
    try {
      const result = await action();
      await refresh(done);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function createPage(event: React.FormEvent) {
    event.preventDefault();
    if (!manual || !newPage.title.trim()) return;

    const created = await run(
      "create-page",
      async () => (await api<{ data: ManualPage }>(`/manuals/${manual.id}/pages`, {
        method: "POST",
        body: JSON.stringify({
          title: newPage.title.trim(),
          parentId: newPage.parentId || undefined,
          markdown: newPage.markdown,
          sortOrder: flatPages.filter((page) => (page.parentId ?? "") === newPage.parentId).length + 1
        })
      })).data,
      "Page created."
    );

    if (created) {
      setNewPage(blankPage);
      setSelectedPageId(created.id);
    }
  }

  async function savePage(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPage) return;
    await run("save-page", async () => api(`/pages/${selectedPage.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: editTitle.trim(),
        markdown: editMarkdown,
        parentId: editParentId || null,
        sortOrder: selectedPage.sortOrder
      })
    }), "Page saved as draft.");
  }

  async function deletePage() {
    if (!selectedPage) return;
    const ok = window.confirm(`Delete "${selectedPage.title}"? Child pages will also be removed.`);
    if (!ok) return;
    await run("delete-page", async () => api(`/pages/${selectedPage.id}`, { method: "DELETE" }), "Page deleted.");
    setSelectedPageId(null);
  }

  async function moveSelected(direction: -1 | 1) {
    if (!selectedPage) return;
    const siblings = flatPages
      .filter((page) => (page.parentId ?? "") === (selectedPage.parentId ?? ""))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const index = siblings.findIndex((page) => page.id === selectedPage.id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= siblings.length) return;

    const reordered = [...siblings];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    await run("reorder-page", async () => api(`/pages/${selectedPage.id}/reorder`, {
      method: "POST",
      body: JSON.stringify({
        pages: reordered.map((page, sortOrder) => ({ id: page.id, parentId: page.parentId ?? null, sortOrder: sortOrder + 1 }))
      })
    }), "Page order updated.");
  }

  async function lifecycle(action: LifecycleAction) {
    if (!manual) return;
    const body = action === "publish" || action === "archive" ? undefined : JSON.stringify({ comment: reviewComment || undefined });
    await run(action, async () => api(`/manuals/${manual.id}/${action}`, {
      method: "POST",
      body
    }), lifecycleLabel(action));
  }

  if (manualQuery.isLoading) {
    return <div className="rounded-lg border border-line bg-white p-8 text-sm text-slate-500">Loading manual editor...</div>;
  }

  if (manualQuery.isError || !manual) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        Sign in, start the API, or check that you have access to this manual.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-white p-5 shadow-sm xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge value={manual.status} />
            <Badge value={manual.visibility} />
            <span className="rounded-full border border-line bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">v{manual.version}</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">{manual.title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{manual.description || "No description provided."}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-slate-500">
            <span>{manual.space?.name || "General"}</span>
            <span>Updated {formatDate(manual.updatedAt)}</span>
            <span>{flatPages.length} pages</span>
            {signals ? <span>{signals.readingTimeMinutes} min read</span> : null}
            {signals ? <span>{signals.qualityScore}% quality</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {lifecycleActions.map(({ action, label, icon: Icon, variant }) => (
            <Button key={action} variant={variant} onClick={() => lifecycle(action)} disabled={Boolean(busy)}>
              <Icon size={16} /> {label}
            </Button>
          ))}
          <Link href={`/manuals/${manual.slug}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            <ExternalLink size={16} /> Reader
          </Link>
        </div>
      </div>

      {message ? <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{message}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><FileText size={17} />Pages</div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {flatPages.length ? flatPages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => setSelectedPageId(page.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition ${selectedPage?.id === page.id ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                    style={{ paddingLeft: `${12 + page.depth * 18}px` }}
                  >
                    <span className="truncate">{page.title}</span>
                    <span className="shrink-0 text-xs opacity-70">{page.status}</span>
                  </button>
                )) : (
                  <p className="rounded-md border border-dashed border-line p-4 text-sm text-slate-500">Create the first page to start drafting.</p>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => moveSelected(-1)} disabled={!selectedPage || Boolean(busy)}>
                  <ArrowUp size={16} /> Up
                </Button>
                <Button variant="secondary" className="flex-1" onClick={() => moveSelected(1)} disabled={!selectedPage || Boolean(busy)}>
                  <ArrowDown size={16} /> Down
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><FilePlus2 size={17} />New page</div>
            </CardHeader>
            <CardContent>
              <form onSubmit={createPage} className="space-y-3">
                <input
                  required
                  value={newPage.title}
                  onChange={(event) => setNewPage((page) => ({ ...page, title: event.target.value }))}
                  placeholder="Page title"
                  className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-slate-400"
                />
                <select
                  value={newPage.parentId}
                  onChange={(event) => setNewPage((page) => ({ ...page, parentId: event.target.value }))}
                  className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm"
                >
                  <option value="">Top-level page</option>
                  {flatPages.map((page) => <option key={page.id} value={page.id}>{"- ".repeat(page.depth)}{page.title}</option>)}
                </select>
                <textarea
                  value={newPage.markdown}
                  onChange={(event) => setNewPage((page) => ({ ...page, markdown: event.target.value }))}
                  placeholder="# Heading"
                  className="min-h-28 w-full rounded-md border border-line px-3 py-2 font-mono text-sm outline-none focus:border-slate-400"
                />
                <Button type="submit" className="w-full" disabled={busy === "create-page"}>
                  {busy === "create-page" ? <Loader2 className="animate-spin" size={16} /> : <FilePlus2 size={16} />} Create page
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>

        <form onSubmit={savePage} className="min-w-0 rounded-lg border border-line bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Pencil size={17} /> Markdown editor
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!selectedPage || Boolean(busy)}>
                {busy === "save-page" ? <Loader2 className="animate-spin" size={16} /> : <Pencil size={16} />} Save draft
              </Button>
              <Button type="button" variant="danger" onClick={deletePage} disabled={!selectedPage || Boolean(busy)}>
                <Trash2 size={16} /> Delete
              </Button>
            </div>
          </div>
          {selectedPage ? (
            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Page title</span>
                  <input
                    required
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-slate-400"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Parent</span>
                  <select
                    value={editParentId}
                    onChange={(event) => setEditParentId(event.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-sm"
                  >
                    <option value="">Top-level page</option>
                    {flatPages.filter((page) => page.id !== selectedPage.id && !blockedParentIds.has(page.id)).map((page) => (
                      <option key={page.id} value={page.id}>{"- ".repeat(page.depth)}{page.title}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Markdown</span>
                <textarea
                  value={editMarkdown}
                  onChange={(event) => setEditMarkdown(event.target.value)}
                  className="mt-1 min-h-[520px] w-full rounded-md border border-line bg-slate-950 px-4 py-3 font-mono text-sm leading-6 text-slate-50 outline-none focus:border-slate-400"
                  spellCheck={false}
                />
              </label>
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-slate-500">Select or create a page to edit markdown.</div>
          )}
        </form>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><BookOpenCheck size={17} />Knowledge health</div>
            </CardHeader>
            <CardContent>
              {signals ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Quality score</dt>
                    <dd className="font-semibold text-slate-900">{signals.qualityScore}%</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Words</dt>
                    <dd className="font-semibold text-slate-900">{signals.wordCount}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Empty pages</dt>
                    <dd className="font-semibold text-slate-900">{signals.emptyPageCount}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Review due</dt>
                    <dd className="font-semibold capitalize text-slate-900">{humanizeStatus(signals.reviewDueStatus)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">Health signals appear after the manual is loaded from the API.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-slate-950">Review note</div>
            </CardHeader>
            <CardContent>
              <textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                placeholder="Optional comment for review actions"
                className="min-h-32 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-slate-950">Manual state</div>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Review</dt>
                  <dd className="font-semibold text-slate-900">{manual.reviewState}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Published</dt>
                  <dd className="font-semibold text-slate-900">{manual.publishedAt ? formatDate(manual.publishedAt) : "-"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Reviewed</dt>
                  <dd className="font-semibold text-slate-900">{manual.lastReviewedAt ? formatDate(manual.lastReviewedAt) : "-"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Views</dt>
                  <dd className="font-semibold text-slate-900">{manual.viewCount ?? 0}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function lifecycleLabel(action: LifecycleAction) {
  switch (action) {
    case "submit-review":
      return "Manual submitted for review.";
    case "approve":
      return "Manual approved.";
    case "request-changes":
      return "Changes requested.";
    case "publish":
      return "Manual published.";
    case "archive":
      return "Manual archived.";
  }
}
