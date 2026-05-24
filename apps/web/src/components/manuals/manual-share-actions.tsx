"use client";

import type React from "react";
import { useState } from "react";
import { Check, Copy, Download, Link2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL, api, getToken } from "@/lib/api";

export function ManualShareActions({ manualId }: { manualId: string }) {
  const [mode, setMode] = useState<"copy" | "private" | "email">("copy");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [status, setStatus] = useState("");

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setStatus("Link copied.");
  }

  async function sendEmail(event: React.FormEvent) {
    event.preventDefault();
    setStatus("");
    try {
      await api(`/manuals/${manualId}/share-email`, {
        method: "POST",
        body: JSON.stringify({ recipientEmail: email, message: message || undefined })
      });
      setStatus("Manual sent.");
      setEmail("");
      setMessage("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send email.");
    }
  }

  async function createPrivateLink() {
    setStatus("");
    try {
      const response = await api<{ data: { url: string; expiresAt: string } }>(`/manuals/${manualId}/share-links`, {
        method: "POST",
        body: JSON.stringify({ expiresInDays })
      });
      await navigator.clipboard.writeText(response.data.url);
      setStatus(`Private link copied. Expires ${new Date(response.data.expiresAt).toLocaleDateString()}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create private link.");
    }
  }

  async function downloadOfflinePack() {
    const token = getToken();
    const response = await fetch(`${API_URL}/manuals/${manualId}/offline-pack`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) {
      setStatus("Could not download offline pack.");
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = response.headers.get("Content-Disposition")?.match(/filename=\"?([^"]+)/)?.[1] ?? "manual-offline.html";
    link.click();
    window.URL.revokeObjectURL(url);
    setStatus("Offline pack downloaded.");
  }

  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <div className="grid grid-cols-3 rounded-md border border-line bg-slate-50 p-1">
        <button type="button" onClick={() => setMode("copy")} className={`inline-flex h-9 items-center justify-center gap-2 rounded px-3 text-sm font-semibold ${mode === "copy" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}>
          <Copy size={15} />Copy link
        </button>
        <button type="button" onClick={() => setMode("private")} className={`inline-flex h-9 items-center justify-center gap-2 rounded px-3 text-sm font-semibold ${mode === "private" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}>
          <Link2 size={15} />Private
        </button>
        <button type="button" onClick={() => setMode("email")} className={`inline-flex h-9 items-center justify-center gap-2 rounded px-3 text-sm font-semibold ${mode === "email" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}>
          <Mail size={15} />Email
        </button>
      </div>

      {mode === "copy" ? (
        <Button type="button" variant="secondary" className="mt-3 w-full" onClick={copyLink}>
          {status === "Link copied." ? <Check size={16} /> : <Copy size={16} />}
          {status === "Link copied." ? "Copied" : "Copy link"}
        </Button>
      ) : mode === "private" ? (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Expires in</span>
            <select value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))} className="field mt-1">
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
          <Button type="button" className="w-full" onClick={createPrivateLink}><Link2 size={16} />Create private link</Button>
          <Button type="button" variant="secondary" className="w-full" onClick={downloadOfflinePack}><Download size={16} />Offline pack</Button>
        </div>
      ) : (
        <form onSubmit={sendEmail} className="mt-3 space-y-3">
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="field" placeholder="recipient@example.com" />
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="field min-h-20" placeholder="Optional message" />
          <Button type="submit" className="w-full"><Send size={16} />Send manual</Button>
        </form>
      )}

      {status ? <p className="mt-3 text-sm font-medium text-slate-600">{status}</p> : null}
    </div>
  );
}
