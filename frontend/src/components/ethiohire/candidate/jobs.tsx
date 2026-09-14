
/** EthioHire — Candidate job search & filter portal + structured apply flow */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { apiJson } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { daysLeftLabel, formatDateTime, formatETB, JOB_CATEGORIES, JOB_TYPES } from "@/lib/constants";
import { RichTextView, stripHtml } from "@/components/ui/rich-text";
import { BadgeCheck, Briefcase, Building2, CalendarClock, CalendarX2, ChevronDown, ChevronUp, Loader2, MapPin, Search, Wallet } from "lucide-react";

interface Job {
  id: string;
  title: string;
  description: string;
  roleDescription?: string | null;
  educationRequirement?: string | null;
  category: string | null;
  location: string | null;
  jobType: string | null;
  minExperienceYears: number;
  minGpa: number | null;
  targetGradYearStart: number | null;
  targetGradYearEnd: number | null;
  salaryBudgetMin: number | null;
  salaryBudgetMax: number | null;
  postingStartDate: string | null;
  applicationDeadline: string | null;
  daysPosted: number;
  daysRemaining: number | null;
  applicationOpen: boolean;
  company: { companyName: string; verificationStatus: string; industry: string | null };
  _count: { applications: number };
  myApplicationId: string | null;
}

interface KnockQ {
  id: string;
  questionText: string;
  requiredAnswer: string;
}

export function CandidateJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [jobType, setJobType] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  // live days-posted / days-remaining indicators — re-render every 30s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (jobType !== "ALL") params.set("jobType", jobType);
      if (category !== "ALL") params.set("category", category);
      const data = await apiJson<{ jobs: Job[] }>(`/api/jobs?${params.toString()}`);
      setJobs(data.jobs);
    } catch {
      /* session issue — central 401 handler manages the fallback */
    } finally {
      setLoading(false);
    }
  }, [q, jobType, category]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const categories = JOB_CATEGORIES;

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Find jobs</h1>
        <p className="text-sm text-muted-foreground">
          Apply once per job — every application is instantly pre-screened against hard criteria.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by title or keyword…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search jobs" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="ALL">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={jobType} onValueChange={setJobType}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by job type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All job types</SelectItem>
            {JOB_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">
          No open jobs match your filters right now.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {jobs.map((j) => {
            const expanded = expandedIds.has(j.id);
            const notOpenYet = !!j.postingStartDate && now < new Date(j.postingStartDate).getTime();
            const deadlinePassed = j.applicationDeadline ? now >= new Date(j.applicationDeadline).getTime() : false;
            const applyDisabled = !j.applicationOpen || !!j.myApplicationId;
            return (
            <Card key={j.id} className="flex flex-col transition-all hover:border-primary/40 hover:shadow-sm">
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold leading-snug">{j.title}</h3>
                  {j.company.verificationStatus === "APPROVED" ? (
                    <BadgeCheck className="h-5 w-5 shrink-0 text-primary" aria-label="Verified company" />
                  ) : null}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> {j.company.companyName}
                  {j.company.industry ? <span className="text-xs">· {j.company.industry}</span> : null}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {j.category ? <Badge variant="outline" className="border-primary/30 bg-primary/5 text-xs text-primary">{j.category}</Badge> : null}
                  {j.location ? <Badge variant="secondary" className="text-xs"><MapPin className="mr-1 h-3 w-3" />{j.location}</Badge> : null}
                  {j.jobType ? <Badge variant="secondary" className="text-xs">{JOB_TYPES.find((t) => t.value === j.jobType)?.label || j.jobType}</Badge> : null}
                  {j.minGpa ? <Badge variant="secondary" className="text-xs">GPA ≥ {j.minGpa}</Badge> : null}
                  <Badge variant="secondary" className="text-xs">{j.minExperienceYears}+ yr exp</Badge>
                </div>

                {/* Days tracker — live posting-window indicators */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                    <CalendarClock className="mr-1 h-3 w-3" /> Posted {j.daysPosted} day{j.daysPosted === 1 ? "" : "s"} ago
                  </Badge>
                  {deadlinePassed ? (
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                      <CalendarX2 className="mr-1 h-3 w-3" /> Applications closed
                    </Badge>
                  ) : j.daysRemaining !== null ? (
                    <Badge
                      variant="outline"
                      className={
                        j.daysRemaining <= 3
                          ? "border-red-200 bg-red-50 text-red-700"
                          : j.daysRemaining <= 7
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }
                    >
                      <CalendarClock className="mr-1 h-3 w-3" /> {daysLeftLabel(j.daysRemaining)} to apply
                    </Badge>
                  ) : null}
                  {notOpenYet && j.postingStartDate ? (
                    <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                      Opens {formatDateTime(j.postingStartDate)}
                    </Badge>
                  ) : null}
                </div>

                {/* Job description — truncated with See More expansion (stays in the search flow).
                    Rich text (WYSIWYG) renders with formatting; the collapsed preview shows plain text. */}
                {expanded ? (
                  <RichTextView html={j.description} className="eh-prose mt-3 flex-1 text-sm leading-relaxed text-muted-foreground" testId="job-description-full" />
                ) : (
                  <p className="mt-3 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">{stripHtml(j.description)}</p>
                )}
                {expanded && j.roleDescription ? (
                  <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-foreground">Role of the employee</p>
                    <RichTextView html={j.roleDescription} className="eh-prose text-sm leading-relaxed text-muted-foreground" testId="job-role-full" />
                  </div>
                ) : null}
                {expanded && j.educationRequirement ? (
                  <div className="mt-2 rounded-lg border bg-muted/30 p-3">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-foreground">Education requirements</p>
                    <RichTextView html={j.educationRequirement} className="eh-prose text-sm leading-relaxed text-muted-foreground" testId="job-education-full" />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => toggleExpanded(j.id)}
                  className="mt-1 flex w-fit items-center gap-0.5 text-xs font-semibold text-primary hover:underline"
                  aria-expanded={expanded}
                >
                  {expanded ? (<>See less <ChevronUp className="h-3.5 w-3.5" /></>) : (<>See more <ChevronDown className="h-3.5 w-3.5" /></>)}
                </button>

                <Separator className="my-3" />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {j.salaryBudgetMin ? `${formatETB(j.salaryBudgetMin)} – ${formatETB(j.salaryBudgetMax)}` : "Negotiable"}
                    </span>
                  </div>
                  {j.myApplicationId ? (
                    <Badge className="bg-primary/10 text-primary border-primary/30" variant="outline">Applied ✓</Badge>
                  ) : (
                    <Button
                      size="sm"
                      disabled={applyDisabled}
                      title={
                        deadlinePassed
                          ? "The application deadline has passed"
                          : notOpenYet
                            ? "Applications are not open yet"
                            : undefined
                      }
                      onClick={() => setApplyJob(j)}
                    >
                      {deadlinePassed || notOpenYet ? <CalendarX2 className="mr-1 h-3.5 w-3.5" /> : <Briefcase className="mr-1 h-3.5 w-3.5" />}
                      {deadlinePassed ? "Closed" : notOpenYet ? "Not open yet" : "Apply"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {applyJob ? (
        <ApplyDialog job={applyJob} onClose={(applied) => { setApplyJob(null); if (applied) load(); }} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ApplyDialog({ job, onClose }: { job: Job; onClose: (applied: boolean) => void }) {
  const [knock, setKnock] = useState<KnockQ[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; matchScore: number; rejectReasons: string[]; checks: { label: string; passed: boolean; detail: string }[] } | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const data = await apiJson<{ job: { knockoutQuestions: KnockQ[] } }>(`/api/jobs/${job.id}`);
      setKnock(data.job.knockoutQuestions);
    })().catch(() => setKnock([]));
  }, [job.id]);

  const submit = async () => {
    setBusy(true);
    try {
      const data = await apiJson<{ application: { id: string }; screening: { passed: boolean; matchScore: number; rejectReasons: string[]; checks: { label: string; passed: boolean; detail: string }[] } }>(`/api/jobs/${job.id}/apply`, {
        method: "POST",
        body: JSON.stringify({ knockoutAnswers: answers }),
      });
      setResult(data.screening);
      setApplicationId(data.application.id);
      toast({
        title: data.screening.passed ? "Pre-screening passed! 🎉" : "Application submitted",
        description: data.screening.passed ? "You qualified for the proctored assessment." : "Unfortunately, hard criteria were not met this time.",
      });
    } catch (err) {
      toast({ title: "Could not submit application", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const allAnswered = knock.every((k) => answers[k.id]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(!!result)}>
      <DialogContent className="eh-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply — {job.title}</DialogTitle>
          <DialogDescription>
            Stage 1: structured pre-screening. Your profile&apos;s GPA, graduation year, experience and salary
            expectation are checked automatically against the employer&apos;s thresholds.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            {/* requirement summary */}
            <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">Hard requirements</p>
              <ul className="space-y-0.5">
                {job.minGpa ? <li>• Minimum GPA: {job.minGpa}</li> : null}
                {job.targetGradYearStart || job.targetGradYearEnd ? <li>• Graduation year: {job.targetGradYearStart ?? "…"} – {job.targetGradYearEnd ?? "…"}</li> : null}
                <li>• Experience: at least {job.minExperienceYears} year(s)</li>
                {job.salaryBudgetMax ? <li>• Salary budget: up to {formatETB(job.salaryBudgetMax)}/month</li> : null}
              </ul>
            </div>

            {/* knockout questionnaire */}
            {knock.length > 0 ? (
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Knockout questionnaire (mandatory)</Label>
                {knock.map((k, i) => (
                  <div key={k.id} className="rounded-lg border p-3">
                    <p className="mb-2 text-sm font-medium">{i + 1}. {k.questionText}</p>
                    <RadioGroup value={answers[k.id] || ""} onValueChange={(v) => setAnswers((a) => ({ ...a, [k.id]: v }))} className="flex gap-6">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="YES" id={`yes-${k.id}`} />
                        <Label htmlFor={`yes-${k.id}`} className="font-normal">Yes</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="NO" id={`no-${k.id}`} />
                        <Label htmlFor={`no-${k.id}`} className="font-normal">No</Label>
                      </div>
                    </RadioGroup>
                  </div>
                ))}
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => onClose(false)}>Cancel</Button>
              <Button onClick={submit} disabled={busy || !allAnswered} title={!allAnswered ? "Answer all knockout questions" : undefined}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Submit application
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`rounded-xl border p-4 text-center ${result.passed ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <p className={`text-2xl font-extrabold ${result.passed ? "text-emerald-700" : "text-red-700"}`}>
                Match score: {result.matchScore}/100
              </p>
              <p className={`mt-1 text-sm font-medium ${result.passed ? "text-emerald-700" : "text-red-700"}`}>
                {result.passed ? "Pre-screening passed — proceed to the proctored exam!" : "Pre-screening rejected"}
              </p>
            </div>
            <div className="space-y-1.5">
              {result.checks.map((c) => (
                <div key={c.label} className="flex items-start justify-between gap-3 rounded-lg border p-2.5 text-sm">
                  <div>
                    <p className="font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                  <Badge variant="outline" className={c.passed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>
                    {c.passed ? "Pass" : "Fail"}
                  </Badge>
                </div>
              ))}
            </div>
            {result.rejectReasons.length > 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
                {result.rejectReasons.map((r, i) => <p key={i}>• {r}</p>)}
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => onClose(true)}>Close</Button>
              {result.passed && applicationId ? (
                <Button onClick={() => { onClose(true); navigate(`/candidate/exam/${applicationId}`); }}>
                  Continue to assessment →
                </Button>
              ) : null}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
