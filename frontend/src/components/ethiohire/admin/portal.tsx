
/** EthioHire — System Admin portal: analytics, company verification,
 *  subscription & fee management, audit/security logs. */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard, EmptyState, SectionTitle } from "@/components/ethiohire/bits";
import { apiJson } from "@/lib/auth-client";
import { toast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/constants";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Building2, CheckCircle2, ClipboardList, CreditCard, FileSearch, GraduationCap,
  Mail, MessageSquare, Radio, ScrollText, ShieldCheck, Users, Video, XCircle,
} from "lucide-react";

// ---------------------------------------------------------------- Overview
export function AdminOverview() {
  const [data, setData] = useState<{
    totals: Record<string, number>;
    funnel: Record<string, number>;
    statusCounts: { status: string; count: number }[];
    proctoring: { eventType: string; count: number }[];
    recentAudit: { id: string; actorEmail: string | null; action: string; entity: string | null; createdAt: string }[];
  } | null>(null);

  useEffect(() => {
    apiJson<typeof data>("/api/admin/analytics").then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="py-20 text-center text-sm text-muted-foreground">Loading analytics…</div>;

  const funnelData = [
    { stage: "Applied", value: data.funnel.applied },
    { stage: "Pre-screen", value: data.funnel.preScreenPassed },
    { stage: "Exam passed", value: data.funnel.examPassed },
    { stage: "Interview", value: data.funnel.interviews },
    { stage: "Hired", value: data.funnel.hired },
  ];
  const PROCTOR_COLORS = ["#15803d", "#d97706", "#dc2626", "#0d9488", "#65a30d", "#7c3aed", "#db2777"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform overview</h1>
        <p className="text-sm text-muted-foreground">Usage analytics across companies, jobs and the full selection funnel.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Users" value={data.totals.users} hint={`${data.totals.candidates} candidates · ${data.totals.recruiters} recruiters`} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Companies" value={data.totals.approvedCompanies} hint={`${data.totals.proPlans} on paid plans`} icon={<Building2 className="h-4 w-4" />} />
        <StatCard label="Jobs" value={data.totals.openJobs} hint={`${data.totals.jobs} total · ${data.totals.openJobs} open`} icon={<FileSearch className="h-4 w-4" />} />
        <StatCard label="Applications" value={data.totals.applications} hint="Lifetime submissions" icon={<ClipboardList className="h-4 w-4" />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-sm font-semibold">Selection funnel</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.01 140)" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <ChartTooltip />
                  <Bar dataKey="value" fill="#15803d" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-sm font-semibold">Proctoring integrity events</p>
            {data.proctoring.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No proctoring events recorded yet.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.proctoring} dataKey="count" nameKey="eventType" innerRadius={50} outerRadius={85} paddingAngle={3}>
                      {data.proctoring.map((_, i) => <Cell key={i} fill={PROCTOR_COLORS[i % PROCTOR_COLORS.length]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ChartTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <SectionTitle sub="Most recent platform activity (from the audit log).">Recent activity</SectionTitle>
        <div className="space-y-2">
          {data.recentAudit.map((l: { id: string; actorEmail: string | null; action: string; entity: string | null; createdAt: string }) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{l.action}</Badge>
                <span className="text-xs text-muted-foreground">{l.entity}</span>
              </div>
              <span className="text-xs text-muted-foreground">{l.actorEmail} · {formatDateTime(l.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Companies
export function AdminCompanies() {
  const [companies, setCompanies] = useState<{
    id: string; companyName: string; industry: string | null; verificationStatus: string; subscriptionPlan: string;
    user: { email: string; name: string }; _count: { jobs: number };
  }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await apiJson<{ companies: typeof companies }>("/api/admin/companies");
      setCompanies(d.companies);
    } catch {
      /* session issue — central 401 handler manages the fallback */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (companyId: string, verificationStatus: string) => {
    await apiJson("/api/admin/companies", { method: "PATCH", body: JSON.stringify({ companyId, verificationStatus }) });
    toast({ title: `Company ${verificationStatus.toLowerCase()}`, description: "The recruiter has been notified." });
    load();
  };

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading companies…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Company verification</h1>
        <p className="text-sm text-muted-foreground">Approve or suspend recruiter companies — only approved companies can post jobs.</p>
      </div>
      <div className="space-y-3">
        {companies.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{c.companyName}</p>
                  <Badge
                    variant="outline"
                    className={c.verificationStatus === "APPROVED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : c.verificationStatus === "SUSPENDED" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}
                  >
                    {c.verificationStatus}
                  </Badge>
                  <Badge variant="secondary">{c.subscriptionPlan}</Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">{c.user.email} · {c.industry || "—"} · {c._count.jobs} jobs</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {c.verificationStatus !== "APPROVED" ? (
                  <Button size="sm" onClick={() => setStatus(c.id, "APPROVED")}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve</Button>
                ) : null}
                {c.verificationStatus !== "SUSPENDED" ? (
                  <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setStatus(c.id, "SUSPENDED")}>
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Suspend
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setStatus(c.id, "APPROVED")}>Re-approve</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Subscriptions
export function AdminSubscriptions() {
  const [settings, setSettings] = useState<{ id: string; key: string; value: string }[]>([]);
  const [plans, setPlans] = useState<{ plan: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFee, setNewFee] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiJson<{ settings: typeof settings; plans: typeof plans }>("/api/admin/settings");
      setSettings(d.settings);
      setPlans(d.plans);
    } catch {
      /* session issue — central 401 handler manages the fallback */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (key: string, value: string) => {
    await apiJson("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ key, value }) });
    toast({ title: "Setting updated", description: `${key} → ${value}` });
    load();
  };

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading settings…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscriptions & fees</h1>
        <p className="text-sm text-muted-foreground">Configure platform commission and subscription pricing (ETB, local payment rails).</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="mb-1 flex items-center gap-2 font-bold"><CreditCard className="h-[18px] w-[18px] text-primary" /> Plan distribution</p>
            <div className="mt-3 space-y-2">
              {["FREE", "PRO", "ENTERPRISE"].map((p) => {
                const count = plans.find((x) => x.plan === p)?.count ?? 0;
                const total = plans.reduce((s, x) => s + x.count, 0) || 1;
                return (
                  <div key={p} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-semibold">{p}</p>
                      <p className="text-[11px] text-muted-foreground">{p === "FREE" ? "Pay per posting" : p === "PRO" ? "Unlimited postings + analytics" : "Dedicated support + SLA"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                      <span className="w-6 text-right text-sm font-bold tabular-nums">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="mb-1 flex items-center gap-2 font-bold"><ScrollText className="h-[18px] w-[18px] text-primary" /> Platform settings</p>
            <div className="mt-3 space-y-2">
              {settings.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{s.key.replace(/_/g, " ")}</p>
                    <p className="text-[11px] text-muted-foreground">{s.value}</p>
                  </div>
                  {s.key === "platform_fee_percent" ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Input className="h-8 w-16" value={newFee || s.value} onChange={(e) => setNewFee(e.target.value)} aria-label="New fee percent" />
                      <Button size="sm" variant="secondary" className="h-8" onClick={() => newFee && save(s.key, newFee)}>Set</Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Payment integrations (Telebirr, Chapa, CBE Birr) plug into the outbox worker in production — see the deployment guides.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// --------------------------------------------- Notification delivery log
interface NotificationLogRow {
  id: string;
  decisionPoint: string;
  channel: "EMAIL" | "SMS";
  recipient: string;
  subject: string | null;
  status: "SENT" | "FAILED" | "SKIPPED";
  providerId: string | null;
  error: string | null;
  user: { email: string } | null;
  createdAt: string;
}

interface ProviderState { email: string; sms: string; livekit: string }

export function AdminNotifications() {
  const [logs, setLogs] = useState<NotificationLogRow[]>([]);
  const [providers, setProviders] = useState<ProviderState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson<{ logs: NotificationLogRow[]; providers: ProviderState }>("/api/admin/notification-logs?take=200")
      .then((d) => { setLogs(d.logs); setProviders(d.providers); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading delivery log…</div>;

  const statusBadge = (s: NotificationLogRow["status"]) =>
    s === "SENT" ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">SENT</Badge>
    : s === "FAILED" ? <Badge className="border-red-200 bg-red-50 text-red-700" variant="outline">FAILED</Badge>
    : <Badge className="border-amber-200 bg-amber-50 text-amber-700" variant="outline">SKIPPED</Badge>;

  const providerPill = (label: string, value: string | undefined, ok: boolean) => (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2" data-testid={`provider-${label.toLowerCase()}`}>
      <span className="text-xs font-semibold">{label}</span>
      {ok ? (
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" />{value}</Badge>
      ) : (
        <Badge className="border-amber-200 bg-amber-50 text-amber-700" variant="outline"><XCircle className="mr-1 h-3 w-3" />{value}</Badge>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reporting &amp; Decisioning notifications</h1>
        <p className="text-sm text-muted-foreground">
          Delivery log for every automated email/SMS emitted at a decision point — evaluation summaries, match
          scores, proctoring audit reports, interview invitations and status updates.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {providerPill("Email (Resend)", providers?.email || "—", providers?.email === "resend")}
        {providerPill("SMS gateway", providers?.sms || "—", providers?.sms === "webhook")}
        {providerPill("LiveKit video", providers?.livekit || "—", providers?.livekit === "configured")}
      </div>

      {logs.length === 0 ? (
        <EmptyState title="No notifications yet" body="Decision-point emails appear here as soon as applications, exams or interviews generate them." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="eh-scroll max-h-[70vh] divide-y overflow-y-auto">
              {logs.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm" data-testid={`delivery-${l.id}`}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    {l.channel === "EMAIL" ? <Mail className="h-4 w-4 shrink-0 text-primary/60" /> : <MessageSquare className="h-4 w-4 shrink-0 text-primary/60" />}
                    <div className="min-w-0">
                      <p className="text-xs font-bold">{l.decisionPoint} · {l.channel}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {l.subject || "—"} → {l.recipient}{l.user ? ` (${l.user.email})` : ""}
                      </p>
                      {l.error ? <p className="truncate text-[11px] text-amber-700/80">{l.error}</p> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(l.status)}
                    <p className="text-[11px] text-muted-foreground">{formatDateTime(l.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Audit log
export function AdminAudit() {
  const [logs, setLogs] = useState<{ id: string; actorEmail: string | null; action: string; entity: string | null; details: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson<{ logs: typeof logs }>("/api/admin/audit?take=200").then((d) => setLogs(d.logs)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading audit trail…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit & security logs</h1>
        <p className="text-sm text-muted-foreground">Immutable trail of every privileged action on the platform.</p>
      </div>
      {logs.length === 0 ? (
        <EmptyState title="No audit entries yet" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="eh-scroll max-h-[70vh] divide-y overflow-y-auto">
              {logs.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-primary/60" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold">{l.action}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{l.entity || "—"}{l.details ? ` · ${l.details}` : ""}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{l.actorEmail || "system"} · {formatDateTime(l.createdAt)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
