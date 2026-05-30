"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  CloudUpload,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Link2,
  Loader2,
  ShieldCheck,
  Upload,
  Users,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { API_URL, api, getToken } from "@/lib/api";
import { AdminManagementPanel } from "./admin-management-panel";
import type { Asset, AssetUsage, AuditLog, Manual, ManualAnalytics, ReviewRequest } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-line bg-slate-50 p-5 text-sm text-slate-500">{children}</div>;
}

function ErrorState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{children}</div>;
}

function formatBytes(value = 0) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function DashboardPanel() {
  const manuals = useQuery({ queryKey: ["dashboard", "manuals"], queryFn: async () => (await api<{ data: Manual[] }>("/manuals")).data, retry: false });
  const reviews = useQuery({ queryKey: ["dashboard", "reviews"], queryFn: async () => (await api<{ data: ReviewRequest[] }>("/reviews")).data, retry: false });
  const audit = useQuery({ queryKey: ["dashboard", "audit"], queryFn: async () => (await api<{ data: AuditLog[] }>("/audit-logs")).data, retry: false });

  const manualData = manuals.data ?? [];
  const reviewData = reviews.data ?? [];
  const published = manualData.filter((manual) => manual.status === "published").length;
  const drafts = manualData.filter((manual) => manual.status === "draft").length;
  const views = manualData.reduce((total, manual) => total + (manual.viewCount ?? 0), 0);
  const pendingReviews = reviewData.filter((review) => review.decision === "submitted").slice(0, 5);
  const recentManuals = [...manualData].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);

  const stats: Array<{ label: string; value: string; icon: typeof BookOpen; href: Route; action: string }> = [
    { label: "Published manuals", value: String(published), icon: BookOpen, href: "/app/manuals?status=published" as Route, action: "View published" },
    { label: "Drafts in progress", value: String(drafts), icon: ClipboardCheck, href: "/app/manuals?status=draft" as Route, action: "View drafts" },
    { label: "Manual views", value: String(views), icon: Eye, href: "/app/analytics", action: "Open analytics" },
    { label: "Audit events", value: audit.data ? String(audit.data.length) : "Restricted", icon: ShieldCheck, href: "/app/admin?tab=audit" as Route, action: "View audit" }
  ];

  if (manuals.isLoading) return <EmptyState>Loading dashboard data...</EmptyState>;
  if (manuals.isError) return <ErrorState>Sign in or start the API to load dashboard data.</ErrorState>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">A focused overview of manuals that need attention.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <DashboardStatCard key={stat.label} {...stat} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader><div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Activity size={17} />Operating queue</div></CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              <QueueList title="Pending reviews" items={pendingReviews.map((review) => ({
                href: review.manual?.slug ? `/app/manuals/${review.manual.slug}` as Route : undefined,
                title: review.manual?.title ?? "Untitled manual",
                meta: `${review.requestedBy?.name ?? "Unknown"} / ${formatDate(review.createdAt)}`
              }))} />
              <QueueList title="Recently updated" items={recentManuals.map((manual) => ({
                href: `/app/manuals/${manual.slug}` as Route,
                title: manual.title,
                meta: `${manual.status.replaceAll("_", " ")} / ${formatDate(manual.updatedAt)}`
              }))} />
            </div>
          </CardContent>
        </Card>
        <Card id="recent-audit">
          <CardHeader><div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><ShieldCheck size={17} />Recent audit</div></CardHeader>
          <CardContent>
            {audit.data ? <AuditList logs={audit.data.slice(0, 5)} /> : <EmptyState>Audit logs are available to admins.</EmptyState>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardStatCard({ label, value, icon: Icon, href, action }: { label: string; value: string; icon: typeof BookOpen; href: Route; action: string }) {
  return (
    <Link href={href} className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
      <Card className="h-full transition duration-200 group-hover:-translate-y-0.5 group-hover:border-emerald-300 group-hover:shadow-soft">
        <CardContent className="flex min-h-28 items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              {action} <ArrowUpRight size={13} />
            </span>
          </div>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 transition group-hover:bg-emerald-100"><Icon size={20} /></span>
        </CardContent>
      </Card>
    </Link>
  );
}

function QueueList({ title, items }: { title: string; items: Array<{ title: string; meta: string; href?: Route }> }) {
  return (
    <div className="rounded-lg border border-line bg-slate-50 p-4">
      <p className="font-semibold text-slate-900">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => (
          item.href ? (
            <Link key={`${item.title}-${item.meta}`} href={item.href} className="block rounded-md bg-white p-3 text-sm hover:bg-emerald-50">
              <span className="font-semibold text-slate-900">{item.title}</span>
              <span className="mt-1 block text-xs text-slate-500">{item.meta}</span>
            </Link>
          ) : (
            <div key={`${item.title}-${item.meta}`} className="rounded-md bg-white p-3 text-sm">
              <p className="font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
            </div>
          )
        )) : <p className="text-sm text-slate-500">No items in this queue.</p>}
      </div>
    </div>
  );
}

export function ReviewsPanel() {
  const reviews = useQuery({ queryKey: ["reviews"], queryFn: async () => (await api<{ data: ReviewRequest[] }>("/reviews")).data, retry: false });
  const data = reviews.data ?? [];
  const submitted = data.filter((review) => review.decision === "submitted").length;

  if (reviews.isLoading) return <EmptyState>Loading review requests...</EmptyState>;
  if (reviews.isError) return <ErrorState>Sign in or start the API to load review requests.</ErrorState>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Reviews</h1>
          <p className="mt-1 text-sm text-slate-600">{submitted} requests are waiting for a decision.</p>
        </div>
        <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-slate-700">{data.length} total requests</span>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-line">
            {data.length ? data.map((review) => (
              <div key={review.id} className="grid gap-3 p-5 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto] lg:items-center">
                <div>
                  <Link href={(review.manual?.slug ? `/app/manuals/${review.manual.slug}` : "/app/manuals") as Route} className="font-semibold text-slate-950 hover:text-emerald-700">
                    {review.manual?.title ?? "Untitled manual"}
                  </Link>
                  <p className="mt-1 text-sm text-slate-500">{review.comment || "No review comment."}</p>
                </div>
                <div className="text-sm text-slate-600">{review.requestedBy?.name ?? "Unknown requester"}</div>
                <div className="text-sm text-slate-500">{formatDate(review.createdAt)}</div>
                <Badge value={review.decision} />
              </div>
            )) : <EmptyState>No review requests found.</EmptyState>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AssetsPanel() {
  const [visibility, setVisibility] = useState("internal");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<{ asset: Asset; url: string; mimeType: string } | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [usageDialog, setUsageDialog] = useState<{ asset: Asset; usages: AssetUsage[] } | null>(null);
  const [usageLoadingId, setUsageLoadingId] = useState<string | null>(null);
  const [usageError, setUsageError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const assets = useQuery({ queryKey: ["assets"], queryFn: async () => (await api<{ data: Asset[] }>("/assets")).data, retry: false });
  const data = assets.data ?? [];
  const totalBytes = data.reduce((sum, asset) => sum + (asset.sizeBytes ?? 0), 0);

  useEffect(() => {
    return () => {
      if (preview) window.URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  function chooseFile() {
    fileInputRef.current?.click();
  }

  function handleSelectedFile(file?: File | null) {
    setSelectedFile(file ?? null);
    setMessage("");
  }

  function clearSelectedFile(event?: React.MouseEvent<HTMLButtonElement>) {
    event?.stopPropagation();
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleSelectedFile(event.dataTransfer.files?.[0]);
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
    const file = selectedFile ?? input?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    setMessage("");
    try {
      await api(`/assets?visibility=${visibility}`, { method: "POST", body: formData });
      if (input) input.value = "";
      setSelectedFile(null);
      await assets.refetch();
      setMessage("Asset uploaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    const ok = window.confirm("Delete this asset?");
    if (!ok) return;
    await api(`/assets/${id}`, { method: "DELETE" });
    await assets.refetch();
  }

  async function download(asset: Asset) {
    const token = getToken();
    const response = await fetch(`${API_URL}/assets/${asset.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) throw new Error("Download failed.");
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = asset.fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  function closePreview() {
    if (preview) window.URL.revokeObjectURL(preview.url);
    setPreview(null);
    setPreviewError("");
  }

  async function viewAsset(asset: Asset) {
    if (preview) window.URL.revokeObjectURL(preview.url);
    setPreview(null);
    setPreviewError("");
    setPreviewLoadingId(asset.id);
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/assets/${asset.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (!response.ok) throw new Error("Preview failed.");
      const blob = await response.blob();
      const mimeType = response.headers.get("Content-Type") || asset.mimeType || blob.type || "application/octet-stream";
      setPreview({ asset, url: window.URL.createObjectURL(blob), mimeType });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Preview failed.");
    } finally {
      setPreviewLoadingId(null);
    }
  }

  async function viewUsages(asset: Asset) {
    setUsageDialog(null);
    setUsageError("");
    setUsageLoadingId(asset.id);
    try {
      const response = await api<{ data: AssetUsage[] }>(`/assets/${asset.id}/usages`);
      setUsageDialog({ asset, usages: response.data });
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : "Could not load asset usage.");
    } finally {
      setUsageLoadingId(null);
    }
  }

  if (assets.isLoading) return <EmptyState>Loading assets...</EmptyState>;
  if (assets.isError) return <ErrorState>Sign in or start the API to load assets.</ErrorState>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Assets</h1>
        <p className="mt-1 text-sm text-slate-600">{data.length} reusable files using {formatBytes(totalBytes)}.</p>
      </div>
      <Card>
        <CardHeader><div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Upload size={17} />Upload asset</div></CardHeader>
        <CardContent>
          <form onSubmit={upload} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
            <input
              ref={fileInputRef}
              name="file"
              type="file"
              className="sr-only"
              onChange={(event) => handleSelectedFile(event.target.files?.[0])}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={chooseFile}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  chooseFile();
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "group grid min-h-36 cursor-pointer gap-4 rounded-lg border border-dashed border-line bg-slate-50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/50 focus:outline-none focus:ring-2 focus:ring-slate-300 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center",
                isDragging && "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100"
              )}
            >
              <span className="flex size-14 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700 shadow-sm">
                {selectedFile ? <CheckCircle2 size={24} /> : <CloudUpload size={25} />}
              </span>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-950">
                  {selectedFile ? selectedFile.name : "Drop a file here or browse your computer"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedFile
                    ? `${selectedFile.type || "Unknown file type"} / ${formatBytes(selectedFile.size)}`
                    : "Manual PDFs, policy documents, templates, images, and supporting files."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {selectedFile ? (
                  <button
                    type="button"
                    onClick={clearSelectedFile}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    aria-label="Remove selected file"
                  >
                    <X size={16} /> Remove
                  </button>
                ) : null}
                <span className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition group-hover:bg-slate-800">
                  <FolderOpen size={16} /> Browse
                </span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-1 xl:content-start">
              <select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="h-10 rounded-md border border-line bg-white px-3 text-sm">
                <option value="internal">Internal</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="restricted">Restricted</option>
              </select>
              <Button disabled={uploading || !selectedFile} className="w-full">
                {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />} Upload
              </Button>
            </div>
          </form>
          {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-line">
            {data.length ? data.map((asset) => (
              <div key={asset.id} className="grid gap-3 p-5 lg:grid-cols-[minmax(0,1fr)_110px_120px_120px_130px_120px_auto] lg:items-center">
                <div>
                  <p className="font-semibold text-slate-950">{asset.fileName}</p>
                  <p className="mt-1 text-sm text-slate-500">{asset.mimeType || asset.kind} / {asset.uploadedBy?.name ?? "Unknown uploader"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => viewUsages(asset)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {usageLoadingId === asset.id ? <Loader2 className="animate-spin" size={15} /> : <Link2 size={15} />}
                  {asset.usages?.length ?? 0}
                </button>
                <Badge value={asset.visibility} />
                <Badge value={asset.scanStatus ?? "pending"} />
                <span className="text-sm text-slate-600">{formatBytes(asset.sizeBytes ?? 0)}</span>
                <span className="text-sm text-slate-500">{formatDate(asset.createdAt)}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => viewAsset(asset)} disabled={previewLoadingId === asset.id}>
                    {previewLoadingId === asset.id ? <Loader2 className="animate-spin" size={16} /> : <Eye size={16} />} View
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => download(asset)}><Download size={16} /></Button>
                  <Button type="button" variant="danger" onClick={() => remove(asset.id)}>Delete</Button>
                </div>
              </div>
            )) : <EmptyState>No assets uploaded yet.</EmptyState>}
          </div>
        </CardContent>
      </Card>
      {previewError ? <ErrorState>{previewError}</ErrorState> : null}
      {usageError ? <ErrorState>{usageError}</ErrorState> : null}
      {usageDialog ? <AssetUsageDialog asset={usageDialog.asset} usages={usageDialog.usages} onClose={() => setUsageDialog(null)} /> : null}
      {preview ? <AssetPreviewDialog preview={preview} onClose={closePreview} onDownload={() => download(preview.asset)} /> : null}
    </div>
  );
}

function AssetUsageDialog({ asset, usages, onClose }: { asset: Asset; usages: AssetUsage[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label={`Where ${asset.fileName} is used`}>
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-950">Used in</h2>
            <p className="mt-1 truncate text-sm text-slate-500">{asset.fileName}</p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose} aria-label="Close usage dialog"><X size={18} /></Button>
        </div>
        <div className="overflow-y-auto p-4">
          {usages.length ? (
            <div className="space-y-3">
              {usages.map((usage) => {
                const manualHref = usage.manual?.slug ? `/app/manuals/${usage.manual.slug}/reader${usage.page?.slug ? `#page-${usage.page.slug}` : ""}` : null;
                return (
                  <div key={usage.id} className="rounded-lg border border-line bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{usage.manual?.title ?? "Unlinked manual"}</p>
                        <p className="mt-1 text-sm text-slate-500">{usage.page?.title ? `Page: ${usage.page.title}` : "Manual-level reference"}</p>
                        {usage.context ? <p className="mt-2 line-clamp-2 text-xs text-slate-500">{usage.context}</p> : null}
                      </div>
                      {manualHref ? (
                        <Link href={manualHref as Route} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                          Open <ArrowUpRight size={15} />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState>This asset is not linked to any manual pages yet.</EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetPreviewDialog({
  preview,
  onClose,
  onDownload
}: {
  preview: { asset: Asset; url: string; mimeType: string };
  onClose: () => void;
  onDownload: () => void;
}) {
  const isImage = preview.mimeType.startsWith("image/");
  const isVideo = preview.mimeType.startsWith("video/");
  const isPdf = preview.mimeType.includes("pdf");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label={`Preview ${preview.asset.fileName}`}>
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-950">{preview.asset.fileName}</h2>
            <p className="mt-1 text-sm text-slate-500">{preview.mimeType} / {formatBytes(preview.asset.sizeBytes ?? 0)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="secondary" onClick={onDownload}><Download size={16} />Download</Button>
            <Button type="button" variant="ghost" onClick={onClose} aria-label="Close preview"><X size={18} /></Button>
          </div>
        </div>
        <div className="grid min-h-[320px] flex-1 place-items-center bg-slate-100 p-4">
          {isImage ? (
            <div className="relative h-[70vh] w-full">
              <Image src={preview.url} alt={preview.asset.fileName} fill unoptimized className="rounded-md object-contain shadow-sm" />
            </div>
          ) : isVideo ? (
            <video src={preview.url} controls className="max-h-[70vh] max-w-full rounded-md bg-black" />
          ) : isPdf ? (
            <iframe src={preview.url} title={preview.asset.fileName} className="h-[70vh] w-full rounded-md border border-line bg-white" />
          ) : (
            <div className="max-w-md rounded-md border border-line bg-white p-5 text-center">
              <FileText className="mx-auto text-slate-500" size={32} />
              <p className="mt-3 text-sm font-semibold text-slate-950">Preview is not available for this file type.</p>
              <p className="mt-1 text-sm text-slate-500">You can still download the asset to open it with a compatible app.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPanel() {
  const manuals = useQuery({ queryKey: ["analytics", "manuals"], queryFn: async () => (await api<{ data: Manual[] }>("/manuals")).data, retry: false });
  const [selectedId, setSelectedId] = useState("");
  const manualData = manuals.data;

  useEffect(() => {
    if (!selectedId && manualData?.[0]?.id) setSelectedId(manualData[0].id);
  }, [manualData, selectedId]);

  const analytics = useQuery({
    queryKey: ["analytics", selectedId],
    queryFn: async () => (await api<{ data: ManualAnalytics }>(`/analytics/manuals/${selectedId}`)).data,
    enabled: Boolean(selectedId),
    retry: false
  });

  const selected = analytics.data;
  const helpfulRate = selected?.feedbackTotal ? Math.round((selected.helpful / selected.feedbackTotal) * 100) : 0;

  if (manuals.isLoading) return <EmptyState>Loading analytics...</EmptyState>;
  if (manuals.isError) return <ErrorState>Sign in or start the API to load analytics.</ErrorState>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Analytics</h1>
          <p className="mt-1 text-sm text-slate-600">Manual views, feedback, bookmarks, follows, status, and version.</p>
        </div>
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="h-10 min-w-72 rounded-md border border-line bg-white px-3 text-sm">
          {(manualData ?? []).map((manual) => <option key={manual.id} value={manual.id}>{manual.title}</option>)}
        </select>
      </div>
      {analytics.isError ? <ErrorState>You do not have access to analytics for this manual.</ErrorState> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Views" value={selected?.manual?.viewCount ?? 0} icon={Eye} />
        <Metric label="Feedback" value={selected?.feedbackTotal ?? 0} icon={ClipboardCheck} />
        <Metric label="Helpful" value={`${helpfulRate}%`} icon={BarChart3} />
        <Metric label="Bookmarks" value={selected?.bookmarks ?? 0} icon={BookOpen} />
        <Metric label="Follows" value={selected?.follows ?? 0} icon={Users} />
      </div>
      <Card>
        <CardHeader><div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><FileText size={17} />Manual performance</div></CardHeader>
        <CardContent>
          {selected?.manual ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{selected.manual.title}</p>
                <p className="mt-1 text-sm text-slate-500">Version {selected.manual.version}</p>
              </div>
              <Badge value={selected.manual.status} />
            </div>
          ) : <EmptyState>Select a manual to view analytics.</EmptyState>}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Eye }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
        </div>
        <span className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sky-700"><Icon size={20} /></span>
      </CardContent>
    </Card>
  );
}

export function AdminPanel() {
  return <AdminManagementPanel />;
}

function AuditList({ logs }: { logs: AuditLog[] }) {
  return (
    <div className="space-y-2">
      {logs.length ? logs.map((log) => (
        <div key={log.id} className="rounded-md border border-line p-3 text-sm">
          <p className="font-semibold text-slate-950">{log.event.replaceAll("_", " ")}</p>
          <p className="mt-1 text-xs text-slate-500">{log.actor?.name ?? "System"} / {formatDate(log.createdAt)}</p>
        </div>
      )) : <p className="text-sm text-slate-500">No audit events yet.</p>}
    </div>
  );
}
