"use client";

import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Manual } from "@/lib/types";
import { ManualBrowser } from "./manual-browser";
import { Button } from "@/components/ui/button";

export function AuthManuals() {
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [visibility, setVisibility] = useState("internal");
  const statusParam = searchParams.get("status") ?? "all";
  const queryParam = searchParams.get("q") ?? "";
  const initialStatus = ["all", "draft", "in_review", "approved", "published", "archived"].includes(statusParam) ? statusParam : "all";
  const manuals = useQuery({
    queryKey: ["manuals"],
    queryFn: async () => (await api<{ data: Manual[] }>("/manuals")).data
  });
  const spaces = useQuery({
    queryKey: ["spaces"],
    queryFn: async () => (await api<{ data: Array<{ id: string; name: string }> }>("/spaces")).data
  });

  async function createManual(event: React.FormEvent) {
    event.preventDefault();
    await api("/manuals", {
      method: "POST",
      body: JSON.stringify({ title, description, spaceId, visibility })
    });
    setTitle("");
    setDescription("");
    setCreating(false);
    await manuals.refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Manuals</h1>
          <p className="mt-1 text-sm text-slate-600">Manage first-class manuals, pages, visibility, reviews, and publishing.</p>
        </div>
        <Button onClick={() => setCreating((value) => !value)}>Create manual</Button>
      </div>
      {creating ? (
        <form onSubmit={createManual} className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_220px_180px_auto]">
          <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Manual title" className="h-11 rounded-md border border-line px-3 text-sm outline-none focus:border-slate-400" />
          <select required value={spaceId} onChange={(event) => setSpaceId(event.target.value)} className="h-11 rounded-md border border-line px-3 text-sm">
            <option value="">Select space</option>
            {(spaces.data ?? []).map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
          </select>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="h-11 rounded-md border border-line px-3 text-sm">
            <option value="internal">Internal</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="restricted">Restricted</option>
          </select>
          <Button type="submit">Save draft</Button>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short description" className="min-h-20 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-slate-400 lg:col-span-4" />
        </form>
      ) : null}
      {manuals.isLoading ? (
        <div className="rounded-lg border border-line bg-white p-8 text-sm text-slate-500">Loading manuals...</div>
      ) : manuals.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">Sign in or start the API to load manuals.</div>
      ) : (
        <ManualBrowser manuals={manuals.data ?? []} hrefPrefix="/app/manuals" initialStatus={initialStatus} initialQuery={queryParam} />
      )}
    </div>
  );
}
