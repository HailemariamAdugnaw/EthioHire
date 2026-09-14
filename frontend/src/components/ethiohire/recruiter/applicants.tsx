
/** EthioHire — Recruiter applicant review: proctoring audit logs, exam scores,
 *  pre-screening checks and decision actions (shortlist / reject / schedule). */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ScoreRing, StatusBadge } from "@/components/ethiohire/bits";
import { apiJson } from "@/lib/auth-client";
import { toast } from "@/hooks/use-toast";
import { formatDateTime, PROCTORING_EVENT_LABELS } from "@/lib/constants";
import { CalendarPlus, CheckCheck, FileWarning, ShieldAlert, ThumbsDown, Users, X } from "lucide-react";

interface AppRow {
  id: string;
  status: string;
  matchScore: number;
  examScore: number | null;
  examStatus: string | null;
  violationCount: number;
  rejectReason: string | null;
  createdAt: string;
  examSession: { scheduledAt: string; durationMinutes: number; releaseMode: string; resultsReleasedAt: string | null } | null;
  job: { id: string; title: string };
  candidate: { fullName: string; universityName: string | null; degreeLevel: string | null; gpa: number | null; graduationYear: number | null; expectedSalary: number | null; experienceYears: number | null; skills: string | null; user: { email: string } };
  interviewSchedules: { id: string; scheduledTime: string; status: string }[];
}

export function RecruiterApplicants() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [detail, setDetail] = useState<AppRow | null>(null);
  const [audit, setAudit] = useState<{ logs: { id: string; eventType: string; details: string | null; createdAt: string; snapshotUrl: string | null }[]; checks: { label: string; passed: boolean; detail: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);

  // schedule form
  const [ivTime, setIvTime] = useState("");
  const [ivFormat, setIvFormat] = useState("VIDEO");
  const [ivLink, setIvLink] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiJson<{ applications: AppRow[] }>("/api/applications");
      setApps(d.applications);
    } catch {
      /* session issue — central 401 handler manages the fallback */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (a: AppRow) => {
    setDetail(a);
    setAudit(null);
    setIvTime("");
    setIvFormat("VIDEO");
    setIvLink("");
    try {
      const d = await apiJson<{ application: Record<string, unknown> }>(`/api/applications/${a.id}`);
      const app = d.application as unknown as {
        proctoringLogs: { id: string; eventType: string; details: string | null; createdAt: string; snapshotUrl: string | null }[];
        knockoutAnswers: string | null;
        job: { minGpa: number | null; targetGradYearStart: number | null; targetGradYearEnd: number | null; minExperienceYears: number; salaryBudgetMin: number | null; salaryBudgetMax: number | null };
        candidate: { gpa: number | null; graduationYear: number | null; degreeLevel: string | null; experienceYears: number | null; expectedSalary: number | null; skills: string | null };
      };
      const logs = app.proctoringLogs;
      // reconstruct pre-screen checks from stored data
      const checks = buildChecks(app.job, app.candidate);
      setAudit({ logs, checks });
    } catch {
      setAudit({ logs: [], checks: [] });
    }
  };

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!detail) return;
    setBusy(true);
    try {
      await apiJson(`/api/applications/${detail.id}`, { method: "PATCH", body: JSON.stringify({ action, ...extra }) });
      toast({ title: "Decision recorded", description: `${action.replace("_", " ").toLowerCase()} — candidate notified via email/SMS outbox.` });
      setDetail(null);
      load();
    } catch (err) {
      toast({ title: "Action failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const filtered = filter === "ALL" ? apps : apps.filter((a) => a.status === filter);
  const FILTERS = ["ALL", "APPLIED", "EXAM_PASSED", "EXAM_FAILED", "EXAM_TERMINATED", "INTERVIEW_SCHEDULED", "SHORTLISTED", "REJECTED", "PRE_SCREEN_REJECTED"];

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading applicants…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Applicants</h1>
        <p className="text-sm text-muted-foreground">Review match scores, exam results and proctoring audit logs — then decide.</p>
      </div>

      <div className="eh-scroll flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:border-primary/40"}`}
          >
            {f.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No applicants in this view" body="Try a different status filter, or wait for candidates to apply." />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <Card key={a.id} className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => openDetail(a)}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <ScoreRing score={a.matchScore} size={58} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{a.candidate.fullName}</p>
                    <StatusBadge status={a.status} />
                    {a.violationCount > 0 ? (
                      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700"><ShieldAlert className="mr-1 h-3 w-3" />{a.violationCount} violation(s)</Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.job.title} · {a.candidate.universityName || "—"} · GPA {a.candidate.gpa ?? "—"} · {a.candidate.experienceYears ?? 0} yr exp
                  </p>
                  <p className="text-xs text-muted-foreground">Applied {formatDateTime(a.createdAt)}{a.examScore !== null ? ` · exam ${a.examScore}%` : ""}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* -------- detail dialog -------- */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="eh-scroll max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">{detail.candidate.fullName} <StatusBadge status={detail.status} /></DialogTitle>
                <DialogDescription>
                  {detail.job.title} · {detail.candidate.user.email} · applied {formatDateTime(detail.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* profile summary */}
                <div className="grid grid-cols-2 gap-2 rounded-xl border p-3 text-sm sm:grid-cols-4">
                  <div><p className="text-[11px] text-muted-foreground">GPA</p><p className="font-bold">{detail.candidate.gpa ?? "—"}</p></div>
                  <div><p className="text-[11px] text-muted-foreground">Degree</p><p className="font-bold">{detail.candidate.degreeLevel || "—"}</p></div>
                  <div><p className="text-[11px] text-muted-foreground">Graduated</p><p className="font-bold">{detail.candidate.graduationYear ?? "—"}</p></div>
                  <div><p className="text-[11px] text-muted-foreground">Experience</p><p className="font-bold">{detail.candidate.experienceYears ?? 0} yr</p></div>
                  <div className="col-span-2"><p className="text-[11px] text-muted-foreground">Expected salary</p><p className="font-bold">{detail.candidate.expectedSalary ? `ETB ${detail.candidate.expectedSalary.toLocaleString()}` : "—"}</p></div>
                  <div className="col-span-2"><p className="text-[11px] text-muted-foreground">Skills</p><p className="text-xs font-medium leading-relaxed">{detail.candidate.skills || "—"}</p></div>
                </div>

                {/* exam results */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Proctored assessment</p>
                    <p className="text-lg font-bold">
                      {detail.examScore !== null ? `${detail.examScore}%` : "Not taken"}
                      {detail.examStatus ? <span className="ml-2 text-sm font-medium text-muted-foreground">{detail.examStatus}</span> : null}
                    </p>
                    {detail.examSession?.releaseMode === "MANUAL" ? (
                      <p className="mt-1 text-xs text-amber-700">
                        {detail.examSession.resultsReleasedAt
                          ? "Results were released to the candidate."
                          : "Result visibility is manual — the candidate cannot see their score until you release it from the job editor."}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Match score</span>
                    <ScoreRing score={detail.matchScore} size={48} />
                  </div>
                </div>

                {/* pre-screen checks */}
                {audit && audit.checks.length > 0 ? (
                  <div>
                    <p className="mb-2 text-sm font-semibold">Pre-screening checklist</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {audit.checks.map((c) => (
                        <div key={c.label} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
                          <span className="font-medium">{c.label}</span>
                          <Badge variant="outline" className={c.passed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>{c.passed ? "Pass" : "Fail"}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* proctoring audit */}
                <div>
                  <p className="mb-2 text-sm font-semibold">Proctoring audit log</p>
                  {audit && audit.logs.length > 0 ? (
                    <div className="eh-scroll max-h-64 space-y-2 overflow-y-auto pr-1">
                      {audit.logs.map((l) => (
                        <div key={l.id} className="flex items-start gap-2.5 rounded-lg border p-2.5">
                          {l.snapshotUrl ? (
                            <img src={l.snapshotUrl} alt="Webcam snapshot" className="h-14 w-20 shrink-0 rounded-md border object-cover" />
                          ) : (
                            <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold">{PROCTORING_EVENT_LABELS[l.eventType] || l.eventType}</p>
                            {l.details ? <p className="truncate text-[11px] text-muted-foreground">{l.details}</p> : null}
                            <p className="text-[10px] text-muted-foreground/70">{formatDateTime(l.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No proctoring events recorded.</p>
                  )}
                </div>

                {/* actions */}
                <DialogFooter className="flex-col gap-2 sm:flex-col">
                  <div className="grid w-full gap-2 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="iv-time" className="text-xs">Interview date & time</Label>
                      <Input id="iv-time" type="datetime-local" min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} value={ivTime} onChange={(e) => setIvTime(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Format</Label>
                      <Select value={ivFormat} onValueChange={setIvFormat}>
                        <SelectTrigger aria-label="Format"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VIDEO">Video call</SelectItem>
                          <SelectItem value="VOICE">Voice call</SelectItem>
                          <SelectItem value="ONSITE">On-site</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="iv-link" className="text-xs">Meeting link (optional — auto-generated if empty)</Label>
                      <Input id="iv-link" placeholder="https://meet…" value={ivLink} onChange={(e) => setIvLink(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap gap-2">
                    <Button className="flex-1" onClick={() => act("SCHEDULE_INTERVIEW", { scheduledTime: ivTime ? new Date(ivTime).toISOString() : null, format: ivFormat, meetingLink: ivLink })} disabled={busy || !ivTime} title={!ivTime ? "Pick a date & time first" : undefined}>
                      <CalendarPlus className="mr-1 h-4 w-4" /> Schedule interview
                    </Button>
                    <Button variant="secondary" className="flex-1" onClick={() => act("SHORTLIST")} disabled={busy}>
                      <CheckCheck className="mr-1 h-4 w-4" /> Shortlist
                    </Button>
                    <Button variant="outline" className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => act("REJECT", { reason: "Did not meet the bar during review." })} disabled={busy}>
                      <X className="mr-1 h-4 w-4" /> Reject
                    </Button>
                    {detail.status === "INTERVIEW_COMPLETED" || detail.status === "SHORTLISTED" ? (
                      <Button className="flex-1" variant="default" onClick={() => act("MARK_HIRED")} disabled={busy}>
                        <ThumbsDown className="hidden" /> Mark hired
                      </Button>
                    ) : null}
                  </div>
                </DialogFooter>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// rebuild the pre-screen checklist for display
function buildChecks(
  job: { minGpa: number | null; targetGradYearStart: number | null; targetGradYearEnd: number | null; minExperienceYears: number; salaryBudgetMin: number | null; salaryBudgetMax: number | null },
  c: { gpa: number | null; graduationYear: number | null; experienceYears: number | null; expectedSalary: number | null }
) {
  const checks: { label: string; passed: boolean; detail: string }[] = [];
  checks.push({ label: "Minimum GPA", passed: job.minGpa === null || (c.gpa ?? 0) >= job.minGpa, detail: `Requires ≥ ${job.minGpa ?? "—"}, candidate ${c.gpa ?? "—"}` });
  const gradOk = (job.targetGradYearStart === null || (c.graduationYear ?? 0) >= job.targetGradYearStart) && (job.targetGradYearEnd === null || (c.graduationYear ?? 9999) <= job.targetGradYearEnd);
  checks.push({ label: "Graduation year", passed: gradOk, detail: `Window ${job.targetGradYearStart ?? "…"}–${job.targetGradYearEnd ?? "…"}, candidate ${c.graduationYear ?? "—"}` });
  checks.push({ label: "Experience", passed: (c.experienceYears ?? 0) >= (job.minExperienceYears || 0), detail: `Requires ≥ ${job.minExperienceYears} yr, candidate ${c.experienceYears ?? 0} yr` });
  if (job.salaryBudgetMax !== null && c.expectedSalary !== null) {
    checks.push({ label: "Salary fit", passed: c.expectedSalary <= job.salaryBudgetMax, detail: `Budget ≤ ${job.salaryBudgetMax.toLocaleString()}, expectation ${c.expectedSalary.toLocaleString()}` });
  }
  return checks;
}
