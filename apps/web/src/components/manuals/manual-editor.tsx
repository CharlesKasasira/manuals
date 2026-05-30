"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  AlertTriangle,
  BookOpenCheck,
  Bold,
  CheckCircle2,
  Code2,
  GitBranch,
  ExternalLink,
  FilePlus2,
  FileText,
  GripVertical,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Pilcrow,
  Quote,
  Send,
  Table2,
  Trash2,
  Upload,
  UserRound,
  Video,
  Wand2,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { API_URL, api } from "@/lib/api";
import { highlightCode, htmlToText, markdownToHtml, sanitizeRichHtml, videoEmbedUrl } from "@/lib/manual-content";
import type { Collaborator, Manual, ManualPage, PageComment, PageCommentKind, Visibility } from "@/lib/types";
import { formatDate, humanizeStatus } from "@/lib/utils";

type FlatPage = ManualPage & { depth: number };
type LifecycleAction = "submit-review" | "approve" | "request-changes" | "publish" | "archive";
type SlashCommandId = "procedure" | "warning" | "table" | "code" | "diagram" | "tabs" | "image" | "video";
type PageDropPosition = "before" | "inside" | "after";
type InlineCommentDraft = { anchor: string; quote: string; body: string; kind: PageCommentKind };

type SlashCommand = {
  id: SlashCommandId;
  label: string;
  hint: string;
  keywords: string[];
};

const blankPage = {
  title: "",
  contentHtml: "",
  parentId: ""
};

const slashCommands: SlashCommand[] = [
  { id: "procedure", label: "Procedure", hint: "Purpose, steps, and verification", keywords: ["runbook", "steps", "process"] },
  { id: "warning", label: "Callout Block", hint: "Risk, note, exception, or prerequisite", keywords: ["alert", "callout", "caution", "warning"] },
  { id: "table", label: "Insert Table", hint: "Structured comparison or requirements grid", keywords: ["grid", "matrix", "table"] },
  { id: "code", label: "Code Block", hint: "Highlighted code snippet", keywords: ["snippet", "playground", "code"] },
  { id: "diagram", label: "Mermaid diagram", hint: "Flowchart, sequence, or architecture map", keywords: ["mermaid", "flowchart", "sequence", "architecture"] },
  { id: "tabs", label: "Code tabs", hint: "Switcher for alternate commands or languages", keywords: ["switcher", "playground", "languages"] },
  { id: "image", label: "Add Image", hint: "Upload and crop an image", keywords: ["photo", "diagram", "screenshot", "image"] },
  { id: "video", label: "Video", hint: "Embed YouTube, Vimeo, or uploaded video", keywords: ["embed", "media"] }
];

export function slashCommandsForQuery(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return slashCommands;
  return slashCommands.filter((command) => (
    command.label.toLowerCase().includes(normalized) ||
    command.id.includes(normalized) ||
    command.keywords.some((keyword) => keyword.includes(normalized))
  ));
}

export function governanceStepsForStatus(status: Manual["status"], reviewState?: string) {
  const normalizedReview = (reviewState ?? "").toLowerCase();
  const steps = [
    { id: "draft", label: "Draft" },
    { id: "in_review", label: "Under Review" },
    { id: "changes_requested", label: "Changes Requested" },
    { id: "approved", label: "Approved" },
    { id: "published", label: "Published" }
  ];
  const activeId = status === "published"
    ? "published"
    : status === "approved"
      ? "approved"
      : normalizedReview.includes("changes") || normalizedReview.includes("request")
        ? "changes_requested"
        : status === "in_review"
          ? "in_review"
          : "draft";
  const activeIndex = steps.findIndex((step) => step.id === activeId);
  return steps.map((step, index) => ({
    ...step,
    state: index < activeIndex ? "complete" : index === activeIndex ? "active" : "upcoming"
  }));
}

function flattenPages(pages: ManualPage[] = [], depth = 0): FlatPage[] {
  return pages.flatMap((page) => [{ ...page, depth }, ...flattenPages(page.children ?? [], depth + 1)]);
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

export function reorderPagesForDrop(pages: ManualPage[], draggedId: string, targetId: string, position: PageDropPosition) {
  if (draggedId === targetId) return null;
  const flat = flattenPages(pages);
  const dragged = flat.find((page) => page.id === draggedId);
  const target = flat.find((page) => page.id === targetId);
  if (!dragged || !target) return null;
  if (descendantsOf(draggedId, pages).has(targetId)) return null;

  const nextParentId = position === "inside" ? target.id : target.parentId ?? null;
  const groups = new Map<string, FlatPage[]>();
  for (const page of flat) {
    if (page.id === draggedId) continue;
    const parentKey = page.parentId ?? "";
    groups.set(parentKey, [...(groups.get(parentKey) ?? []), page]);
  }
  for (const [parentKey, siblings] of groups) {
    groups.set(parentKey, [...siblings].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)));
  }

  const targetKey = nextParentId ?? "";
  const nextSiblings = [...(groups.get(targetKey) ?? [])];
  const movedPage = { ...dragged, parentId: nextParentId };
  if (position === "inside") {
    nextSiblings.push(movedPage);
  } else {
    const targetIndex = nextSiblings.findIndex((page) => page.id === targetId);
    if (targetIndex < 0) return null;
    nextSiblings.splice(position === "before" ? targetIndex : targetIndex + 1, 0, movedPage);
  }
  groups.set(targetKey, nextSiblings);

  return Array.from(groups.entries()).flatMap(([parentKey, siblings]) => (
    siblings.map((page, index) => ({
      id: page.id,
      parentId: parentKey || null,
      sortOrder: index + 1
    }))
  ));
}

export function clipboardImageFiles(clipboardData: DataTransfer) {
  const images: File[] = [];
  const seen = new Set<string>();

  function add(file: File | null) {
    if (!file?.type.startsWith("image/")) return;
    const key = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    images.push(file);
  }

  Array.from(clipboardData.files).forEach(add);
  Array.from(clipboardData.items)
    .filter((item) => item.kind === "file")
    .forEach((item) => add(item.getAsFile()));

  return images;
}

function editableMarkdown(page?: ManualPage | null) {
  return page?.draftMarkdown ?? page?.publishedMarkdown ?? "";
}

function editableRichHtml(page?: ManualPage | null) {
  const richHtml = page?.draftContentHtml ?? page?.publishedContentHtml;
  if (richHtml?.trim()) return sanitizeRichHtml(richHtml);
  const markdown = editableMarkdown(page);
  return markdown.trim() ? markdownToHtml(markdown) : "";
}

export function ManualEditor({ slug }: { slug: string }) {
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContentHtml, setEditContentHtml] = useState("");
  const [editParentId, setEditParentId] = useState("");
  const [newPage, setNewPage] = useState(blankPage);
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<{ targetId: string; position: PageDropPosition } | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentKind, setCommentKind] = useState<PageCommentKind>("comment");
  const [commentAnchor, setCommentAnchor] = useState("");
  const [commentAssigneeId, setCommentAssigneeId] = useState("");
  const [mentionUserIds, setMentionUserIds] = useState<string[]>([]);
  const [inlineCommentDraft, setInlineCommentDraft] = useState<InlineCommentDraft | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const manualQuery = useQuery({
    queryKey: ["manual", slug],
    queryFn: async () => (await api<{ data: Manual }>(`/manuals/${slug}`)).data,
    retry: false
  });

  const manual = manualQuery.data;
  const collaborators = useQuery({
    queryKey: ["manual-collaborators", manual?.id],
    queryFn: async () => (await api<{ data: Collaborator[] }>(`/manuals/${manual!.id}/collaborators`)).data,
    enabled: Boolean(manual?.id),
    retry: false
  });
  const flatPages = useMemo(() => flattenPages(manual?.tableOfContents ?? manual?.pages ?? []), [manual]);
  const selectedPage = flatPages.find((page) => page.id === selectedPageId) ?? flatPages[0] ?? null;
  const selectedPageComments = [...(selectedPage?.comments ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
  const openCommentCount = selectedPageComments.filter((comment) => comment.status === "open").length;
  const pinnedComments = selectedPageComments.filter((comment) => comment.sectionAnchor);
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
    const richHtml = editableRichHtml(selectedPage);
    setEditTitle(selectedPage?.title ?? "");
    setEditContentHtml(richHtml);
    setEditParentId(selectedPage?.parentId ?? "");
    setCommentAnchor("");
    setCommentBody("");
    setCommentAssigneeId("");
    setMentionUserIds([]);
    setInlineCommentDraft(null);
  }, [selectedPage]);

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
          contentHtml: sanitizeRichHtml(newPage.contentHtml),
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
    const contentHtml = sanitizeRichHtml(editContentHtml);
    await run("save-page", async () => api(`/pages/${selectedPage.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: editTitle.trim(),
        contentHtml,
        markdown: null,
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

  async function reorderPages(draggedId: string, targetId: string, position: PageDropPosition) {
    const pages = manual?.tableOfContents ?? manual?.pages ?? [];
    const reordered = reorderPagesForDrop(pages, draggedId, targetId, position);
    if (!reordered) return;

    await run("reorder-page", async () => api(`/pages/${draggedId}/reorder`, {
      method: "POST",
      body: JSON.stringify({ pages: reordered })
    }), position === "inside" ? "Page nested." : "Page order updated.");
  }

  function getDropPosition(event: React.DragEvent<HTMLElement>): PageDropPosition {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientY - rect.top;
    if (offset < rect.height * 0.28) return "before";
    if (offset > rect.height * 0.72) return "after";
    return "inside";
  }

  async function lifecycle(action: LifecycleAction) {
    if (!manual) return;
    const body = action === "publish" || action === "archive" ? undefined : JSON.stringify({ comment: reviewComment || undefined });
    await run(action, async () => api(`/manuals/${manual.id}/${action}`, {
      method: "POST",
      body
    }), lifecycleLabel(action));
  }

  async function updateVisibility(visibility: Visibility) {
    if (!manual || visibility === manual.visibility) return;
    await run("visibility", async () => api(`/manuals/${manual.id}`, {
      method: "PATCH",
      body: JSON.stringify({ visibility })
    }), `Visibility changed to ${visibility}.`);
  }

  async function assignSelectedPage(assignedOwnerId: string) {
    if (!selectedPage) return;
    await run("assign-page", async () => api(`/pages/${selectedPage.id}/assignment`, {
      method: "PATCH",
      body: JSON.stringify({ assignedOwnerId: assignedOwnerId || null })
    }), assignedOwnerId ? "Page owner assigned." : "Page owner cleared.");
  }

  async function createPageComment(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPage || !commentBody.trim()) return;
    await run("create-comment", async () => api(`/pages/${selectedPage.id}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: commentBody.trim(),
        kind: commentKind,
        sectionAnchor: commentAnchor.trim() || null,
        assignedToId: commentAssigneeId || null,
        mentionUserIds
      })
    }), commentKind === "change_request" ? "Change request added." : "Comment added.");
    setCommentBody("");
    setCommentAnchor("");
    setCommentAssigneeId("");
    setMentionUserIds([]);
    setCommentKind("comment");
  }

  async function createInlineComment(draft: InlineCommentDraft) {
    if (!selectedPage || !draft.body.trim()) return;
    await run("create-inline-comment", async () => api(`/pages/${selectedPage.id}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: draft.body.trim(),
        kind: draft.kind,
        sectionAnchor: draft.anchor,
        assignedToId: commentAssigneeId || null,
        mentionUserIds
      })
    }), draft.kind === "change_request" ? "Inline change request pinned." : "Inline comment pinned.");
    setInlineCommentDraft(null);
    setCommentAssigneeId("");
    setMentionUserIds([]);
  }

  async function updatePageComment(comment: PageComment, status: "open" | "resolved") {
    if (!selectedPage) return;
    await run(`comment-${comment.id}`, async () => api(`/pages/${selectedPage.id}/comments/${comment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }), status === "resolved" ? "Comment resolved." : "Comment reopened.");
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
            {typeof signals?.qualityScore === "number" ? <span>{signals.qualityScore}% quality</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700">
            <span>Visibility</span>
            <select
              value={manual.visibility}
              onChange={(event) => updateVisibility(event.target.value as Visibility)}
              disabled={busy === "visibility"}
              className="bg-transparent text-slate-950 outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="internal">Internal</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>
          {lifecycleActions.map(({ action, label, icon: Icon, variant }) => (
            <Button key={action} variant={variant} onClick={() => lifecycle(action)} disabled={Boolean(busy)}>
              <Icon size={16} /> {label}
            </Button>
          ))}
          <Link href={`/app/manuals/${manual.slug}/reader`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            <ExternalLink size={16} /> Reader
          </Link>
        </div>
      </div>

      <GovernanceProgress status={manual.status} reviewState={manual.reviewState} />

      {message ? <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{message}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <form onSubmit={savePage} className="min-w-0 rounded-lg border border-line bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Pencil size={17} /> Smart visual editor
            </div>
            <div className="flex flex-wrap gap-2">
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
              <div className="overflow-hidden rounded-lg border border-line bg-white">
                <div className="border-b border-line bg-slate-50 px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Page</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">{editTitle || selectedPage.title}</h2>
                </div>
                <div className="p-5">
                  <RichManualEditor
                    value={editContentHtml}
                    onChange={setEditContentHtml}
                    placeholder="Write the manual page..."
                    mediaVisibility={manual.visibility}
                    pinnedComments={pinnedComments}
                    inlineCommentDraft={inlineCommentDraft}
                    onInlineCommentDraft={setInlineCommentDraft}
                    onCreateInlineComment={createInlineComment}
                    onCancelInlineComment={() => setInlineCommentDraft(null)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-slate-500">Select or create a page to edit.</div>
          )}
        </form>

        <aside className="space-y-3 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1">
          <CollapsiblePanel title="Pages" icon={<FileText size={17} />} defaultOpen>
            <div className="space-y-1">
              {flatPages.length ? flatPages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    setDraggedPageId(page.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", page.id);
                  }}
                  onDragEnd={() => {
                    setDraggedPageId(null);
                    setDropIntent(null);
                  }}
                  onDragOver={(event) => {
                    const pages = manual?.tableOfContents ?? manual?.pages ?? [];
                    if (!draggedPageId || draggedPageId === page.id || descendantsOf(draggedPageId, pages).has(page.id)) return;
                    event.preventDefault();
                    const position = getDropPosition(event);
                    event.dataTransfer.dropEffect = "move";
                    setDropIntent({ targetId: page.id, position });
                  }}
                  onDragLeave={() => setDropIntent((intent) => intent?.targetId === page.id ? null : intent)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId = event.dataTransfer.getData("text/plain") || draggedPageId;
                    const position = dropIntent?.targetId === page.id ? dropIntent.position : getDropPosition(event);
                    setDraggedPageId(null);
                    setDropIntent(null);
                    if (sourceId) void reorderPages(sourceId, page.id, position);
                  }}
                  onClick={() => setSelectedPageId(page.id)}
                  className={`relative flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition ${selectedPage?.id === page.id ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-100"} ${draggedPageId === page.id ? "opacity-45" : ""} ${dropIntent?.targetId === page.id && dropIntent.position === "inside" ? "ring-2 ring-emerald-300" : ""}`}
                  style={{ paddingLeft: `${12 + page.depth * 18}px` }}
                >
                  {dropIntent?.targetId === page.id && dropIntent.position === "before" ? <span className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-emerald-400" /> : null}
                  {dropIntent?.targetId === page.id && dropIntent.position === "after" ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-emerald-400" /> : null}
                  <span className="flex min-w-0 items-center gap-2">
                    <GripVertical size={14} className="shrink-0 opacity-60" />
                    <span className="truncate">{page.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs opacity-70">
                    {page.comments?.some((comment) => comment.status === "open") ? <MessageSquarePlus size={12} /> : null}
                    {page.assignedOwner ? <UserRound size={12} /> : null}
                    {page.status}
                  </span>
                </button>
              )) : (
                <p className="rounded-md border border-dashed border-line p-4 text-sm text-slate-500">Create the first page to start drafting.</p>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Drag a page above or below another page to reorder it, or drop in the center of a row to nest it.</p>
          </CollapsiblePanel>

          <CollapsiblePanel title="New page" icon={<FilePlus2 size={17} />}>
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
              <RichManualEditor
                value={newPage.contentHtml}
                onChange={(contentHtml) => setNewPage((page) => ({ ...page, contentHtml }))}
                placeholder="Start the page..."
                mediaVisibility={manual.visibility}
                compact
              />
              <Button type="submit" className="w-full" disabled={busy === "create-page"}>
                {busy === "create-page" ? <Loader2 className="animate-spin" size={16} /> : <FilePlus2 size={16} />} Create page
              </Button>
            </form>
          </CollapsiblePanel>

          <CollapsiblePanel
            title="Page collaboration"
            icon={<MessageSquarePlus size={17} />}
            badge={selectedPage ? `${openCommentCount} open` : undefined}
          >
            {selectedPage ? (
              <div className="space-y-4">
                <label className="block">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><UserRound size={15} />Assigned owner</span>
                  <select
                    value={selectedPage.assignedOwnerId ?? ""}
                    onChange={(event) => assignSelectedPage(event.target.value)}
                    disabled={busy === "assign-page" || collaborators.isLoading}
                    className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {(collaborators.data ?? []).map((user) => <option key={user.id} value={user.id}>{user.name} / {user.role}</option>)}
                  </select>
                </label>

                <form onSubmit={createPageComment} className="space-y-3 rounded-md border border-line bg-slate-50 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select value={commentKind} onChange={(event) => setCommentKind(event.target.value as PageCommentKind)} className="h-10 rounded-md border border-line bg-white px-3 text-sm">
                      <option value="comment">Comment</option>
                      <option value="reviewer_note">Reviewer note</option>
                      <option value="change_request">Change request</option>
                    </select>
                    <input value={commentAnchor} onChange={(event) => setCommentAnchor(event.target.value)} placeholder="Section anchor" className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-slate-400" />
                  </div>
                  <select value={commentAssigneeId} onChange={(event) => setCommentAssigneeId(event.target.value)} className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm">
                    <option value="">No action owner</option>
                    {(collaborators.data ?? []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                  <select
                    multiple
                    value={mentionUserIds}
                    onChange={(event) => setMentionUserIds(Array.from(event.target.selectedOptions).map((option) => option.value))}
                    className="min-h-20 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                  >
                    {(collaborators.data ?? []).map((user) => <option key={user.id} value={user.id}>@{user.name}</option>)}
                  </select>
                  <textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Leave a note, mention teammates, or request a section change..." className="min-h-24 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-slate-400" />
                  <Button type="submit" className="w-full" disabled={!commentBody.trim() || busy === "create-comment"}>
                    {busy === "create-comment" ? <Loader2 className="animate-spin" size={16} /> : <MessageSquarePlus size={16} />} Add note
                  </Button>
                </form>

                <div className="space-y-2">
                  {selectedPageComments.length ? selectedPageComments.map((comment) => (
                    <div key={comment.id} className={`rounded-md border p-3 ${comment.kind === "change_request" && comment.status === "open" ? "border-amber-200 bg-amber-50" : "border-line bg-white"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-line bg-slate-50 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">{humanizeStatus(comment.kind)}</span>
                          <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs font-semibold capitalize text-slate-600">{comment.status}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updatePageComment(comment, comment.status === "open" ? "resolved" : "open")}
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                          disabled={busy === `comment-${comment.id}`}
                        >
                          {comment.status === "open" ? "Resolve" : "Reopen"}
                        </button>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{comment.body}</p>
                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        <p>{comment.author?.name ?? "Unknown"} / {formatDate(comment.createdAt)}</p>
                        {comment.sectionAnchor ? <p>Section: {comment.sectionAnchor}</p> : null}
                        {comment.assignedTo ? <p>Owner: {comment.assignedTo.name}</p> : null}
                        {comment.mentions?.length ? <p>Mentions: {comment.mentions.map((mention) => `@${mention.user.name}`).join(", ")}</p> : null}
                      </div>
                    </div>
                  )) : (
                    <p className="rounded-md border border-dashed border-line p-4 text-sm text-slate-500">No page comments yet.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a page to add notes, mentions, and section-level change requests.</p>
            )}
          </CollapsiblePanel>

          <CollapsiblePanel title="Knowledge health" icon={<BookOpenCheck size={17} />}>
            {signals ? (
              <dl className="space-y-3 text-sm">
                {typeof signals.qualityScore === "number" ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Quality score</dt>
                    <dd className="font-semibold text-slate-900">{signals.qualityScore}%</dd>
                  </div>
                ) : null}
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
          </CollapsiblePanel>

          <CollapsiblePanel title="Review note">
            <textarea
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value)}
              placeholder="Optional comment for review actions"
              className="min-h-32 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </CollapsiblePanel>

          <CollapsiblePanel title="Manual state">
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
          </CollapsiblePanel>
        </aside>
      </div>
    </div>
  );
}

function CollapsiblePanel({
  title,
  icon,
  badge,
  defaultOpen = false,
  children
}: {
  title: string;
  icon?: React.ReactNode;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-line bg-white shadow-sm" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-950 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge ? <span className="rounded-full border border-line bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">{badge}</span> : null}
          <span className="text-xs font-bold text-slate-400 transition group-open:rotate-90">&gt;</span>
        </span>
      </summary>
      <div className="border-t border-line p-4">
        {children}
      </div>
    </details>
  );
}

function GovernanceProgress({ status, reviewState }: { status: Manual["status"]; reviewState?: string }) {
  const steps = governanceStepsForStatus(status, reviewState);

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <GitBranch size={17} /> Review workflow
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{humanizeStatus(status)}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        {steps.map((step, index) => (
          <div key={step.id} className="relative">
            {index > 0 ? <div className={`absolute -left-3 top-4 hidden h-0.5 w-3 md:block ${step.state === "upcoming" ? "bg-slate-200" : "bg-emerald-400"}`} /> : null}
            <div className={`flex items-center gap-3 rounded-md border px-3 py-2 ${step.state === "active" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : step.state === "complete" ? "border-emerald-200 bg-white text-slate-900" : "border-line bg-slate-50 text-slate-500"}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.state === "upcoming" ? "bg-white text-slate-400" : "bg-emerald-500 text-white"}`}>
                {step.state === "complete" ? <CheckCircle2 size={15} /> : index + 1}
              </span>
              <span className="min-w-0 text-sm font-semibold">{step.label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RichManualEditor({
  value,
  onChange,
  placeholder,
  mediaVisibility = "internal",
  compact = false,
  pinnedComments = [],
  inlineCommentDraft,
  onInlineCommentDraft,
  onCreateInlineComment,
  onCancelInlineComment
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mediaVisibility?: Visibility;
  compact?: boolean;
  pinnedComments?: PageComment[];
  inlineCommentDraft?: InlineCommentDraft | null;
  onInlineCommentDraft?: (draft: InlineCommentDraft) => void;
  onCreateInlineComment?: (draft: InlineCommentDraft) => void | Promise<void>;
  onCancelInlineComment?: () => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedMediaElement, setSelectedMediaElement] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const [mediaWidth, setMediaWidth] = useState(100);
  const [imageDraft, setImageDraft] = useState<{ file: File; url: string; zoom: number; x: number; y: number; ratio: string } | null>(null);
  const [codeDraft, setCodeDraft] = useState<{ open: boolean; language: string; code: string }>({ open: false, language: "typescript", code: "" });
  const [videoDraft, setVideoDraft] = useState<{ open: boolean; url: string }>({ open: false, url: "" });
  const [mediaError, setMediaError] = useState("");
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [selectionAction, setSelectionAction] = useState<{ top: number; left: number; quote: string } | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);
  const visibleSlashCommands = slashCommandsForQuery(slashQuery ?? "");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    const safeValue = sanitizeRichHtml(value);
    if (editor.innerHTML !== safeValue) editor.innerHTML = safeValue;
  }, [value]);

  useEffect(() => {
    return () => {
      if (imageDraft) URL.revokeObjectURL(imageDraft.url);
    };
  }, [imageDraft]);

  function sync() {
    onChange(sanitizeRichHtml(editorRef.current?.innerHTML ?? ""));
  }

  function command(name: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(name, false, commandValue);
    sync();
  }

  function insertHtml(html: string) {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, sanitizeRichHtml(html));
    sync();
  }

  function updateSelectionAction() {
    if (compact || !onInlineCommentDraft) return;
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || selection.isCollapsed) {
      setSelectionAction(null);
      selectionRangeRef.current = null;
      return;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      setSelectionAction(null);
      selectionRangeRef.current = null;
      return;
    }
    const quote = selection.toString().trim().replace(/\s+/g, " ");
    if (!quote) {
      setSelectionAction(null);
      selectionRangeRef.current = null;
      return;
    }
    const rect = range.getBoundingClientRect();
    const host = editor.getBoundingClientRect();
    selectionRangeRef.current = range.cloneRange();
    setSelectionAction({
      quote: quote.slice(0, 180),
      left: editor.offsetLeft + Math.min(Math.max(rect.left - host.left + rect.width / 2, 24), host.width - 24),
      top: editor.offsetTop + Math.max(rect.top - host.top - 44, 8)
    });
  }

  function startInlineComment() {
    const editor = editorRef.current;
    const range = selectionRangeRef.current;
    if (!editor || !range || !onInlineCommentDraft) return;

    const anchor = `pin-${Date.now().toString(36)}`;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const quote = range.toString().trim().replace(/\s+/g, " ");
    document.execCommand(
      "insertHTML",
      false,
      `<span class="manual-inline-comment-anchor" data-comment-anchor="${anchor}">${escapeEditorText(range.toString())}</span>`
    );
    sync();
    setSelectionAction(null);
    selectionRangeRef.current = null;
    onInlineCommentDraft({ anchor, quote: quote.slice(0, 180), body: "", kind: "comment" });
    window.setTimeout(() => document.getElementById("inline-comment-body")?.focus(), 0);
  }

  function getSlashQuery() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return null;
    const node = selection.anchorNode;
    if (!node || !editor.contains(node) || node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.textContent ?? "";
    const offset = selection.anchorOffset;
    const beforeCursor = text.slice(0, offset);
    const match = /(?:^|\s)\/([a-z]*)$/i.exec(beforeCursor);
    return match ? match[1] : null;
  }

  function removeSlashQuery() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const node = selection.anchorNode;
    if (!node || !editor.contains(node) || node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent ?? "";
    const offset = selection.anchorOffset;
    const beforeCursor = text.slice(0, offset);
    const match = /(?:^|\s)\/([a-z]*)$/i.exec(beforeCursor);
    if (!match || match.index === undefined) return;

    const slashStart = beforeCursor.lastIndexOf("/");
    node.textContent = `${text.slice(0, slashStart)}${text.slice(offset)}`;
    const range = document.createRange();
    range.setStart(node, slashStart);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function updateSlashMenu() {
    const query = getSlashQuery();
    setSlashQuery(query);
    setSlashIndex(0);
  }

  function applySlashCommand(command: SlashCommand) {
    removeSlashQuery();
    sync();
    setSlashQuery(null);

    switch (command.id) {
      case "procedure":
        insertHtml(procedureBlock());
        return;
      case "warning":
        insertHtml(calloutBlock("warning"));
        return;
      case "table":
        insertHtml(tableBlock());
        return;
      case "code":
        setCodeDraft((draft) => ({ ...draft, open: true }));
        return;
      case "diagram":
        setCodeDraft({ open: true, language: "mermaid", code: "flowchart TD\n  Start[Start] --> Decision{Decision}\n  Decision -->|Yes| Done[Done]\n  Decision -->|No| Start" });
        return;
      case "tabs":
        insertHtml(codeTabsBlock());
        return;
      case "image":
        imageInputRef.current?.click();
        return;
      case "video":
        setVideoDraft({ open: true, url: "" });
        return;
    }
  }

  function handleKeyUp(event: React.KeyboardEvent<HTMLDivElement>) {
    if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
    updateSlashMenu();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (slashQuery === null) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setSlashQuery(null);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlashIndex((index) => Math.min(index + 1, Math.max(visibleSlashCommands.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlashIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && visibleSlashCommands[slashIndex]) {
      event.preventDefault();
      applySlashCommand(visibleSlashCommands[slashIndex]);
    }
  }

  async function uploadMediaFile(file: File) {
    setMediaError("");
    const formData = new FormData();
    formData.append("file", file);
    const uploaded = await api<{ data: { id: string; fileName: string; mimeType?: string | null } }>(`/assets?visibility=${mediaVisibility}`, {
      method: "POST",
      body: formData
    });
    return {
      ...uploaded.data,
      url: `${API_URL}/assets/${uploaded.data.id}/download`
    };
  }

  async function insertUploadedImage(file: File) {
    const asset = await uploadMediaFile(file);
    insertHtml(`<img src="${asset.url}" alt="${escapeEditorText(asset.fileName)}" width="100%" loading="lazy">`);
  }

  function handleImageSelection(file?: File | null) {
    if (!file || !file.type.startsWith("image/")) return;
    if (imageDraft) URL.revokeObjectURL(imageDraft.url);
    setImageDraft({ file, url: URL.createObjectURL(file), zoom: 1, x: 50, y: 50, ratio: "16:9" });
  }

  async function handleVideoSelection(file?: File | null) {
    if (!file || !file.type.startsWith("video/")) return;
    setUploadingMedia(true);
    try {
      const asset = await uploadMediaFile(file);
      insertHtml(`<video controls src="${asset.url}" width="100%"></video>`);
      setVideoDraft({ open: false, url: "" });
    } finally {
      setUploadingMedia(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  async function cropAndInsertImage() {
    if (!imageDraft) return;
    setUploadingMedia(true);
    try {
      const cropped = await cropImageFile(imageDraft);
      await insertUploadedImage(cropped);
      URL.revokeObjectURL(imageDraft.url);
      setImageDraft(null);
    } catch {
      setMediaError("Image upload failed. Try a smaller image or check the API connection.");
    } finally {
      setUploadingMedia(false);
    }
  }

  function insertCodeBlock() {
    const language = codeDraft.language.trim() || "text";
    const highlighted = highlightCode(language, codeDraft.code);
    insertHtml(`<pre data-language="${escapeEditorText(language)}"><code class="language-${escapeEditorText(language)}">${highlighted}</code></pre>`);
    setCodeDraft({ open: false, language: "typescript", code: "" });
  }

  function insertVideoEmbed() {
    const src = videoEmbedUrl(videoDraft.url);
    if (!src) return;
    if (/\.(mp4|webm|ogg)$/i.test(src)) {
      insertHtml(`<video controls src="${src}" width="100%"></video>`);
    } else {
      insertHtml(`<iframe src="${src}" loading="lazy" allowfullscreen></iframe>`);
    }
    setVideoDraft({ open: false, url: "" });
  }

  async function uploadDataUrlImages(html: string) {
    if (!/<img\b[^>]+\bsrc\s*=\s*["']data:image\//i.test(html)) return html;
    const documentFragment = new DOMParser().parseFromString(html, "text/html");
    const images = Array.from(documentFragment.body.querySelectorAll<HTMLImageElement>('img[src^="data:image/"]'));

    for (const image of images) {
      const dataUrl = image.getAttribute("src");
      if (!dataUrl) continue;
      const file = await fileFromDataUrl(dataUrl, image.getAttribute("alt") || "pasted-image");
      const asset = await uploadMediaFile(file);
      image.setAttribute("src", asset.url);
      image.setAttribute("alt", image.getAttribute("alt") || asset.fileName);
      image.setAttribute("width", image.getAttribute("width") || "100%");
      image.setAttribute("loading", "lazy");
    }

    return documentFragment.body.innerHTML;
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    setMediaError("");

    const images = clipboardImageFiles(event.clipboardData);
    if (images.length) {
      setUploadingMedia(true);
      try {
        for (const image of images) {
          await insertUploadedImage(image);
        }
      } catch {
        setMediaError("Pasted image upload failed. Try a smaller image or check the API connection.");
      } finally {
        setUploadingMedia(false);
      }
      return;
    }

    try {
      const html = event.clipboardData.getData("text/html");
      const text = event.clipboardData.getData("text/plain");
      if (html) {
        setUploadingMedia(/<img\b[^>]+\bsrc\s*=\s*["']data:image\//i.test(html));
        insertHtml(await uploadDataUrlImages(html));
        return;
      }
      insertHtml(text.split(/\n{2,}/).map((part) => `<p>${escapeEditorText(part).replace(/\n/g, "<br>")}</p>`).join(""));
    } catch {
      setMediaError("Pasted content could not be inserted.");
    } finally {
      setUploadingMedia(false);
    }
  }

  function handleEditorClick(event: React.MouseEvent<HTMLDivElement>) {
    setSlashQuery(null);
    updateSelectionAction();
    const target = event.target;
    if (target instanceof HTMLImageElement || target instanceof HTMLVideoElement) {
      setSelectedMediaElement(target);
      setMediaWidth(Number.parseInt(target.getAttribute("width") || "100", 10));
      return;
    }
    setSelectedMediaElement(null);
  }

  function resizeSelectedMedia(width: number) {
    if (!selectedMediaElement) return;
    selectedMediaElement.setAttribute("width", `${width}%`);
    setMediaWidth(width);
    sync();
  }

  const wordCount = htmlToText(value).split(/\s+/).filter(Boolean).length;

  return (
    <div className="relative rounded-md border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-slate-50 p-2">
        <EditorTool label="Paragraph" onClick={() => command("formatBlock", "p")}><Pilcrow size={15} /></EditorTool>
        <EditorTool label="Heading 1" onClick={() => command("formatBlock", "h2")}><Heading1 size={15} /></EditorTool>
        <EditorTool label="Heading 2" onClick={() => command("formatBlock", "h3")}><Heading2 size={15} /></EditorTool>
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <EditorTool label="Bold" onClick={() => command("bold")}><Bold size={15} /></EditorTool>
        <EditorTool label="Italic" onClick={() => command("italic")}><Italic size={15} /></EditorTool>
        <EditorTool label="Quote" onClick={() => command("formatBlock", "blockquote")}><Quote size={15} /></EditorTool>
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <EditorTool label="Bulleted list" onClick={() => command("insertUnorderedList")}><List size={15} /></EditorTool>
        <EditorTool label="Numbered list" onClick={() => command("insertOrderedList")}><ListOrdered size={15} /></EditorTool>
        {!compact ? (
          <>
            <span className="mx-1 h-6 w-px bg-slate-200" />
            <EditorTool label="Procedure block" onClick={() => insertHtml(procedureBlock())}><Wand2 size={15} /><span>Procedure</span></EditorTool>
            <EditorTool label="Warning block" onClick={() => insertHtml(calloutBlock("warning"))}><AlertTriangle size={15} /><span>Warning</span></EditorTool>
            <EditorTool label="Table" onClick={() => insertHtml(tableBlock())}><Table2 size={15} /><span>Table</span></EditorTool>
            <EditorTool label="Code block" onClick={() => setCodeDraft((draft) => ({ ...draft, open: true }))}><Code2 size={15} /><span>Code</span></EditorTool>
            <EditorTool label="Mermaid diagram" onClick={() => setCodeDraft({ open: true, language: "mermaid", code: "flowchart TD\n  Start[Start] --> Decision{Decision}\n  Decision -->|Yes| Done[Done]\n  Decision -->|No| Start" })}><Wand2 size={15} /><span>Diagram</span></EditorTool>
            <EditorTool label="Code tabs" onClick={() => insertHtml(codeTabsBlock())}><Code2 size={15} /><span>Tabs</span></EditorTool>
            <EditorTool label="Upload image" onClick={() => imageInputRef.current?.click()}><ImageIcon size={15} /><span>Image</span></EditorTool>
            <EditorTool label="Embed video" onClick={() => setVideoDraft({ open: true, url: "" })}><Video size={15} /><span>Video</span></EditorTool>
          </>
        ) : null}
        {!compact ? <span className="ml-auto px-2 text-xs font-medium text-slate-500">{uploadingMedia ? "Uploading..." : `${wordCount} words`}</span> : null}
      </div>
      {mediaError ? <div className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{mediaError}</div> : null}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleImageSelection(event.target.files?.[0])} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => handleVideoSelection(event.target.files?.[0])} />
      {!compact && selectedMediaElement ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2 text-xs font-medium text-slate-600">
          <span>Media width</span>
          <input
            type="range"
            min={30}
            max={100}
            step={5}
            value={mediaWidth}
            onChange={(event) => resizeSelectedMedia(Number(event.target.value))}
            className="w-44"
          />
          <span>{mediaWidth}%</span>
        </div>
      ) : null}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={sync}
        onBlur={sync}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onMouseUp={updateSelectionAction}
        onPaste={handlePaste}
        onClick={handleEditorClick}
        className={`manual-editor-surface manual-content relative px-4 py-3 text-sm leading-7 outline-none focus:bg-white ${compact ? "min-h-[130px]" : "min-h-[520px]"}`}
      />
      {selectionAction ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={startInlineComment}
          className="absolute z-30 inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white shadow-lg transition-all duration-200 ease-in-out hover:scale-[1.02] hover:bg-emerald-700"
          style={{ left: selectionAction.left, top: selectionAction.top, transform: "translateX(-50%)" }}
          title={selectionAction.quote}
        >
          <MessageSquarePlus size={14} /> Comment
        </button>
      ) : null}
      {!compact && pinnedComments.length ? (
        <div className="border-t border-line bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {pinnedComments.slice(0, 4).map((comment) => (
              <button
                key={comment.id}
                type="button"
                onClick={() => {
                  const anchor = editorRef.current?.querySelector<HTMLElement>(`[data-comment-anchor="${comment.sectionAnchor}"]`);
                  anchor?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 transition-all duration-200 ease-in-out hover:border-amber-300 hover:bg-amber-100"
              >
                <MessageSquarePlus size={12} />
                <span className="truncate">{comment.sectionAnchor}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {inlineCommentDraft ? (
        <div className="border-t border-line bg-white p-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-950">Pinned inline comment</p>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-amber-800">&quot;{inlineCommentDraft.quote}&quot;</p>
              </div>
              <select
                value={inlineCommentDraft.kind}
                onChange={(event) => onInlineCommentDraft?.({ ...inlineCommentDraft, kind: event.target.value as PageCommentKind })}
                className="h-9 rounded-md border border-amber-200 bg-white px-2 text-xs font-semibold text-amber-950"
              >
                <option value="comment">Comment</option>
                <option value="reviewer_note">Reviewer note</option>
                <option value="change_request">Change request</option>
              </select>
            </div>
            <textarea
              id="inline-comment-body"
              value={inlineCommentDraft.body}
              onChange={(event) => onInlineCommentDraft?.({ ...inlineCommentDraft, body: event.target.value })}
              placeholder="Write a pinned note..."
              className="mt-3 min-h-20 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onCancelInlineComment}>Cancel</Button>
              <Button type="button" onClick={() => onCreateInlineComment?.(inlineCommentDraft)} disabled={!inlineCommentDraft.body.trim()}>Pin comment</Button>
            </div>
          </div>
        </div>
      ) : null}
      {slashQuery !== null && visibleSlashCommands.length ? (
        <div className="absolute left-3 top-14 z-20 w-[min(22rem,calc(100%-1.5rem))] overflow-hidden rounded-lg border border-line bg-white shadow-xl">
          <div className="border-b border-line px-3 py-2 text-xs font-semibold text-slate-500">Insert block</div>
          <div className="max-h-72 overflow-y-auto p-1">
            {visibleSlashCommands.map((command, index) => (
              <button
                key={command.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  applySlashCommand(command);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${index === slashIndex ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                <span className="font-semibold">{command.label}</span>
                <span className={`text-xs ${index === slashIndex ? "text-slate-200" : "text-slate-500"}`}>{command.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {imageDraft ? (
        <ImageCropDialog
          draft={imageDraft}
          uploading={uploadingMedia}
          onChange={(next) => setImageDraft((current) => current ? { ...current, ...next } : current)}
          onCancel={() => {
            URL.revokeObjectURL(imageDraft.url);
            setImageDraft(null);
            if (imageInputRef.current) imageInputRef.current.value = "";
          }}
          onInsert={cropAndInsertImage}
        />
      ) : null}
      {codeDraft.open ? (
        <EditorDialog title="Insert code block" onCancel={() => setCodeDraft({ open: false, language: "typescript", code: "" })}>
          <div className="grid gap-3">
            <label className="text-sm font-medium text-slate-700">
              Language
              <input value={codeDraft.language} onChange={(event) => setCodeDraft((draft) => ({ ...draft, language: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="typescript" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Code
              <textarea value={codeDraft.code} onChange={(event) => setCodeDraft((draft) => ({ ...draft, code: event.target.value }))} className="mt-1 min-h-64 w-full rounded-md border border-line bg-slate-950 px-3 py-2 font-mono text-sm text-slate-50" />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCodeDraft({ open: false, language: "typescript", code: "" })}>Cancel</Button>
              <Button type="button" onClick={insertCodeBlock} disabled={!codeDraft.code.trim()}>Insert code</Button>
            </div>
          </div>
        </EditorDialog>
      ) : null}
      {videoDraft.open ? (
        <EditorDialog title="Embed video" onCancel={() => setVideoDraft({ open: false, url: "" })}>
          <div className="grid gap-3">
            <label className="text-sm font-medium text-slate-700">
              Video URL
              <input value={videoDraft.url} onChange={(event) => setVideoDraft((draft) => ({ ...draft, url: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="YouTube, Vimeo, or direct MP4/WebM URL" />
            </label>
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="secondary" onClick={() => videoInputRef.current?.click()} disabled={uploadingMedia}>
                <Upload size={16} /> Upload video
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setVideoDraft({ open: false, url: "" })}>Cancel</Button>
                <Button type="button" onClick={insertVideoEmbed} disabled={!videoEmbedUrl(videoDraft.url)}>Embed</Button>
              </div>
            </div>
          </div>
        </EditorDialog>
      ) : null}
    </div>
  );
}

function EditorTool({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 hover:bg-white hover:text-slate-950"
    >
      {children}
    </button>
  );
}

function EditorDialog({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ImageCropDialog({
  draft,
  uploading,
  onChange,
  onCancel,
  onInsert
}: {
  draft: { file: File; url: string; zoom: number; x: number; y: number; ratio: string };
  uploading: boolean;
  onChange: (next: Partial<{ zoom: number; x: number; y: number; ratio: string }>) => void;
  onCancel: () => void;
  onInsert: () => void;
}) {
  const [width, height] = cropDimensions(draft.ratio);

  return (
    <EditorDialog title="Crop image" onCancel={onCancel}>
      <div className="grid gap-4">
        <div className="overflow-hidden rounded-lg border border-line bg-slate-950 p-4">
          <div
            className="mx-auto overflow-hidden rounded-md bg-slate-900"
            style={{ width: "min(100%, 560px)", aspectRatio: `${width} / ${height}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draft.url}
              alt=""
              className="h-full w-full select-none object-cover"
              style={{ objectPosition: `${draft.x}% ${draft.y}%`, transform: `scale(${draft.zoom})` }}
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Crop ratio
            <select value={draft.ratio} onChange={(event) => onChange({ ratio: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm">
              <option value="16:9">16:9 landscape</option>
              <option value="4:3">4:3 standard</option>
              <option value="1:1">1:1 square</option>
              <option value="3:4">3:4 portrait</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Zoom
            <input type="range" min={1} max={3} step={0.05} value={draft.zoom} onChange={(event) => onChange({ zoom: Number(event.target.value) })} className="mt-3 w-full" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Horizontal crop
            <input type="range" min={0} max={100} step={1} value={draft.x} onChange={(event) => onChange({ x: Number(event.target.value) })} className="mt-3 w-full" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Vertical crop
            <input type="range" min={0} max={100} step={1} value={draft.y} onChange={(event) => onChange({ y: Number(event.target.value) })} className="mt-3 w-full" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={onInsert} disabled={uploading}>{uploading ? <Loader2 className="animate-spin" size={16} /> : <ImageIcon size={16} />} Insert image</Button>
        </div>
      </div>
    </EditorDialog>
  );
}

async function cropImageFile(draft: { file: File; url: string; zoom: number; x: number; y: number; ratio: string }) {
  const image = await loadImage(draft.url);
  const [ratioWidth, ratioHeight] = cropDimensions(draft.ratio);
  const outputWidth = 1600;
  const outputHeight = Math.round(outputWidth * ratioHeight / ratioWidth);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) return draft.file;

  const scale = Math.max(outputWidth / image.naturalWidth, outputHeight / image.naturalHeight) * draft.zoom;
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  const maxOffsetX = Math.max(0, drawnWidth - outputWidth);
  const maxOffsetY = Math.max(0, drawnHeight - outputHeight);
  const offsetX = -maxOffsetX * (draft.x / 100);
  const offsetY = -maxOffsetY * (draft.y / 100);

  context.drawImage(image, offsetX, offsetY, drawnWidth, drawnHeight);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, draft.file.type || "image/jpeg", 0.9));
  if (!blob) return draft.file;
  return new File([blob], draft.file.name.replace(/(\.[^.]+)?$/, "-cropped$1"), { type: blob.type });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function fileFromDataUrl(dataUrl: string, fallbackName: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const extension = blob.type.split("/")[1]?.split("+")[0] || "png";
  const baseName = fallbackName.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "pasted-image";
  return new File([blob], `${baseName}.${extension}`, { type: blob.type || "image/png" });
}

function cropDimensions(ratio: string) {
  switch (ratio) {
    case "4:3":
      return [4, 3];
    case "1:1":
      return [1, 1];
    case "3:4":
      return [3, 4];
    default:
      return [16, 9];
  }
}

function procedureBlock() {
  return [
    "<h2>Purpose</h2>",
    "<p>Define the outcome this page helps the reader complete.</p>",
    "<h2>Procedure</h2>",
    "<ol><li>Prepare the required access, tools, and information.</li><li>Complete the first operating step.</li><li>Verify the expected result before moving on.</li></ol>",
    "<h2>Verification</h2>",
    "<ul><li>Record the result, owner, and timestamp.</li><li>Escalate any exception through the documented channel.</li></ul>"
  ].join("");
}

function calloutBlock(kind: "note" | "warning" = "note") {
  if (kind === "warning") {
    return '<div class="manual-callout manual-callout-warning"><strong>Warning</strong><p>Add a risk, prerequisite, exception, or decision rule.</p></div>';
  }
  return '<div class="manual-callout"><strong>Note</strong><p>Add an exception, risk, prerequisite, or decision rule.</p></div>';
}

function codeTabsBlock() {
  return [
    '<div class="manual-code-tabs">',
    "<details open><summary>Node.js</summary><pre data-language=\"bash\"><code>npm run dev</code></pre></details>",
    "<details><summary>PHP</summary><pre data-language=\"bash\"><code>php artisan serve</code></pre></details>",
    "</div>"
  ].join("");
}

function tableBlock() {
  return "<table><thead><tr><th>Item</th><th>Owner</th><th>Standard</th></tr></thead><tbody><tr><td>Requirement</td><td>Team</td><td>Expected result</td></tr></tbody></table>";
}

function escapeEditorText(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char] ?? char));
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
