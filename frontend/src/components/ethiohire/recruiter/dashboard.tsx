
/** EthioHire — Recruiter/HR dashboard */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard, StatusBadge, SectionTitle, EmptyState, ScoreRing } from "@/components/ethiohire/bits";
import { apiJson } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { formatDateTime } from "@/lib/constants";
import { Briefcase, CheckCircle2, Plus, Users, Video, XCircle, ShieldAlert } from "lucide-react";

interface AppRow {
  id: string;
  status: string;
  matchScore: number;
  examScore: number | null;
  violationCount: number;
  createdAt: string;
  job: { id: string; title: string };
  candidate: { fullName: string; universityName: string | null; gpa: number | null };
}

export function RecruiterDashboard() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string; status: string; _count: { applications: number } }[]>([]);
  const [company, setCompany] = useState<{ companyName: string; verificationStatus: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiJson<{ applications: AppRow[] }>("/api/applications").catch(() => ({ applications: [] as AppRow[] })),
      apiJson<{ jobs: { id: string; title: string; status: string; _count: { applications: number } }[] }>("/api/jobs?mine=1").catch(() => ({ jobs: [] as { id: string; title: string; status: string; _count: { applications: number } }[] })),
      apiJson<{ company: { companyName: string; verificationStatus: string } }>("/api/recruiter/company").catch(() => null),
    ])
      .then(([a, j, c]) => {
        setApps(a.applications);
        setJobs(j.jobs);
        if (c) setCompany(c.company);
      })
      .finally(() => setLoading(false));
  }, []);

  const qualified = apps.filter((a) => a.status !== "PRE_SCREEN_REJECTED" && a.status !== "REJECTED");
  const flagged = apps.filter((a) => a.violationCount > 0);
  const interviews = apps.filter((a) => ["INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED"].includes(a.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{company?.companyName || "Company"} dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {company?.verificationStatus === "APPROVED"
              ? "Your company is verified — post jobs and screen candidates automatically."
              : company?.verificationStatus === "SUSPENDED"
                ? "Company account suspended — contact the platform admin."
                : "Company verification pending — the platform admin will review your account."}
          </p>
        </div>
        {company?.verificationStatus === "APPROVED" ? (
          <Button onClick={() => navigate("/recruiter/jobs/new")}><Plus className="mr-1 h-4 w-4" /> Post a job</Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Open jobs" value={jobs.filter((j) => j.status === "OPEN").length} icon={<Briefcase className="h-4 w-4" />} hint={`${jobs.length} total postings`} />
        <StatCard label="Qualified applicants" value={qualified.length} icon={<CheckCircle2 className="h-4 w-4" />} hint="Passed pre-screening" />
        <StatCard label="Interviews" value={interviews.length} icon={<Video className="h-4 w-4" />} hint="Scheduled or completed" />
        <StatCard label="Proctoring flags" value={flagged.length} icon={<ShieldAlert className="h-4 w-4" />} hint="Candidates with violations" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle sub="Newest applications across all your job posts.">Recent applicants</SectionTitle>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : apps.length === 0 ? (
            <EmptyState title="No applicants yet" body="Post a job with screening thresholds and the funnel will start filling automatically." action={<Button onClick={() => navigate("/recruiter/jobs/new")}><Plus className="mr-1 h-4 w-4" /> Post a job</Button>} />
          ) : (
            <div className="space-y-3">
              {apps.slice(0, 6).map((a) => (
                <Card key={a.id} className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => navigate("/recruiter/applicants")}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <ScoreRing score={a.matchScore} size={54} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{a.candidate.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.job.title} · {a.candidate.universityName || "—"} · GPA {a.candidate.gpa ?? "—"}</p>
                    </div>
                    <StatusBadge status={a.status} />
                    {a.violationCount > 0 ? <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-label={`${a.violationCount} violations`} /> : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionTitle sub="Quick access to your postings.">My job posts</SectionTitle>
          <div className="space-y-3">
            {jobs.length === 0 ? (
              <EmptyState title="No jobs yet" />
            ) : (
              jobs.map((j) => (
                <Card key={j.id} className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => navigate(`/recruiter/jobs/${j.id}`)}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{j.title}</p>
                      <p className="text-xs text-muted-foreground"><Users className="mr-1 inline h-3 w-3" />{j._count.applications} applicants</p>
                    </div>
                    <Badge variant={j.status === "OPEN" ? "default" : "secondary"}>{j.status}</Badge>
                  </CardContent>
                </Card>
              ))
            )}
            <Button variant="outline" className="w-full" onClick={() => navigate("/recruiter/jobs")}>Manage all jobs</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
