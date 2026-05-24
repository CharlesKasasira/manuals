"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronLeft, ChevronRight, Copy, FileDown, Printer, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { headingsFromMarkdown, headingsFromRichHtml, htmlToText, pageMarkdown, pageRichHtml, richHtmlWithHeadingIds, slugify } from "@/lib/manual-content";
import { Manual, ManualPage } from "@/lib/types";
import { formatDate, humanizeStatus } from "@/lib/utils";
import { ManualShareActions } from "./manual-share-actions";

function flatten(pages: ManualPage[] = []): ManualPage[] {
  return pages.flatMap((page) => [page, ...flatten(page.children ?? [])]);
}

function pageText(page: ManualPage) {
  return [page.title, htmlToText(pageRichHtml(page)), pageMarkdown(page)].filter(Boolean).join(" ");
}

function copyCurrentUrlWithHash(hash: string) {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}${window.location.pathname}${hash}`;
  void navigator.clipboard?.writeText(url);
}

function PageSection({ page, onCopy }: { page: ManualPage; onCopy: (hash: string, label: string) => void }) {
  const richHtml = pageRichHtml(page);
  const markdown = pageMarkdown(page) || "_No content yet._";
  const headingComponents = {
    h1: ({ children }: { children?: React.ReactNode }) => <h2 id={`${page.slug}-${slugify(children)}`}>{children}</h2>,
    h2: ({ children }: { children?: React.ReactNode }) => <h3 id={`${page.slug}-${slugify(children)}`}>{children}</h3>,
    h3: ({ children }: { children?: React.ReactNode }) => <h4 id={`${page.slug}-${slugify(children)}`}>{children}</h4>
  };

  return (
    <section id={`page-${page.slug}`} className="scroll-mt-24 border-b border-line last:border-b-0">
      <div className="flex items-start justify-between gap-4 border-b border-line bg-slate-50 px-6 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Page</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">{page.title}</h2>
        </div>
        <button
          type="button"
          onClick={() => onCopy(`#page-${page.slug}`, "Page link copied.")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
          title="Copy page link"
          aria-label={`Copy link to ${page.title}`}
        >
          <Copy size={15} />
        </button>
      </div>
      <div className="manual-content p-6">
        {richHtml ? (
          <div dangerouslySetInnerHTML={{ __html: richHtmlWithHeadingIds(richHtml, page.slug) }} />
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={headingComponents}>{markdown}</ReactMarkdown>
        )}
      </div>
    </section>
  );
}

export function ReaderLayout({ manual, app = false }: { manual: Manual; app?: boolean }) {
  const [query, setQuery] = useState("");
  const [activePageSlug, setActivePageSlug] = useState("");
  const [progress, setProgress] = useState(0);
  const [copyMessage, setCopyMessage] = useState("");
  const pages = useMemo(() => flatten(manual.tableOfContents ?? manual.pages ?? []), [manual.pages, manual.tableOfContents]);
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePages = useMemo(() => {
    if (!normalizedQuery) return pages;
    return pages.filter((page) => pageText(page).toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, pages]);
  const pageHeadings = pages.flatMap((page) => {
    const richHtml = pageRichHtml(page);
    const headings = richHtml ? headingsFromRichHtml(richHtml) : headingsFromMarkdown(pageMarkdown(page));
    return headings.map((heading) => ({ ...heading, pageSlug: page.slug, pageTitle: page.title }));
  });
  const readerHref = app ? `/app/manuals/${manual.slug}/reader` : `/manuals/${manual.slug}`;
  const signals = manual.knowledgeSignals;
  const readingMinutes = signals?.readingTimeMinutes ?? Math.max(1, Math.ceil(pages.reduce((total, page) => total + pageText(page).split(/\s+/).filter(Boolean).length, 0) / 220));
  const activePageIndex = pages.findIndex((page) => page.slug === activePageSlug);
  const effectiveActivePageIndex = activePageIndex >= 0 ? activePageIndex : 0;
  const previousPage = effectiveActivePageIndex > 0 ? pages[effectiveActivePageIndex - 1] : null;
  const nextPage = effectiveActivePageIndex < pages.length - 1 ? pages[effectiveActivePageIndex + 1] : null;

  useEffect(() => {
    function updateProgress() {
      const scrollTop = window.scrollY;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(100, Math.max(0, Math.round((scrollTop / scrollable) * 100))) : 0);
    }

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  useEffect(() => {
    const sections = pages
      .map((page) => document.getElementById(`page-${page.slug}`))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return undefined;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const slug = visible?.target.id.replace(/^page-/, "");
      if (slug) setActivePageSlug(slug);
    }, { rootMargin: "-20% 0px -65% 0px", threshold: [0.05, 0.2, 0.5] });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [pages]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((event.key === "ArrowLeft" || event.key.toLowerCase() === "k") && previousPage) {
        document.getElementById(`page-${previousPage.slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if ((event.key === "ArrowRight" || event.key.toLowerCase() === "j") && nextPage) {
        document.getElementById(`page-${nextPage.slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextPage, previousPage]);

  function handleCopy(hash: string, label = "Section link copied.") {
    copyCurrentUrlWithHash(hash);
    setCopyMessage(label);
    window.setTimeout(() => setCopyMessage(""), 1800);
  }

  return (
    <div className="reader-shell grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)_250px]">
      <div className="fixed inset-x-0 top-0 z-40 h-1 bg-transparent print:hidden" aria-hidden="true">
        <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <aside className="hidden lg:block">
        <div className="reader-sidebar sticky top-24 rounded-lg border border-line bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Contents</p>
          <label className="mb-3 flex h-10 items-center gap-2 rounded-md border border-line bg-slate-50 px-3 text-sm text-slate-500">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              placeholder="Search manual"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-700" aria-label="Clear manual search">
                <X size={14} />
              </button>
            ) : null}
          </label>
          <nav className="space-y-1">
            {visiblePages.map((page) => (
              <Link key={page.id} href={`${readerHref}#page-${page.slug}`} className={`block rounded-md px-3 py-2 text-sm font-medium hover:bg-emerald-50 hover:text-emerald-800 ${activePageSlug === page.slug ? "bg-emerald-50 text-emerald-800" : "text-slate-700"}`}>
                {page.title}
              </Link>
            ))}
            {!visiblePages.length ? <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">No matching pages.</p> : null}
          </nav>
        </div>
      </aside>
      <article className="reader-article min-w-0 rounded-lg border border-line bg-white shadow-sm">
        <div className="border-b border-line p-6">
          <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500" aria-label="Breadcrumb">
            <Link href={app ? "/app/manuals" : "/manuals"} className="hover:text-emerald-700">Manuals</Link>
            <span>/</span>
            {manual.space?.name ? (
              <>
                <span>{manual.space.name}</span>
                <span>/</span>
              </>
            ) : null}
            <span className="font-semibold text-slate-800">{manual.title}</span>
          </nav>
          <div className="flex flex-wrap gap-2">
            <Badge value={manual.status} />
            <Badge value={manual.visibility} />
            <span className="rounded-full border border-line bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">v{manual.version}</span>
            <span className="rounded-full border border-line bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">{readingMinutes} min read</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{manual.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{manual.description}</p>
          <div className="reader-actions mt-5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              <Printer size={16} /> Print
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              <FileDown size={16} /> PDF
            </button>
            <button type="button" disabled={!previousPage} onClick={() => previousPage && document.getElementById(`page-${previousPage.slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft size={16} /> Previous
            </button>
            <button type="button" disabled={!nextPage} onClick={() => nextPage && document.getElementById(`page-${nextPage.slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
              Next <ChevronRight size={16} />
            </button>
            {copyMessage ? <span className="text-sm font-semibold text-emerald-700">{copyMessage}</span> : null}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Owner</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{manual.owner?.name || "-"}</p>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Last updated</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(manual.updatedAt)}</p>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Space</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{manual.space?.name || "-"}</p>
            </div>
          </div>
          {signals ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-line bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Pages</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{signals.pageCount}</p>
              </div>
              <div className="rounded-lg border border-line bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Reading time</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{readingMinutes} min</p>
              </div>
              <div className="rounded-lg border border-line bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Quality</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{signals.qualityScore}%</p>
              </div>
              <div className="rounded-lg border border-line bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Review</p>
                <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{humanizeStatus(signals.reviewDueStatus)}</p>
              </div>
            </div>
          ) : null}
          <div className="mt-4 xl:hidden">
            <ManualShareActions manualId={manual.id} />
          </div>
        </div>
        {visiblePages.length ? visiblePages.map((page) => <PageSection key={page.id} page={page} onCopy={handleCopy} />) : pages.length ? (
          <div className="manual-content p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>No pages match the current search.</ReactMarkdown>
          </div>
        ) : (
          <div className="manual-content p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}># No content yet</ReactMarkdown>
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-5 text-sm text-slate-600">
          <span>Last updated {formatDate(manual.updatedAt)}</span>
          <span>Version {manual.version}</span>
        </footer>
      </article>
      <aside className="hidden xl:block">
        <div className="reader-sidebar sticky top-24 space-y-4">
          <ManualShareActions manualId={manual.id} />
          <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-sky-700">On this page</p>
            <nav className="space-y-1">
              {pageHeadings.slice(0, 24).map((heading) => (
                <div key={`${heading.pageSlug}-${heading.id}`} className="group flex items-center gap-1 rounded-md hover:bg-slate-100">
                  <a href={`#${heading.pageSlug}-${heading.id}`} className="min-w-0 flex-1 px-3 py-2 text-sm text-slate-600">
                    {heading.title}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy(`#${heading.pageSlug}-${heading.id}`)}
                    className="mr-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-700 group-hover:inline-flex"
                    title="Copy section link"
                    aria-label={`Copy link to ${heading.title}`}
                  >
                    <Copy size={13} />
                  </button>
                </div>
              ))}
            </nav>
          </div>
        </div>
      </aside>
    </div>
  );
}
