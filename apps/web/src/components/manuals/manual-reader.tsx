"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import type { Manual } from "@/lib/types";
import { ReaderLayout } from "./reader-layout";

export function ManualReader({ slug }: { slug: string }) {
  const manualQuery = useQuery({
    queryKey: ["manual-reader", slug],
    queryFn: async () => (await api<{ data: Manual }>(`/manuals/${slug}`)).data,
    retry: false
  });

  if (manualQuery.isLoading) {
    return (
      <div className="rounded-lg border border-line bg-white p-8 text-sm text-slate-500">
        <Loader2 className="mr-2 inline animate-spin" size={16} />
        Loading manual reader...
      </div>
    );
  }

  if (manualQuery.isError || !manualQuery.data) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        Sign in, start the API, or check that you have reader access to this manual.
      </div>
    );
  }

  const manual = manualQuery.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3 shadow-sm">
        <Link href="/app/manuals" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowLeft size={16} /> Manuals
        </Link>
        <Link href={`/app/manuals/${manual.slug}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
          <Pencil size={16} /> Editor
        </Link>
      </div>
      <ReaderLayout manual={manual} app />
    </div>
  );
}
