
/** EthioHire — Recruiter job posts management (list + status control) */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, SectionTitle } from "@/components/ethiohire/bits";
import { apiJson } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { toast } from "@/hooks/use-toast";
import { daysLeftLabel, formatDateTime, formatETB, JOB_TYPES } from "@/lib/constants";
import { CalendarClock, CalendarX2, Pencil, Plus, Trash2, Users } from "lucide-react";

interface Job {
  id: string;
  title: string;
  status: string;
  category: string | null;
  location: string | null;
  jobType: string | null;
  minGpa: number | null;
  minExperienceYears: number;
  salaryBudgetMin: number | null;
  salaryBudgetMax: number | null;
  createdAt: string;
  postingStartDate: string | null;
  applicationDeadline: string | null;
  daysPosted: number;
  daysRemaining: number | null;
  applicationOpen: boolean;
  company: { companyName: string };
  _count: { applications: number };
}

export function RecruiterJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await apiJson<{ jobs: Job[] }>("/api/jobs?mine=1");
      setJobs(d.jobs);
    } catch {
      /* session issue — central 401 handler manages the fallback */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (job: Job, status: string) => {
    try {
      await apiJson(`/api/jobs/${job.id}`, { method: "PUT", body: JSON.stringify({ status }) });
      toast({ title: `Job ${status.toLowerCase()}`, description: job.title });
      load();
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const remove = async (job: Job) => {
    try {
      await apiJson(`/api/jobs/${job.id}`, { method: "DELETE" });
      toast({ title: "Job deleted" });
      load();
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading job posts…</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job posts</h1>
          <p className="text-sm text-muted-foreground">Configure the posting window, screening thresholds, question banks, exam sessions and interview slots per posting.</p>
        </div>
        <Button onClick={() => navigate("/recruiter/jobs/new")}><Plus className="mr-1 h-4 w-4" /> New job posting</Button>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No job postings yet"
          body="Create your first posting — define hard requirements (GPA, graduation window, experience, budget), a knockout questionnaire and the proctored exam question bank."
          action={<Button onClick={() => navigate("/recruiter/jobs/new")}><Plus className="mr-1 h-4 w-4" /> Create job posting</Button>}
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <Card key={j.id}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{j.title}</h3>
                      <Badge variant={j.status === "OPEN" ? "default" : j.status === "DRAFT" ? "secondary" : "outline"}>{j.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {j.category || "General"} · {j.location || "—"} · {JOB_TYPES.find((t) => t.value === j.jobType)?.label || j.jobType} · posted {formatDateTime(j.createdAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-xs">GPA ≥ {j.minGpa ?? "—"}</Badge>
                      <Badge variant="secondary" className="text-xs">{j.minExperienceYears}+ yr</Badge>
                      {j.salaryBudgetMax ? <Badge variant="secondary" className="text-xs">≤ {formatETB(j.salaryBudgetMax)}</Badge> : null}
                      <Badge variant="secondary" className="text-xs"><Users className="mr-1 inline h-3 w-3" />{j._count.applications} applicants</Badge>
                      {/* application lifecycle (Feature 2) */}
                      {j.applicationDeadline ? (
                        j.applicationOpen ? (
                          <Badge
                            variant="outline"
                            className={
                              j.daysRemaining !== null && j.daysRemaining <= 3
                                ? "border-red-200 bg-red-50 text-red-700"
                                : j.daysRemaining !== null && j.daysRemaining <= 7
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            }
                          >
                            <CalendarClock className="mr-1 inline h-3 w-3" />
                            {j.daysRemaining !== null && j.daysRemaining <= 0 ? "Closes today" : `${daysLeftLabel(j.daysRemaining)} · deadline ${formatDateTime(j.applicationDeadline)}`}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                            <CalendarX2 className="mr-1 inline h-3 w-3" /> Applications closed · {formatDateTime(j.applicationDeadline)}
                          </Badge>
                        )
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/recruiter/jobs/${j.id}`)}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
                    {j.status === "OPEN" ? (
                      <Button variant="secondary" size="sm" onClick={() => setStatus(j, "CLOSED")}>Close</Button>
                    ) : j.status === "CLOSED" || j.status === "DRAFT" ? (
                      <Button variant="secondary" size="sm" onClick={() => setStatus(j, "OPEN")}>Open</Button>
                    ) : null}
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Delete ${j.title}`} onClick={() => remove(j)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
