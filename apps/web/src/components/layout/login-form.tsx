"use client";

import type React from "react";
import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Eye, EyeOff, Home, KeyRound, Mail } from "lucide-react";
import { API_URL, api, setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";

function readableAuthError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (!message) return fallback;

  try {
    const parsed = JSON.parse(message) as { message?: unknown; error?: unknown; statusCode?: unknown };
    if (parsed.statusCode === 401) return "Invalid email or password.";
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message;
    if (Array.isArray(parsed.message) && parsed.message.length) return parsed.message.join(" ");
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
  } catch {
    // Fall back to a concise string below when the API did not return JSON.
  }

  if (/unauthorized|invalid credentials/i.test(message)) return "Invalid email or password.";
  return message.length > 140 ? fallback : message;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetToken = searchParams.get("resetToken") ?? "";
  const ssoToken = searchParams.get("ssoToken") ?? "";
  const nextPath = searchParams.get("next") ?? "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showResetRequest, setShowResetRequest] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoProviders, setSsoProviders] = useState<Array<{ id: string; label: string; type: string; enabled: boolean }>>([]);

  useEffect(() => {
    if (!ssoToken) return;
    setToken(ssoToken);
    router.replace((nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/app") as Route);
  }, [nextPath, router, ssoToken]);

  useEffect(() => {
    let active = true;
    api<{ data: Array<{ id: string; label: string; type: string; enabled: boolean }> }>("/auth/sso/providers")
      .then((response) => {
        if (active) setSsoProviders(response.data.filter((provider) => provider.enabled));
      })
      .catch(() => {
        if (active) setSsoProviders([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await api<{ data: { token: string } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(response.data.token);
      router.push((nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/app") as Route);
    } catch (err) {
      setError(readableAuthError(err, "Sign in failed. Check your email and password, then try again."));
    } finally {
      setLoading(false);
    }
  }

  async function requestReset(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setError("If that account exists, a reset email has been sent.");
    } catch (err) {
      setError(readableAuthError(err, "Reset email could not be sent."));
    } finally {
      setLoading(false);
    }
  }

  async function completeReset(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/auth/password-reset/complete", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, password: newPassword })
      });
      setError("Password reset. Sign in with your new password.");
      setNewPassword("");
      router.replace("/login");
    } catch (err) {
      setError(readableAuthError(err, "Password reset failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-panel px-4">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <Link href="/" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50">
          <Home size={16} />
          Home
        </Link>
        <ThemeToggle />
      </div>
      <form onSubmit={resetToken ? completeReset : showResetRequest ? requestReset : submit} className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-slate-950 text-white">
            <BookOpen size={20} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-950">Manuals</h1>
            <p className="text-sm text-slate-500">{resetToken ? "Choose a new password." : showResetRequest ? "Receive a reset link by email." : "Sign in to manage manuals."}</p>
          </div>
        </div>
        {!resetToken && !showResetRequest && ssoProviders.length ? (
          <div className="mb-5 space-y-2">
            {ssoProviders.map((provider) => (
              <a
                key={provider.id}
                href={`${API_URL}/auth/sso/${encodeURIComponent(provider.id)}/start?next=${encodeURIComponent(nextPath)}`}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-slate-50 px-3 text-sm font-semibold text-slate-800 transition hover:bg-white"
              >
                <KeyRound size={16} />
                Continue with {provider.label}
              </a>
            ))}
            <div className="flex items-center gap-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              <span className="h-px flex-1 bg-line" />
              Password
              <span className="h-px flex-1 bg-line" />
            </div>
          </div>
        ) : null}
        <div className="space-y-4">
          {resetToken ? (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">New password</span>
              <input required type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-slate-400" placeholder="Enter your new password" />
            </label>
          ) : (
            <>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-slate-400" placeholder="you@example.com" autoComplete="email" />
              </label>
              {!showResetRequest ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Password</span>
                  <span className="relative mt-1 block">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-11 w-full rounded-md border border-line px-3 pr-11 text-sm outline-none focus:border-slate-400"
                      placeholder="Enter your password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-md text-slate-500 transition hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
              ) : null}
            </>
          )}
          {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          <Button disabled={loading} className="w-full">
            {showResetRequest ? <Mail size={16} /> : null}
            {loading ? "Working..." : resetToken ? "Reset password" : showResetRequest ? "Send reset email" : "Sign in"}
          </Button>
          {!resetToken ? (
            <button type="button" onClick={() => { setShowResetRequest(!showResetRequest); setError(""); }} className="w-full text-center text-sm font-semibold text-slate-600 hover:text-slate-950">
              {showResetRequest ? "Back to sign in" : "Forgot password?"}
            </button>
          ) : null}
        </div>
      </form>
    </main>
  );
}
