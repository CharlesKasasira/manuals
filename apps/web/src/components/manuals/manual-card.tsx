import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, BookOpen, Eye, FileText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Manual } from "@/lib/types";
import { formatDate, humanizeStatus } from "@/lib/utils";

type ManualHrefPrefix = "/manuals" | "/app/manuals";

export function ManualCard({ manual, hrefPrefix = "/manuals" }: { manual: Manual; hrefPrefix?: ManualHrefPrefix }) {
  const signals = manual.knowledgeSignals;
  const pageCount = signals?.pageCount ?? manual.pages?.length ?? 0;

  return (
    <Link href={`${hrefPrefix}/${manual.slug}` as Route}>
      <Card className="transition hover:border-emerald-400 hover:shadow-soft">
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge value={manual.status} />
              <Badge value={manual.visibility} />
              {manual.space?.name ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">{manual.space.name}</span> : null}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-950">{manual.title}</h3>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{manual.description || "No description provided."}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-1"><FileText size={14} />{pageCount} pages</span>
              <span className="inline-flex items-center gap-1"><BookOpen size={14} />{signals?.readingTimeMinutes ?? 1} min read</span>
              <span className="inline-flex items-center gap-1"><Eye size={14} />{manual.viewCount ?? 0} views</span>
              <span>Updated {formatDate(manual.updatedAt)}</span>
            </div>
            {signals ? (
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                {typeof signals.qualityScore === "number" ? (
                  <div className="rounded-md border border-line bg-slate-50 px-3 py-2 text-slate-600">
                    <span className="font-semibold text-slate-900">{signals.qualityScore}%</span> quality score
                  </div>
                ) : null}
                <div className="inline-flex items-center gap-1 rounded-md border border-line bg-slate-50 px-3 py-2 text-slate-600">
                  <ShieldCheck size={14} />
                  <span className="font-semibold text-slate-900 capitalize">{humanizeStatus(signals.reviewDueStatus)}</span>
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-1.5">
                {(manual.tags ?? []).slice(0, 3).map((tag) => (
                  <span key={tag.id} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">#{tag.name}</span>
                ))}
              </div>
              <ArrowRight size={17} className="text-slate-400" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
