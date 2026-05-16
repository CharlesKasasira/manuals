import Link from "next/link";
import type React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Manual, ManualPage } from "@/lib/types";
import { formatDate, humanizeStatus } from "@/lib/utils";
import { ManualShareActions } from "./manual-share-actions";

function flatten(pages: ManualPage[] = []): ManualPage[] {
  return pages.flatMap((page) => [page, ...flatten(page.children ?? [])]);
}

function headings(markdown = "") {
  return markdown.split(/\r?\n/).map((line) => /^(#{1,3})\s+(.+)$/.exec(line)).filter(Boolean).map((match: any) => ({
    level: match[1].length,
    title: match[2],
    id: slugify(match[2])
  }));
}

function slugify(value: React.ReactNode) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

function pageMarkdown(page?: ManualPage | null) {
  return page?.publishedMarkdown || page?.draftMarkdown || "";
}

function PageSection({ page }: { page: ManualPage }) {
  const markdown = pageMarkdown(page) || "_No content yet._";
  const headingComponents = {
    h1: ({ children }: { children?: React.ReactNode }) => <h2 id={`${page.slug}-${slugify(children)}`}>{children}</h2>,
    h2: ({ children }: { children?: React.ReactNode }) => <h3 id={`${page.slug}-${slugify(children)}`}>{children}</h3>,
    h3: ({ children }: { children?: React.ReactNode }) => <h4 id={`${page.slug}-${slugify(children)}`}>{children}</h4>
  };

  return (
    <section id={`page-${page.slug}`} className="scroll-mt-24 border-b border-line last:border-b-0">
      <div className="border-b border-line bg-slate-50 px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Page</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">{page.title}</h2>
      </div>
      <div className="manual-content p-6">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={headingComponents}>{markdown}</ReactMarkdown>
      </div>
    </section>
  );
}

export function ReaderLayout({ manual, app = false }: { manual: Manual; app?: boolean }) {
  const pages = flatten(manual.tableOfContents ?? manual.pages ?? []);
  const pageHeadings = pages.flatMap((page) => headings(pageMarkdown(page)).map((heading) => ({ ...heading, pageSlug: page.slug, pageTitle: page.title })));
  const prefix = app ? "/app/manuals" : "/manuals";
  const signals = manual.knowledgeSignals;

  return (
    <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)_250px]">
      <aside className="hidden lg:block">
        <div className="sticky top-24 rounded-lg border border-line bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Contents</p>
          <nav className="space-y-1">
            {pages.map((page) => (
              <Link key={page.id} href={`${prefix}/${manual.slug}#page-${page.slug}`} className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-800">
                {page.title}
              </Link>
            ))}
          </nav>
        </div>
      </aside>
      <article className="min-w-0 rounded-lg border border-line bg-white shadow-sm">
        <div className="border-b border-line p-6">
          <div className="flex flex-wrap gap-2">
            <Badge value={manual.status} />
            <Badge value={manual.visibility} />
            <span className="rounded-full border border-line bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">v{manual.version}</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{manual.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{manual.description}</p>
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
                <p className="mt-1 text-sm font-semibold text-slate-900">{signals.readingTimeMinutes} min</p>
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
        {pages.length ? pages.map((page) => <PageSection key={page.id} page={page} />) : (
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
        <div className="sticky top-24 space-y-4">
          <ManualShareActions manualId={manual.id} />
          <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-sky-700">On this page</p>
            <nav className="space-y-1">
              {pageHeadings.slice(0, 24).map((heading) => (
                <a key={`${heading.pageSlug}-${heading.id}`} href={`#${heading.pageSlug}-${heading.id}`} className="block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                  {heading.title}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </aside>
    </div>
  );
}
