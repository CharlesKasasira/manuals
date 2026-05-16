"use client";

import type React from "react";
import { useState } from "react";
import { Check, Copy, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ManualShareActions({ manualId }: { manualId: string }) {
  const [mode, setMode] = useState<"copy" | "email">("copy");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
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

  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 rounded-md border border-line bg-slate-50 p-1">
        <button type="button" onClick={() => setMode("copy")} className={`inline-flex h-9 items-center justify-center gap-2 rounded px-3 text-sm font-semibold ${mode === "copy" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}>
          <Copy size={15} />Copy link
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
