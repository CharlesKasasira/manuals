"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { BarChart3, BookOpen, Check, Copy, Cpu, Database, Filter, HardDrive, KeyRound, Layers3, LockKeyhole, Mail, MessageSquareText, Plus, Power, PowerOff, RotateCw, Send, Server, ShieldCheck, Tag, Trash2, UserCheck, UserCog, UserX, Users } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api, setToken } from "@/lib/api";
import type { AdminOverview, AdminSystemInfo, AdminUser, AnalyticsSettings, ApiKey, PageComment, PageCommentKind, PageCommentStatus, PermissionAction, Role, Team } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export type AdminSection = "overview" | "users" | "teams" | "permissions" | "api-keys" | "mail" | "audit" | "system" | "comments" | "auth" | "analytics";
type Tab = Exclude<AdminSection, "overview">;
type RunAction = (action: () => Promise<unknown>, success: string) => Promise<unknown>;
const adminTabs: Tab[] = ["users", "teams", "permissions", "api-keys", "mail", "audit", "comments", "auth", "analytics", "system"];
const tabLabels: Record<Tab, string> = {
  users: "Users",
  teams: "Groups",
  permissions: "Permissions",
  "api-keys": "API keys",
  mail: "Email",
  audit: "Audit",
  comments: "Comments",
  auth: "Authentication",
  analytics: "Analytics",
  system: "System Info"
};

type AuthStrategyKey = "local" | "ldap" | "keycloak" | "saml";
type AuthStrategies = Record<AuthStrategyKey, Record<string, string | boolean | number>>;

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-line bg-slate-50 p-5 text-sm text-slate-500">{children}</div>;
}

function ErrorState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{children}</div>;
}

function formatBytes(value = 0) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`;
}

function formatDuration(totalSeconds = 0) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function AdminManagementPanel({ section = "overview" }: { section?: AdminSection }) {
  const [message, setMessage] = useState("");
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: async () => (await api<{ data: AdminOverview }>("/admin/overview")).data,
    retry: false
  });

  const data = overview.data;
  const activeUsers = data?.users.filter((user) => user.isActive).length ?? 0;

  async function run(action: () => Promise<unknown>, success: string) {
    setMessage("");
    try {
      const result = await action();
      await overview.refetch();
      setMessage(success);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
      return undefined;
    }
  }

  if (overview.isLoading) return <EmptyState>Loading admin data...</EmptyState>;
  if (overview.isError || !data) return <ErrorState>Admin management requires an admin account and a running API.</ErrorState>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Control center</h1>
          <p className="mt-1 text-sm text-slate-600">Administer identity, access, content operations, integrations, and system trust signals.</p>
        </div>
        {message ? <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</span> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active users" value={activeUsers} icon={Users} />
        <Metric label="Teams" value={data.teams.length} icon={UserCheck} />
        <Metric label="API keys" value={data.apiAccess.keys.length} icon={KeyRound} />
        <Metric label="Audit events" value={data.auditLogs.length} icon={ShieldCheck} />
      </div>

      {section === "overview" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ControlCenterCard title="Identity" description="Create accounts, activate users, impersonate for support, and assign base roles." value={`${data.users.length} users`} icon={Users} href="/app/admin/users" />
          <ControlCenterCard title="Access groups" description="Organize people into teams for ownership and reusable access patterns." value={`${data.teams.length} groups`} icon={UserCheck} href="/app/admin/teams" />
          <ControlCenterCard title="Permissions" description="Grant scoped actions across manuals, spaces, and teams." value={`${data.permissions.length} grants`} icon={ShieldCheck} href="/app/admin/permissions" />
          <ControlCenterCard title="Integrations" description="Manage automation credentials and API access for connected systems." value={`${data.apiAccess.keys.length} keys`} icon={KeyRound} href="/app/admin/api-keys" />
          <ControlCenterCard title="Email" description="Configure outbound mail for resets, reviews, and notifications." value={data.mailSettings.configured ? "Configured" : "Not configured"} icon={Mail} href="/app/admin/mail" />
          <ControlCenterCard title="Audit trail" description="Review administrative and content governance events." value={`${data.auditLogs.length} events`} icon={ShieldCheck} href="/app/admin/audit" />
          <ControlCenterCard title="Comments" description="Review page comments, reviewer notes, and change requests across manuals." value="Central feed" icon={MessageSquareText} href="/app/admin/comments" />
          <ControlCenterCard title="Authentication" description="Configure local login, LDAP, Keycloak, and SAML sign-in strategies." value="Strategies" icon={LockKeyhole} href="/app/admin/auth" />
          <ControlCenterCard title="Analytics" description="Configure Google Analytics and Google Tag Manager tracking." value="Providers" icon={BarChart3} href="/app/admin/analytics" />
          <ControlCenterCard title="System Info" description="Inspect application, runtime, database, and host information." value={data.mailSettings.configured ? "Ready" : "Review"} icon={Server} href="/app/admin/system" />
          <ControlCenterCard title="Spaces" description="Track the content spaces available for manuals and permission scopes." value={`${data.spaces.length} spaces`} icon={Layers3} />
          <ControlCenterCard title="Content estate" description="Monitor manuals governed by this workspace." value={`${data.manuals.length} manuals`} icon={BookOpen} />
          <ControlCenterCard title="System health" description="Check pending notifications and mail readiness before reviews go out." value={`${data.pendingNotifications} pending`} icon={Mail} href="/app/admin/mail" />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {adminTabs.map((item) => (
          <Link
            key={item}
            href={`/app/admin/${item}` as Route}
            className={`rounded-md border px-4 py-2 text-sm font-semibold ${section === item ? "border-slate-950 bg-slate-950 text-white" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {tabLabels[item]}
          </Link>
        ))}
      </div>

      {section === "users" ? <UsersAdmin data={data} run={run} /> : null}
      {section === "teams" ? <TeamsAdmin data={data} run={run} /> : null}
      {section === "permissions" ? <PermissionsAdmin data={data} run={run} /> : null}
      {section === "api-keys" ? <ApiKeysAdmin data={data} run={run} /> : null}
      {section === "mail" ? <MailAdmin data={data} run={run} /> : null}
      {section === "audit" ? <AuditAdmin data={data} /> : null}
      {section === "comments" ? <CommentsAdmin /> : null}
      {section === "auth" ? <AuthStrategiesAdmin /> : null}
      {section === "analytics" ? <AnalyticsSettingsAdmin /> : null}
      {section === "system" ? <SystemInfoAdmin /> : null}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
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

function ControlCenterCard({
  title,
  description,
  value,
  icon: Icon,
  active = false,
  href
}: {
  title: string;
  description: string;
  value: string;
  icon: LucideIcon;
  active?: boolean;
  href?: Route;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-md border p-2 ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-line bg-slate-50 text-slate-600"}`}>
          <Icon size={18} />
        </span>
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{value}</span>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`grid min-h-40 gap-4 rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 ${active ? "border-slate-950 ring-1 ring-slate-950" : "border-line"}`}
      >
        {content}
      </Link>
    );
  }

  return <div className="grid min-h-40 gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">{content}</div>;
}

function CommentsAdmin() {
  const [status, setStatus] = useState<"all" | PageCommentStatus>("open");
  const [kind, setKind] = useState<"all" | PageCommentKind>("all");
  const [query, setQuery] = useState("");
  const comments = useQuery({
    queryKey: ["admin", "comments"],
    queryFn: async () => (await api<{ data: PageComment[] }>("/admin/comments")).data,
    retry: false
  });

  if (comments.isLoading) return <EmptyState>Loading comments...</EmptyState>;
  if (comments.isError || !comments.data) return <ErrorState>Comments require an admin account and a running API.</ErrorState>;

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = comments.data.filter((comment) => {
    if (status !== "all" && comment.status !== status) return false;
    if (kind !== "all" && comment.kind !== kind) return false;
    if (!normalizedQuery) return true;
    return [
      comment.body,
      comment.author?.name,
      comment.assignedTo?.name,
      comment.page?.title,
      comment.page?.manual?.title
    ].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
  });
  const openCount = comments.data.filter((comment) => comment.status === "open").length;
  const changeRequests = comments.data.filter((comment) => comment.kind === "change_request" && comment.status === "open").length;

  async function updateComment(comment: PageComment, nextStatus: PageCommentStatus) {
    if (!comment.pageId) return;
    await api(`/pages/${comment.pageId}/comments/${comment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus })
    });
    await comments.refetch();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Total comments" value={comments.data.length} icon={MessageSquareText} />
        <Metric label="Open" value={openCount} icon={MessageSquareText} />
        <Metric label="Open changes" value={changeRequests} icon={ShieldCheck} />
      </div>

      <Card>
        <CardContent className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_190px]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 rounded-md border border-line px-3 text-sm outline-none focus:border-slate-400" placeholder="Search comments, manuals, pages, or people" />
          <select value={status} onChange={(event) => setStatus(event.target.value as "all" | PageCommentStatus)} className="h-10 rounded-md border border-line bg-white px-3 text-sm">
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
          <select value={kind} onChange={(event) => setKind(event.target.value as "all" | PageCommentKind)} className="h-10 rounded-md border border-line bg-white px-3 text-sm">
            <option value="all">All comment types</option>
            <option value="comment">Comment</option>
            <option value="reviewer_note">Reviewer note</option>
            <option value="change_request">Change request</option>
          </select>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {filtered.length ? filtered.map((comment) => {
          const manual = comment.page?.manual;
          const href = manual?.slug ? `/app/manuals/${manual.slug}/reader${comment.page?.slug ? `#page-${comment.page.slug}` : ""}` : null;
          return (
            <Card key={comment.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <Badge value={comment.kind} />
                      <Badge value={comment.status} />
                      {manual?.visibility ? <Badge value={manual.visibility} /> : null}
                    </div>
                    <h2 className="mt-3 text-base font-semibold text-slate-950">{manual?.title ?? "Unknown manual"}</h2>
                    <p className="mt-1 text-sm text-slate-500">{comment.page?.title ? `Page: ${comment.page.title}` : "Page context unavailable"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {href ? (
                      <Link href={href as Route} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Open page
                      </Link>
                    ) : null}
                    <Button type="button" variant="secondary" onClick={() => updateComment(comment, comment.status === "open" ? "resolved" : "open")}>
                      {comment.status === "open" ? "Resolve" : "Reopen"}
                    </Button>
                  </div>
                </div>
                <p className="rounded-md border border-line bg-slate-50 p-3 text-sm leading-6 text-slate-700">{comment.body}</p>
                <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <p>Author: {comment.author?.name ?? "Unknown"} / {formatDate(comment.createdAt)}</p>
                  {comment.assignedTo ? <p>Owner: {comment.assignedTo.name}</p> : <p>Owner: Unassigned</p>}
                  {comment.sectionAnchor ? <p>Section: {comment.sectionAnchor}</p> : null}
                  {comment.resolvedBy ? <p>Resolved by: {comment.resolvedBy.name}</p> : null}
                </div>
              </CardContent>
            </Card>
          );
        }) : <EmptyState>No comments match these filters.</EmptyState>}
      </div>
    </div>
  );
}

function AuthStrategiesAdmin() {
  const [selected, setSelected] = useState<AuthStrategyKey>("local");
  const [draft, setDraft] = useState<AuthStrategies | null>(null);
  const [message, setMessage] = useState("");
  const strategies = useQuery({
    queryKey: ["admin", "auth", "strategies"],
    queryFn: async () => (await api<{ data: AuthStrategies }>("/admin/auth/strategies")).data,
    retry: false
  });

  useEffect(() => {
    if (strategies.data) setDraft(strategies.data);
  }, [strategies.data]);

  if (strategies.isLoading || !draft) return <EmptyState>Loading authentication strategies...</EmptyState>;
  if (strategies.isError) return <ErrorState>Authentication settings require an admin account and a running API.</ErrorState>;

  const current = draft[selected];
  const strategyList: Array<{ key: AuthStrategyKey; title: string; subtitle: string }> = [
    { key: "local", title: "Local", subtitle: "Local Database" },
    { key: "ldap", title: "LDAP / Active Directory", subtitle: "Directory bind and search" },
    { key: "keycloak", title: "Keycloak", subtitle: "OpenID Connect" },
    { key: "saml", title: "SAML 2.0", subtitle: "SAML identity provider" }
  ];

  function update(field: string, value: string | boolean | number) {
    setDraft((valueByStrategy) => valueByStrategy ? {
      ...valueByStrategy,
      [selected]: { ...valueByStrategy[selected], [field]: value }
    } : valueByStrategy);
  }

  async function save() {
    setMessage("");
    const response = await api<{ data: AuthStrategies }>("/admin/auth/strategies", {
      method: "PATCH",
      body: JSON.stringify({ strategies: draft })
    });
    setDraft(response.data);
    await strategies.refetch();
    setMessage("Authentication strategies saved.");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Authentication</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">Authentication</h2>
          <p className="mt-1 text-sm text-slate-600">Configure login strategies for local accounts and external identity providers.</p>
        </div>
        <div className="flex items-center gap-2">
          {message ? <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</span> : null}
          <Button type="button" onClick={save}><Check size={16} />Apply</Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card>
          <CardHeader><div className="text-sm font-semibold text-slate-950">Active Strategies</div></CardHeader>
          <CardContent className="space-y-2">
            {strategyList.map((strategy) => {
              const enabled = Boolean(draft[strategy.key]?.enabled);
              const active = selected === strategy.key;
              return (
                <button
                  key={strategy.key}
                  type="button"
                  onClick={() => setSelected(strategy.key)}
                  className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left transition ${active ? "border-emerald-200 bg-emerald-50" : "border-line bg-white hover:bg-slate-50"}`}
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-950">{String(draft[strategy.key]?.displayName || strategy.title)}</span>
                    <span className="block text-xs text-slate-500">{strategy.subtitle}</span>
                  </span>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{enabled ? "Active" : "Off"}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-950">{String(current.displayName)}</h3>
                <p className="mt-1 text-sm text-slate-500">{authStrategyDescription(selected)}</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={selected === "local" || Boolean(current.enabled)} disabled={selected === "local"} onChange={(event) => update("enabled", event.target.checked)} />
                Active
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <TextField label="Display Name" value={String(current.displayName ?? "")} onChange={(value) => update("displayName", value)} />
              <SelectField label="Assign Role" value={String(current.assignRole ?? "user")} onChange={(value) => update("assignRole", value)} options={["user", "manager", "admin"]} />
            </div>

            {selected === "local" ? <LocalAuthFields strategy={current} update={update} /> : null}
            {selected === "ldap" ? <LdapAuthFields strategy={current} update={update} /> : null}
            {selected === "keycloak" ? <KeycloakAuthFields strategy={current} update={update} /> : null}
            {selected === "saml" ? <SamlAuthFields strategy={current} update={update} /> : null}

            <div className="border-t border-line pt-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Registration</p>
              <div className="mt-4 space-y-4">
                <ToggleField label="Allow self-registration" description="Allow users authorized by this strategy to access Manuals." checked={Boolean(current.selfRegistration)} onChange={(checked) => update("selfRegistration", checked)} />
                <TextField label="Limit to specific email domains" value={String(current.emailDomains ?? "")} onChange={(value) => update("emailDomains", value)} placeholder="renu.ac.ug, example.org" help="Comma-separated domains allowed to register through this strategy." />
              </div>
            </div>

            <div className="rounded-md border border-line bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Configuration Reference</p>
              <div className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <p><span className="font-semibold text-slate-800">Login URL:</span><br />/login</p>
                <p><span className="font-semibold text-slate-800">Callback URL:</span><br />/auth/sso/{selected}/callback</p>
                <p><span className="font-semibold text-slate-800">Allowed Origins:</span><br />Configured web origin</p>
                <p><span className="font-semibold text-slate-800">Token Method:</span><br />HTTP-POST</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AnalyticsSettingsAdmin() {
  const [draft, setDraft] = useState<AnalyticsSettings | null>(null);
  const [message, setMessage] = useState("");
  const settings = useQuery({
    queryKey: ["admin", "analytics-settings"],
    queryFn: async () => (await api<{ data: AnalyticsSettings }>("/admin/analytics-settings")).data,
    retry: false
  });

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  if (settings.isLoading || !draft) return <EmptyState>Loading analytics settings...</EmptyState>;
  if (settings.isError) return <ErrorState>Analytics settings require an admin account and a running API.</ErrorState>;

  function update<K extends keyof AnalyticsSettings>(key: K, value: AnalyticsSettings[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    setMessage("");
    const response = await api<{ data: AnalyticsSettings }>("/admin/analytics-settings", {
      method: "PATCH",
      body: JSON.stringify(draft)
    });
    setDraft(response.data);
    await settings.refetch();
    setMessage("Analytics settings saved.");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Analytics</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">Analytics Providers</h2>
          <p className="mt-1 text-sm text-slate-600">Configure external analytics tags for the public Manuals experience.</p>
        </div>
        <div className="flex items-center gap-2">
          {message ? <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</span> : null}
          <Button type="button" onClick={save}><Check size={16} />Apply</Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-sky-200 bg-sky-50 p-2 text-sky-700"><BarChart3 size={18} /></span>
              <div>
                <h3 className="text-base font-semibold text-slate-950">Google Analytics</h3>
                <p className="text-sm text-slate-500">Track page views using a GA4 Measurement ID.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleField label="Enable Google Analytics" description="Inject the Google Analytics gtag script into public pages." checked={draft.googleAnalyticsEnabled} onChange={(checked) => update("googleAnalyticsEnabled", checked)} />
            <TextField label="Measurement ID" value={draft.googleAnalyticsMeasurementId} onChange={(value) => update("googleAnalyticsMeasurementId", value.trim().toUpperCase())} placeholder="G-XXXXXXXXXX" help="Use your GA4 Measurement ID. Settings only become active when this starts with G-." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-emerald-700"><Tag size={18} /></span>
              <div>
                <h3 className="text-base font-semibold text-slate-950">Google Tag Manager</h3>
                <p className="text-sm text-slate-500">Load a GTM container for tags and conversion scripts.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleField label="Enable Google Tag Manager" description="Inject the GTM script and noscript fallback into public pages." checked={draft.googleTagManagerEnabled} onChange={(checked) => update("googleTagManagerEnabled", checked)} />
            <TextField label="Container ID" value={draft.googleTagManagerContainerId} onChange={(value) => update("googleTagManagerContainerId", value.trim().toUpperCase())} placeholder="GTM-XXXXXXX" help="Use your Google Tag Manager container ID. Settings only become active when this starts with GTM-." />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><div className="text-sm font-semibold text-slate-950">Configuration Reference</div></CardHeader>
        <CardContent className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          <p><span className="font-semibold text-slate-800">Public endpoint:</span><br />/public/analytics-settings</p>
          <p><span className="font-semibold text-slate-800">Google Analytics format:</span><br />G-XXXXXXXXXX</p>
          <p><span className="font-semibold text-slate-800">Google Tag Manager format:</span><br />GTM-XXXXXXX</p>
          <p><span className="font-semibold text-slate-800">Injection scope:</span><br />Public and app pages rendered by the web frontend.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function authStrategyDescription(strategy: AuthStrategyKey) {
  if (strategy === "local") return "Built-in username and password authentication.";
  if (strategy === "ldap") return "Bind to LDAP or Active Directory and map directory attributes.";
  if (strategy === "keycloak") return "Use Keycloak through OpenID Connect.";
  return "Configure a SAML 2.0 identity provider.";
}

function TextField({ label, value, onChange, placeholder, help, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; help?: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-slate-400" />
      {help ? <span className="mt-1 block text-xs text-slate-500">{help}</span> : null}
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder, help }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; help?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 min-h-28 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-slate-400" />
      {help ? <span className="mt-1 block text-xs text-slate-500">{help}</span> : null}
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-sm">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ToggleField({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1" />
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="block text-sm text-slate-500">{description}</span>
      </span>
    </label>
  );
}

function LocalAuthFields({ strategy, update }: { strategy: Record<string, string | boolean | number>; update: (field: string, value: string | boolean | number) => void }) {
  return <ToggleField label="Password reset via email" description="Allow local users to request password reset links when mail is configured." checked={Boolean(strategy.passwordReset ?? true)} onChange={(checked) => update("passwordReset", checked)} />;
}

function LdapAuthFields({ strategy, update }: { strategy: Record<string, string | boolean | number>; update: (field: string, value: string | boolean | number) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="LDAP URL" value={String(strategy.url ?? "")} onChange={(value) => update("url", value)} placeholder="ldap://serverhost:389" />
        <TextField label="Admin Bind DN" value={String(strategy.bindDn ?? "")} onChange={(value) => update("bindDn", value)} placeholder="cn=root" />
        <TextField label="Admin Bind Credentials" value={String(strategy.bindCredentials ?? "")} onChange={(value) => update("bindCredentials", value)} type="password" />
        <TextField label="Search Base" value={String(strategy.searchBase ?? "")} onChange={(value) => update("searchBase", value)} placeholder="ou=users,o=example.com" />
        <TextField label="Search Filter" value={String(strategy.searchFilter ?? "")} onChange={(value) => update("searchFilter", value)} placeholder="(uid={{username}})" />
        <TextField label="TLS Certificate Path" value={String(strategy.tlsCertificatePath ?? "")} onChange={(value) => update("tlsCertificatePath", value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ToggleField label="Use TLS" description="Connect using LDAPS or StartTLS." checked={Boolean(strategy.useTls)} onChange={(checked) => update("useTls", checked)} />
        <ToggleField label="Verify TLS Certificate" description="Reject invalid directory TLS certificates." checked={Boolean(strategy.verifyTls)} onChange={(checked) => update("verifyTls", checked)} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <TextField label="Unique ID Field" value={String(strategy.uniqueIdField ?? "")} onChange={(value) => update("uniqueIdField", value)} />
        <TextField label="Email Field" value={String(strategy.emailField ?? "")} onChange={(value) => update("emailField", value)} />
        <TextField label="Display Name Field" value={String(strategy.displayNameField ?? "")} onChange={(value) => update("displayNameField", value)} />
      </div>
      <ToggleField label="Map Groups" description="Map directory groups into Manuals groups in a later sync step." checked={Boolean(strategy.mapGroups)} onChange={(checked) => update("mapGroups", checked)} />
      <div className="grid gap-4 md:grid-cols-3">
        <TextField label="Group Search Base" value={String(strategy.groupSearchBase ?? "")} onChange={(value) => update("groupSearchBase", value)} />
        <TextField label="Group Search Filter" value={String(strategy.groupSearchFilter ?? "")} onChange={(value) => update("groupSearchFilter", value)} />
        <TextField label="Group Name Field" value={String(strategy.groupNameField ?? "")} onChange={(value) => update("groupNameField", value)} />
      </div>
    </div>
  );
}

function KeycloakAuthFields({ strategy, update }: { strategy: Record<string, string | boolean | number>; update: (field: string, value: string | boolean | number) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField label="Issuer URL" value={String(strategy.issuer ?? "")} onChange={(value) => update("issuer", value)} placeholder="https://keycloak.example.com/realms/manuals" />
      <TextField label="Client ID" value={String(strategy.clientId ?? "")} onChange={(value) => update("clientId", value)} />
      <TextField label="Client Secret" value={String(strategy.clientSecret ?? "")} onChange={(value) => update("clientSecret", value)} type="password" />
      <TextField label="Redirect URI" value={String(strategy.redirectUri ?? "")} onChange={(value) => update("redirectUri", value)} placeholder="https://manuals.example.com/auth/sso/keycloak/callback" />
      <TextField label="Scopes" value={String(strategy.scopes ?? "")} onChange={(value) => update("scopes", value)} placeholder="openid email profile" />
      <ToggleField label="Auto-provision users" description="Create local accounts when Keycloak returns a verified email." checked={Boolean(strategy.autoProvision)} onChange={(checked) => update("autoProvision", checked)} />
    </div>
  );
}

function SamlAuthFields({ strategy, update }: { strategy: Record<string, string | boolean | number>; update: (field: string, value: string | boolean | number) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Entry Point" value={String(strategy.entryPoint ?? "")} onChange={(value) => update("entryPoint", value)} />
        <TextField label="Issuer" value={String(strategy.issuer ?? "")} onChange={(value) => update("issuer", value)} />
        <TextField label="Audience" value={String(strategy.audience ?? "")} onChange={(value) => update("audience", value)} />
        <TextField label="Provider Name" value={String(strategy.providerName ?? "")} onChange={(value) => update("providerName", value)} />
      </div>
      <TextAreaField label="Certificate" value={String(strategy.certificate ?? "")} onChange={(value) => update("certificate", value)} />
      <TextAreaField label="Private Key" value={String(strategy.privateKey ?? "")} onChange={(value) => update("privateKey", value)} />
      <div className="grid gap-4 md:grid-cols-3">
        <SelectField label="Signature Algorithm" value={String(strategy.signatureAlgorithm ?? "sha1")} onChange={(value) => update("signatureAlgorithm", value)} options={["sha1", "sha256", "sha512"]} />
        <SelectField label="Digest Algorithm" value={String(strategy.digestAlgorithm ?? "sha1")} onChange={(value) => update("digestAlgorithm", value)} options={["sha1", "sha256", "sha512"]} />
        <TextField label="Accepted Clock Skew Milliseconds" value={String(strategy.acceptedClockSkewMs ?? 0)} onChange={(value) => update("acceptedClockSkewMs", Number(value) || 0)} type="number" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="NameID Format" value={String(strategy.nameIdFormat ?? "")} onChange={(value) => update("nameIdFormat", value)} />
        <TextField label="Authn Context" value={String(strategy.authnContext ?? "")} onChange={(value) => update("authnContext", value)} />
        <TextField label="Unique ID Field Mapping" value={String(strategy.uniqueIdField ?? "")} onChange={(value) => update("uniqueIdField", value)} />
        <TextField label="Email Field Mapping" value={String(strategy.emailField ?? "")} onChange={(value) => update("emailField", value)} />
        <TextField label="Display Name Field Mapping" value={String(strategy.displayNameField ?? "")} onChange={(value) => update("displayNameField", value)} />
        <TextField label="Group Field Mapping" value={String(strategy.groupField ?? "")} onChange={(value) => update("groupField", value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ToggleField label="Disable Requested Authn Context" description="Do not request a specific authentication context." checked={Boolean(strategy.disableRequestedAuthnContext)} onChange={(checked) => update("disableRequestedAuthnContext", checked)} />
        <ToggleField label="Skip Request Compression" description="Send SAML requests without compression." checked={Boolean(strategy.skipRequestCompression)} onChange={(checked) => update("skipRequestCompression", checked)} />
        <ToggleField label="Map Groups" description="Map SAML group attributes into Manuals groups." checked={Boolean(strategy.mapGroups)} onChange={(checked) => update("mapGroups", checked)} />
      </div>
    </div>
  );
}

function SystemInfoAdmin() {
  const system = useQuery({
    queryKey: ["admin", "system"],
    queryFn: async () => (await api<{ data: AdminSystemInfo }>("/admin/system")).data,
    retry: false
  });

  if (system.isLoading) return <EmptyState>Loading system information...</EmptyState>;
  if (system.isError || !system.data) return <ErrorState>System information requires an admin account and a running API.</ErrorState>;

  const data = system.data;
  const ramUsed = Math.max(0, data.host.totalRamBytes - data.host.freeRamBytes);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">System</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">System Info</h2>
          <p className="mt-1 text-sm text-slate-600">Information about your Manuals installation and host runtime.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => system.refetch()} disabled={system.isFetching}>
          <RotateCw className={system.isFetching ? "animate-spin" : ""} size={16} /> Refresh
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <div className="space-y-5">
          <SystemCard title="Manuals">
            <SystemRow icon={BookOpen} label="Application" value={data.application.name} detail={`Version ${data.application.version}`} tone="blue" />
            <SystemRow icon={Server} label="Environment" value={data.application.environment} detail={data.application.apiUrl ?? "API URL not configured"} tone="blue" />
            <SystemRow icon={HardDrive} label="Upload Root" value={data.application.uploadRoot} tone="blue" />
          </SystemCard>

          <SystemCard title="Host Information">
            <SystemRow icon={Server} label="Operating System" value={data.host.operatingSystem} detail={data.host.platform} tone="slate" />
            <SystemRow icon={Server} label="Hostname" value={data.host.hostname} tone="slate" />
            <SystemRow icon={Cpu} label="CPU Cores" value={String(data.host.cpuCores)} tone="slate" />
            <SystemRow icon={Cpu} label="Total RAM" value={formatBytes(data.host.totalRamBytes)} detail={`${formatBytes(ramUsed)} used`} tone="slate" />
            <SystemRow icon={HardDrive} label="Working Directory" value={data.host.workingDirectory} tone="slate" />
            <SystemRow icon={HardDrive} label="Configuration File" value={data.host.configurationFile ?? "Environment variables"} tone="slate" />
          </SystemCard>
        </div>

        <div className="space-y-5">
          <SystemCard title="Node.js">
            <SystemRow icon={Server} label="Runtime Version" value={data.runtime.nodeVersion} detail={`${data.runtime.platform} / PID ${data.runtime.pid}`} tone="green" />
            <SystemRow icon={RotateCw} label="Uptime" value={formatDuration(data.runtime.uptimeSeconds)} tone="green" />
          </SystemCard>

          <SystemCard title={data.database.provider.toUpperCase()}>
            <SystemRow
              icon={Database}
              label={data.database.status === "connected" ? "Connected" : "Unavailable"}
              value={data.database.version ?? "Version unavailable"}
              detail={data.database.databaseName ?? data.database.error ?? undefined}
              tone={data.database.status === "connected" ? "indigo" : "rose"}
            />
          </SystemCard>
        </div>
      </div>
    </div>
  );
}

function SystemCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white shadow-sm">
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="space-y-6 p-5">{children}</div>
    </section>
  );
}

function SystemRow({
  icon: Icon,
  label,
  value,
  detail,
  tone
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  tone: "blue" | "green" | "indigo" | "slate" | "rose";
}) {
  const colors = {
    blue: "bg-sky-500 text-white",
    green: "bg-emerald-500 text-white",
    indigo: "bg-indigo-600 text-white",
    slate: "bg-slate-500 text-white",
    rose: "bg-rose-600 text-white"
  };

  return (
    <div className="flex gap-4">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${colors[tone]}`}>
        <Icon size={20} />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-slate-950">{label}</p>
        <p className="break-words text-sm font-semibold text-slate-700">{value}</p>
        {detail ? <p className="break-words text-sm text-slate-500">{detail}</p> : null}
      </div>
    </div>
  );
}

function UsersAdmin({ data, run }: { data: AdminOverview; run: RunAction }) {
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" as Role, isActive: true });
  const [filter, setFilter] = useState("");
  const filteredUsers = data.users.filter((user) => [user.name, user.email, user.role, user.isActive ? "active" : "inactive"].some((value) => value.toLowerCase().includes(filter.toLowerCase())));

  function startCreate() {
    setEditing(null);
    setForm({ name: "", email: "", password: "Manuals123!", role: "user", isActive: true });
  }

  function startEdit(user: AdminUser) {
    setEditing(user);
    setForm({ name: user.name, email: user.email, password: "", role: user.role, isActive: user.isActive });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const payload = { ...form, password: form.password || undefined };
    await run(
      () => editing ? api(`/admin/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) }) : api("/admin/users", { method: "POST", body: JSON.stringify(form) }),
      editing ? "User updated." : "User created."
    );
    startCreate();
  }

  async function impersonate(user: AdminUser) {
    const response = await run(() => api<{ data: { token: string } }>(`/admin/users/${user.id}/impersonate`, { method: "POST" }), `Switching to ${user.name}.`) as { data: { token: string } } | undefined;
    if (!response?.data.token) return;
    setToken(response.data.token);
    window.location.href = "/app";
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
      <Card>
        <CardHeader><div className="flex items-center gap-2 text-sm font-semibold"><Plus size={17} />{editing ? "Update user" : "Create user"}</div></CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-3">
            <Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" /></Field>
            <Field label="Email"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="field" /></Field>
            <Field label={editing ? "New password" : "Password"}><input required={!editing} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="field" /></Field>
            <Field label="Role">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="field">
                {data.roles.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active
            </label>
            <div className="flex gap-2">
              <Button type="submit">{editing ? "Update user" : "Create user"}</Button>
              {editing ? <Button type="button" variant="secondary" onClick={startCreate}>Cancel</Button> : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold">Users</span>
            <label className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input value={filter} onChange={(event) => setFilter(event.target.value)} className="h-9 rounded-md border border-line bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-slate-400" placeholder="Filter users" />
            </label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-line">
            {filteredUsers.length ? filteredUsers.map((user) => (
              <div key={user.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_120px_110px_auto] lg:items-center">
                <div>
                  <p className="font-semibold text-slate-950">{user.name}</p>
                  <p className="text-sm text-slate-500">{user.email}</p>
                  <p className="mt-1 text-xs text-slate-500">{user.teamMemberships?.map((m) => m.team.name).join(", ") || "No teams"}</p>
                </div>
                <Badge value={user.role} />
                <span className={`text-sm font-semibold ${user.isActive ? "text-emerald-700" : "text-rose-700"}`}>{user.isActive ? "active" : "inactive"}</span>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => startEdit(user)}>Edit</Button>
                  <Button variant="secondary" onClick={() => run(() => api(`/admin/users/${user.id}/${user.isActive ? "deactivate" : "activate"}`, { method: "POST" }), user.isActive ? "User deactivated." : "User activated.")}>
                    {user.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                  </Button>
                  <Button variant="secondary" onClick={() => confirm(`Switch session to ${user.name}?`) && impersonate(user)} disabled={!user.isActive}><UserCog size={15} /></Button>
                  <Button variant="danger" onClick={() => confirm("Delete this user?") && run(() => api(`/admin/users/${user.id}`, { method: "DELETE" }), "User deleted.")}><Trash2 size={15} /></Button>
                </div>
              </div>
            )) : <div className="p-4"><EmptyState>No users match this filter.</EmptyState></div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamsAdmin({ data, run }: { data: AdminOverview; run: RunAction }) {
  const [teamForm, setTeamForm] = useState({ name: "", description: "", ownerId: "" });
  const [memberForm, setMemberForm] = useState({ teamId: "", userId: "", role: "member" });

  async function createTeam(event: React.FormEvent) {
    event.preventDefault();
    await run(() => api("/admin/teams", { method: "POST", body: JSON.stringify({ ...teamForm, ownerId: teamForm.ownerId || undefined }) }), "Team created.");
    setTeamForm({ name: "", description: "", ownerId: "" });
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    await run(() => api(`/admin/teams/${memberForm.teamId}/members`, { method: "POST", body: JSON.stringify({ userId: memberForm.userId, role: memberForm.role }) }), "Team member saved.");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader><div className="text-sm font-semibold">Create team</div></CardHeader>
          <CardContent>
            <form onSubmit={createTeam} className="space-y-3">
              <Field label="Name"><input required value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} className="field" /></Field>
              <Field label="Owner">
                <select value={teamForm.ownerId} onChange={(e) => setTeamForm({ ...teamForm, ownerId: e.target.value })} className="field">
                  <option value="">No owner</option>
                  {data.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </Field>
              <Field label="Description"><textarea value={teamForm.description} onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })} className="field min-h-20" /></Field>
              <Button>Create team</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div className="text-sm font-semibold">Add/update member</div></CardHeader>
          <CardContent>
            <form onSubmit={addMember} className="space-y-3">
              <Field label="Team">
                <select required value={memberForm.teamId} onChange={(e) => setMemberForm({ ...memberForm, teamId: e.target.value })} className="field">
                  <option value="">Select team</option>
                  {data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </Field>
              <Field label="User">
                <select required value={memberForm.userId} onChange={(e) => setMemberForm({ ...memberForm, userId: e.target.value })} className="field">
                  <option value="">Select user</option>
                  {data.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </Field>
              <Field label="Team role"><input value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} className="field" /></Field>
              <Button>Save member</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><div className="text-sm font-semibold">Teams</div></CardHeader>
        <CardContent className="space-y-3">
          {data.teams.map((team) => <TeamCard key={team.id} team={team} run={run} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamCard({ team, run }: { team: Team; run: RunAction }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-950">{team.name}</p>
          <p className="text-sm text-slate-500">{team.description || "No description."}</p>
          <p className="mt-1 text-xs text-slate-500">Owner: {team.owner?.name || "-"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => run(() => api(`/admin/teams/${team.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !team.isActive }) }), team.isActive ? "Team deactivated." : "Team activated.")}>{team.isActive ? "Deactivate" : "Activate"}</Button>
          <Button variant="danger" onClick={() => confirm("Delete this team?") && run(() => api(`/admin/teams/${team.id}`, { method: "DELETE" }), "Team deleted.")}><Trash2 size={15} /></Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(team.members ?? []).length ? team.members!.map((member) => (
          <span key={member.user.id} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs font-semibold text-slate-700">
            {member.user.name} / {member.role}
            <button onClick={() => run(() => api(`/admin/teams/${team.id}/members/${member.user.id}`, { method: "DELETE" }), "Member removed.")} className="text-rose-600">x</button>
          </span>
        )) : <span className="text-sm text-slate-500">No members.</span>}
      </div>
    </div>
  );
}

function PermissionsAdmin({ data, run }: { data: AdminOverview; run: RunAction }) {
  const [target, setTarget] = useState<"user" | "team" | "role">("team");
  const [form, setForm] = useState({ manualId: "", action: "read" as PermissionAction, userId: "", teamId: "", role: "user" as Role });

  const payload = useMemo(() => ({
    manualId: form.manualId,
    action: form.action,
    userId: target === "user" ? form.userId : undefined,
    teamId: target === "team" ? form.teamId : undefined,
    role: target === "role" ? form.role : undefined
  }), [form, target]);

  async function createPermission(event: React.FormEvent) {
    event.preventDefault();
    await run(() => api("/admin/permissions", { method: "POST", body: JSON.stringify(payload) }), "Permission grant created.");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
      <Card>
        <CardHeader><div className="text-sm font-semibold">Grant permission</div></CardHeader>
        <CardContent>
          <form onSubmit={createPermission} className="space-y-3">
            <Field label="Manual">
              <select required value={form.manualId} onChange={(e) => setForm({ ...form, manualId: e.target.value })} className="field">
                <option value="">Select manual</option>
                {data.manuals.map((manual) => <option key={manual.id} value={manual.id}>{manual.title}</option>)}
              </select>
            </Field>
            <Field label="Action">
              <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as PermissionAction })} className="field">
                {data.permissionActions.map((action) => <option key={action} value={action}>{action}</option>)}
              </select>
            </Field>
            <Field label="Target type">
              <select value={target} onChange={(e) => setTarget(e.target.value as "user" | "team" | "role")} className="field">
                <option value="team">Team</option>
                <option value="user">User</option>
                <option value="role">Role</option>
              </select>
            </Field>
            {target === "team" ? (
              <Field label="Team"><select required value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })} className="field"><option value="">Select team</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></Field>
            ) : null}
            {target === "user" ? (
              <Field label="User"><select required value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} className="field"><option value="">Select user</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
            ) : null}
            {target === "role" ? (
              <Field label="Role"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="field">{data.roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></Field>
            ) : null}
            <Button>Grant permission</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="text-sm font-semibold">Permission grants</div></CardHeader>
        <CardContent className="space-y-2">
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Manual</th>
                  {data.permissionActions.map((action) => <th key={action} className="px-3 py-2">{action}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.manuals.slice(0, 8).map((manual) => (
                  <tr key={manual.id}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{manual.title}</td>
                    {data.permissionActions.map((action) => {
                      const grants = data.permissions.filter((permission) => permission.manual?.id === manual.id && permission.action === action);
                      return <td key={action} className="px-3 py-2 text-xs text-slate-600">{grants.length ? grants.map((grant) => grant.team?.name ?? grant.user?.email ?? grant.role).join(", ") : "-"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.permissions.length ? data.permissions.map((permission) => (
            <div key={permission.id} className="grid gap-3 rounded-md border border-line p-3 lg:grid-cols-[minmax(0,1fr)_120px_auto] lg:items-center">
              <div>
                <p className="font-semibold text-slate-950">{permission.manual?.title ?? "Manual"}</p>
                <p className="text-sm text-slate-500">{permission.team?.name ?? permission.user?.email ?? permission.role ?? "Unknown target"}</p>
              </div>
              <Badge value={permission.action} />
              <Button variant="danger" onClick={() => confirm("Delete this permission?") && run(() => api(`/admin/permissions/${permission.id}`, { method: "DELETE" }), "Permission deleted.")}><Trash2 size={15} /></Button>
            </div>
          )) : <EmptyState>No permissions have been granted.</EmptyState>}
        </CardContent>
      </Card>
    </div>
  );
}

function ApiKeysAdmin({ data, run }: { data: AdminOverview; run: RunAction }) {
  const [form, setForm] = useState({ name: "", role: "user" as Role, expiresAt: "", rateLimitPerMinute: 60 });
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const access = data.apiAccess;

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    const response = await run(
      () => api<{ data: ApiKey }>("/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: form.name, role: form.role, expiresAt: form.expiresAt || undefined, rateLimitPerMinute: Number(form.rateLimitPerMinute) })
      }),
      "API key created."
    ) as { data: ApiKey } | undefined;
    if (!response?.data) return;
    setCreatedKey(response.data);
    setForm({ name: "", role: "user", expiresAt: "", rateLimitPerMinute: 60 });
    setCopied(false);
  }

  async function copyKey() {
    if (!createdKey?.key) return;
    await navigator.clipboard.writeText(createdKey.key);
    setCopied(true);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${access.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${access.enabled ? "bg-emerald-500" : "bg-rose-500"}`} />
                API {access.enabled ? "Enabled" : "Disabled"}
              </span>
              <span className="text-sm text-slate-500">{access.keys.filter((key) => key.isActive).length} active keys</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">API keys can authenticate with `X-API-Key` or `Authorization: ApiKey &lt;key&gt;`.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className={access.enabled ? undefined : "bg-emerald-600 hover:bg-emerald-700"}
              variant={access.enabled ? "secondary" : "primary"}
              onClick={() => run(() => api(`/admin/api-access/${access.enabled ? "disable" : "enable"}`, { method: "POST" }), access.enabled ? "API access disabled." : "API access enabled.")}
            >
              {access.enabled ? <PowerOff size={16} /> : <Power size={16} />}
              {access.enabled ? "Disable API" : "Enable API"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {createdKey?.key ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sky-950">Copy this key now. It will not be shown again.</p>
              <code className="mt-2 block overflow-x-auto rounded-md bg-white px-3 py-2 text-sm text-slate-900">{createdKey.key}</code>
            </div>
            <Button type="button" variant="secondary" onClick={copyKey}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy"}</Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
        <Card>
          <CardHeader><div className="flex items-center gap-2 text-sm font-semibold"><Plus size={17} />New API key</div></CardHeader>
          <CardContent>
            <form onSubmit={createKey} className="space-y-3">
              <Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" placeholder="CI deploy key" /></Field>
              <Field label="Role">
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="field">
                  {data.roles.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </Field>
              <Field label="Expires">
                <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="field" />
              </Field>
              <Field label="Rate limit / minute">
                <input type="number" min={1} max={10000} value={form.rateLimitPerMinute} onChange={(e) => setForm({ ...form, rateLimitPerMinute: Number(e.target.value) })} className="field" />
              </Field>
              <Button type="submit"><KeyRound size={16} />Create key</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div className="flex items-center justify-between"><span className="text-sm font-semibold">API keys</span><span className="text-xs text-slate-500">{access.keys.length} total</span></div></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-line">
              {access.keys.length ? access.keys.map((key) => (
                <div key={key.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_110px_130px_130px_120px_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{key.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{key.prefix}... / created by {key.createdBy?.name ?? "Unknown"}</p>
                  </div>
                  <Badge value={key.role} />
                  <span className={`text-sm font-semibold ${key.isActive ? "text-emerald-700" : "text-rose-700"}`}>{key.isActive ? "active" : "revoked"}</span>
                  <div className="text-sm text-slate-500">
                    <p>Last: {formatDate(key.lastUsedAt)}</p>
                    <p>Expires: {formatDate(key.expiresAt)}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{key.rateLimitPerMinute ?? 60}/min</span>
                  <Button
                    variant={key.isActive ? "danger" : "secondary"}
                    onClick={() => run(() => api(`/admin/api-keys/${key.id}/${key.isActive ? "revoke" : "activate"}`, { method: "POST" }), key.isActive ? "API key revoked." : "API key activated.")}
                  >
                    {key.isActive ? <Trash2 size={15} /> : <Power size={15} />}
                    {key.isActive ? "Revoke" : "Activate"}
                  </Button>
                </div>
              )) : <div className="p-4"><EmptyState>No API keys have been generated yet.</EmptyState></div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MailAdmin({ data, run }: { data: AdminOverview; run: RunAction }) {
  const settings = data.mailSettings;
  const [form, setForm] = useState({
    enabled: settings.enabled,
    senderName: settings.senderName || "Manuals",
    senderEmail: settings.senderEmail || "",
    host: settings.host || "",
    port: settings.port || 587,
    clientHostname: settings.clientHostname || "",
    secure: settings.secure,
    verifySsl: settings.verifySsl,
    username: settings.username || "",
    password: ""
  });
  const [testEmail, setTestEmail] = useState("");
  const hostInvalid = Boolean(form.host && (form.host.includes("@") || /^https?:\/\//i.test(form.host) || form.host.includes("/")));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (hostInvalid) return;
    await run(
      () => api("/admin/mail", {
        method: "PATCH",
        body: JSON.stringify({ ...form, password: form.password || undefined, port: Number(form.port) })
      }),
      "Mail settings saved."
    );
    setForm((current) => ({ ...current, password: "" }));
  }

  async function sendTest(event: React.FormEvent) {
    event.preventDefault();
    await run(
      () => api("/admin/mail/test", { method: "POST", body: JSON.stringify({ recipientEmail: testEmail }) }),
      "Test email sent."
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-sm font-semibold"><Mail size={17} />Mail configuration</div>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <label className="flex items-center gap-3 rounded-md border border-line bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
              Enable platform emails
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Sender name"><input required value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} className="field" /></Field>
              <Field label="Sender email"><input required type="email" value={form.senderEmail} onChange={(e) => setForm({ ...form, senderEmail: e.target.value })} className="field" /></Field>
              <Field label="SMTP host">
                <input
                  required
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  className={`field ${hostInvalid ? "border-rose-300 bg-rose-50 focus:border-rose-400" : ""}`}
                  placeholder="mail.renu.ac.ug"
                  aria-invalid={hostInvalid}
                />
                {hostInvalid ? <p className="mt-1 text-xs font-medium text-rose-700">Use the SMTP server hostname, not an email address or URL.</p> : null}
              </Field>
              <Field label="Port"><input required type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} className="field" /></Field>
              <Field label="Client identifying hostname"><input value={form.clientHostname} onChange={(e) => setForm({ ...form, clientHostname: e.target.value })} className="field" placeholder="mail.example.com" /></Field>
              <Field label="Username"><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="field" /></Field>
              <Field label={settings.hasPassword ? "Replace password" : "Password"}><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="field" placeholder={settings.hasPassword ? "Saved password is unchanged" : ""} /></Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-md border border-line px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.secure} onChange={(event) => setForm({ ...form, secure: event.target.checked })} />
                Secure TLS
              </label>
              <label className="flex items-center gap-3 rounded-md border border-line px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.verifySsl} onChange={(event) => setForm({ ...form, verifySsl: event.target.checked })} />
                Verify SSL certificate
              </label>
            </div>
            <p className="text-sm text-slate-500">Use port 465 with secure TLS, or port 587/25 without implicit TLS. Port 587 will upgrade with STARTTLS when the server supports it.</p>
            <Button type="submit" disabled={hostInvalid}><Mail size={16} />Save settings</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex items-center gap-2 text-sm font-semibold"><Send size={17} />Send a test email</div></CardHeader>
        <CardContent>
          <form onSubmit={sendTest} className="space-y-3">
            <p className="text-sm leading-6 text-slate-600">Send a test email to ensure your SMTP configuration is working.</p>
            <Field label="Recipient email address"><input required type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} className="field" /></Field>
            <Button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800"><Send size={16} />Send email</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditAdmin({ data }: { data: AdminOverview }) {
  const [eventFilter, setEventFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("");
  const eventTypes = Array.from(new Set(data.auditLogs.map((log) => log.event))).sort();
  const filteredLogs = data.auditLogs.filter((log) => {
    const matchesEvent = eventFilter === "all" || log.event === eventFilter;
    const actorText = `${log.actor?.name ?? "System"} ${log.actor?.email ?? ""}`.toLowerCase();
    const matchesActor = !actorFilter.trim() || actorText.includes(actorFilter.toLowerCase());
    return matchesEvent && matchesActor;
  });
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck size={17} /> Audit events
          </div>
          <span className="rounded-full border border-line bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{filteredLogs.length} shown</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
          <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} className="field">
            <option value="all">All events</option>
            {eventTypes.map((event) => <option key={event} value={event}>{event.replaceAll("_", " ")}</option>)}
          </select>
          <input value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} className="field" placeholder="Filter by actor" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-line">
          {filteredLogs.length ? filteredLogs.map((log) => (
            <div key={log.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_160px_140px] lg:items-center">
              <div className="min-w-0">
                <p className="font-semibold text-slate-950">{log.event.replaceAll("_", " ")}</p>
                <p className="mt-1 text-sm text-slate-500">{log.entityType || "system"}{log.entityId ? ` / ${log.entityId}` : ""}</p>
              </div>
              <p className="text-sm text-slate-600">{log.actor?.name ?? "System"}</p>
              <p className="text-sm text-slate-500">{formatDate(log.createdAt)}</p>
            </div>
          )) : <div className="p-4"><EmptyState>No audit events match these filters.</EmptyState></div>}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
