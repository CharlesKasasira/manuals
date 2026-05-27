"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { Manual } from "@/lib/types";
import { ManualBrowser } from "./manual-browser";

export function DraftManuals() {
  const drafts = useQuery({
    queryKey: ["manuals", "draft"],
    queryFn: async () => (await api<{ data: Manual[] }>("/manuals?status=draft")).data
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
            <FileText size={21} />
            Drafts
          </h1>
          <p className="mt-1 text-sm text-slate-600">Manuals saved as drafts before review or publishing.</p>
        </div>
      </div>
      {drafts.isLoading ? (
        <div className="rounded-lg border border-line bg-white p-8 text-sm text-slate-500">Loading drafts...</div>
      ) : drafts.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">Sign in or start the API to load drafts.</div>
      ) : (
        <ManualBrowser manuals={drafts.data ?? []} hrefPrefix="/app/manuals" initialStatus="draft" />
      )}
    </div>
  );
}
