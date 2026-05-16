"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Mail, Plus, Power, PowerOff, Send, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { AdminOverview, AdminUser, ApiKey, PermissionAction, Role, Team } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type Tab = "users" | "teams" | "permissions" | "api-keys" | "mail";
type RunAction = (action: () => Promise<unknown>, success: string) => Promise<unknown>;

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-line bg-slate-50 p-5 text-sm text-slate-500">{children}</div>;
}

function ErrorState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{children}</div>;
}

export function AdminManagementPanel() {
  const [tab, setTab] = useState<Tab>("users");
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
          <h1 className="text-2xl font-semibold text-slate-950">Admin</h1>
          <p className="mt-1 text-sm text-slate-600">Manage users, roles, teams, and permission grants.</p>
        </div>
        {message ? <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</span> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active users" value={activeUsers} icon={Users} />
        <Metric label="Teams" value={data.teams.length} icon={UserCheck} />
        <Metric label="API keys" value={data.apiAccess.keys.length} icon={KeyRound} />
        <Metric label="Mail status" value={data.mailSettings.enabled ? "Enabled" : "Off"} icon={Mail} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["users", "teams", "permissions", "api-keys", "mail"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`rounded-md border px-4 py-2 text-sm font-semibold ${tab === item ? "border-slate-950 bg-slate-950 text-white" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {item.replace("-", " ")}
          </button>
        ))}
      </div>

      {tab === "users" ? <UsersAdmin data={data} run={run} /> : null}
      {tab === "teams" ? <TeamsAdmin data={data} run={run} /> : null}
      {tab === "permissions" ? <PermissionsAdmin data={data} run={run} /> : null}
      {tab === "api-keys" ? <ApiKeysAdmin data={data} run={run} /> : null}
      {tab === "mail" ? <MailAdmin data={data} run={run} /> : null}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Users }) {
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

function UsersAdmin({ data, run }: { data: AdminOverview; run: RunAction }) {
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" as Role, isActive: true });

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
        <CardHeader><div className="flex items-center justify-between"><span className="text-sm font-semibold">Users</span><span className="text-xs text-slate-500">{data.users.length} total</span></div></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-line">
            {data.users.map((user) => (
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
                  <Button variant="danger" onClick={() => confirm("Delete this user?") && run(() => api(`/admin/users/${user.id}`, { method: "DELETE" }), "User deleted.")}><Trash2 size={15} /></Button>
                </div>
              </div>
            ))}
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
  const [form, setForm] = useState({ name: "", role: "user" as Role, expiresAt: "" });
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const access = data.apiAccess;

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    const response = await run(
      () => api<{ data: ApiKey }>("/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: form.name, role: form.role, expiresAt: form.expiresAt || undefined })
      }),
      "API key created."
    ) as { data: ApiKey } | undefined;
    if (!response?.data) return;
    setCreatedKey(response.data);
    setForm({ name: "", role: "user", expiresAt: "" });
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
              <Button type="submit"><KeyRound size={16} />Create key</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div className="flex items-center justify-between"><span className="text-sm font-semibold">API keys</span><span className="text-xs text-slate-500">{access.keys.length} total</span></div></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-line">
              {access.keys.length ? access.keys.map((key) => (
                <div key={key.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_110px_130px_130px_auto] lg:items-center">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
