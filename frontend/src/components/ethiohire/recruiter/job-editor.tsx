
/** EthioHire — Recruiter job configurator:
 *  mandatory posting window + hard screening thresholds + knockout questionnaire
 *  + WYSIWYG rich-text content + standardized category dropdown.
 *  (Proctored exams live in the dedicated Exams module — /recruiter/exams;
 *  interview question banks, evaluation templates, question visibility and
 *  result release live in the Interview Setup module — /recruiter/interview-setup.
 *  Both records are provisioned automatically when the job is created.) */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { RichTextEditor } from "@/components/ui/rich-text";
import { toast } from "@/hooks/use-toast";
import { apiJson } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { JOB_CATEGORIES, JOB_TYPES, fromDatetimeLocal, toDatetimeLocal } from "@/lib/constants";
import { ArrowLeft, FileSearch, Loader2, Plus, Save, Trash2 } from "lucide-react";

interface KQ { questionText: string; requiredAnswer: string }

const blankJob = {
  title: "",
  description: "",
  roleDescription: "", // what the employee will actually do (rich text)
  educationRequirement: "", // education background the job requires (rich text)
  category: "",
  location: "",
  jobType: "FULL_TIME",
  minExperienceYears: 0,
  minGpa: "",
  targetGradYearStart: "",
  targetGradYearEnd: "",
  salaryBudgetMin: "",
  salaryBudgetMax: "",
  postingStartDate: "", // datetime-local string — mandatory (Feature: application lifecycle)
  applicationDeadline: "", // datetime-local string — mandatory
  status: "OPEN",
};

export function RecruiterJobEditor({ jobId }: { jobId?: string }) {
  const [job, setJob] = useState<typeof blankJob & { knockoutQuestions?: KQ[] }>({ ...blankJob });
  const [knock, setKnock] = useState<KQ[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!jobId);

  useEffect(() => {
    if (!jobId) return;
    apiJson<{
      job: {
        knockoutQuestions: KQ[];
      } & typeof blankJob;
    }>(`/api/jobs/${jobId}`)
      .then((d) => {
        const j = d.job as unknown as Record<string, unknown>;
        setJob({
          ...blankJob,
          ...Object.fromEntries(
            Object.entries(blankJob).map(([k]) => {
              const raw = j[k] ?? blankJob[k as keyof typeof blankJob];
              // ISO datetimes from the API must become datetime-local inputs
              if ((k === "postingStartDate" || k === "applicationDeadline") && typeof raw === "string") {
                return [k, toDatetimeLocal(raw)];
              }
              return [k, raw];
            })
          ),
        } as typeof job);
        setKnock(d.job.knockoutQuestions.map((k) => ({ questionText: k.questionText, requiredAnswer: k.requiredAnswer })));
      })
      .catch(() => {
        /* session issue — central 401 handler manages the fallback */
      })
      .finally(() => setLoading(false));
  }, [jobId]);

  const set = (k: string, v: unknown) => setJob((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!job.title.trim() || !job.description.trim()) {
      toast({ title: "Title and description are required", variant: "destructive" });
      return;
    }
    // Feature: mandatory posting window
    const startIso = fromDatetimeLocal(job.postingStartDate);
    const deadlineIso = fromDatetimeLocal(job.applicationDeadline);
    if (!startIso || !deadlineIso) {
      toast({ title: "Posting start date and application deadline are required", variant: "destructive" });
      return;
    }
    if (new Date(deadlineIso) <= new Date(startIso)) {
      toast({ title: "Application deadline must be after the posting start date", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...job,
        postingStartDate: startIso,
        applicationDeadline: deadlineIso,
        knockoutQuestions: knock.filter((k) => k.questionText.trim()),
        // NOTE: interview configuration (question bank, evaluation template,
        // candidate question visibility, result release) is intentionally NOT
        // part of the job editor — it is owned end-to-end by the Interview
        // Setup module. Omitting the keys here leaves the stored config
        // untouched when an existing job is re-saved.
      };
      if (jobId) {
        await apiJson(`/api/jobs/${jobId}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Job updated", description: "Job details and screening config saved." });
      } else {
        await apiJson<{ job: { id: string } }>("/api/jobs", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Job posted!", description: "Exam and interview setup records were provisioned — manage them from their modules." });
      }
      navigate("/recruiter/jobs");
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading job…</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 -ml-2" onClick={() => navigate("/recruiter/jobs")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to jobs
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{jobId ? "Edit job posting" : "New job posting"}</h1>
          <p className="text-sm text-muted-foreground">Stage-1 thresholds filter applicants automatically before any exam starts.</p>
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          {jobId ? "Save changes" : "Publish job"}
        </Button>
      </div>

      {/* ---------------- Job basics ---------------- */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 flex items-center gap-2 font-bold"><FileSearch className="h-[18px] w-[18px] text-primary" /> Job basics</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="j-title">Job title *</Label>
              <Input id="j-title" placeholder="Senior Full-Stack Developer (React / Node.js)" value={job.title} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="j-desc">Description *</Label>
              <RichTextEditor
                value={job.description}
                onChange={(html) => set("description", html)}
                placeholder="Responsibilities, requirements, benefits… — use headings, bold and lists"
                testId="j-desc-editor"
              />
              <p className="text-[11px] text-muted-foreground">Rich text (WYSIWYG) — headings, bold, italic, bullet and numbered lists and links are supported. Typing *, - or 1. keeps plain text; lists are inserted with the toolbar buttons.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="j-role">Role of the employee</Label>
              <RichTextEditor
                value={job.roleDescription}
                onChange={(html) => set("roleDescription", html)}
                placeholder="Describe the role: day-to-day duties, ownership, team the employee joins, reporting line…"
                minHeight={110}
                testId="j-role-editor"
              />
              <p className="text-[11px] text-muted-foreground">Shown to candidates as its own “Role of the employee” section on the job page.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="j-edu">Education requirements</Label>
              <RichTextEditor
                value={job.educationRequirement}
                onChange={(html) => set("educationRequirement", html)}
                placeholder="e.g. BSc in Computer Science or related field; MSc is a plus…"
                minHeight={90}
                testId="j-edu-editor"
              />
              <p className="text-[11px] text-muted-foreground">Shown to candidates as its own “Education requirements” section on the job page.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-cat">Category</Label>
              <Select value={job.category || undefined} onValueChange={(v) => set("category", v)}>
                <SelectTrigger id="j-cat" aria-label="Category"><SelectValue placeholder="Select a category…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {JOB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Standardized categories — keeps search and filtering consistent.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-loc">Location</Label>
              <Input id="j-loc" placeholder="Addis Ababa (Hybrid)" value={job.location} onChange={(e) => set("location", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Job type</Label>
              <Select value={job.jobType} onValueChange={(v) => set("jobType", v)}>
                <SelectTrigger aria-label="Job type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JOB_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={job.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Mandatory posting window (Feature 2) */}
            <div className="space-y-1.5">
              <Label htmlFor="j-post-start">Posting start date & time *</Label>
              <Input
                id="j-post-start"
                type="datetime-local"
                required
                value={job.postingStartDate}
                onChange={(e) => set("postingStartDate", e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Applications are rejected automatically before this moment.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-deadline">Application deadline date & time *</Label>
              <Input
                id="j-deadline"
                type="datetime-local"
                required
                min={job.postingStartDate || undefined}
                value={job.applicationDeadline}
                onChange={(e) => set("applicationDeadline", e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">After this moment the Apply button is disabled and new submissions are rejected.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Screening thresholds ---------------- */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-1 font-bold">Stage 1 — Hard screening thresholds</h2>
          <p className="mb-4 text-xs text-muted-foreground">Applicants failing any of these are auto-rejected before the assessment phase.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="j-minexp">Min experience (years)</Label>
              <Input id="j-minexp" type="number" min="0" value={job.minExperienceYears} onChange={(e) => set("minExperienceYears", parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-mingpa">Minimum GPA (0–4)</Label>
              <Input id="j-mingpa" type="number" step="0.05" min="0" max="4" placeholder="3.00" value={job.minGpa} onChange={(e) => set("minGpa", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-grad1">Graduation year from</Label>
              <Input id="j-grad1" type="number" placeholder="2020" value={job.targetGradYearStart} onChange={(e) => set("targetGradYearStart", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-grad2">Graduation year to</Label>
              <Input id="j-grad2" type="number" placeholder="2025" value={job.targetGradYearEnd} onChange={(e) => set("targetGradYearEnd", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-sal1">Budget from (ETB)</Label>
              <Input id="j-sal1" type="number" placeholder="30000" value={job.salaryBudgetMin} onChange={(e) => set("salaryBudgetMin", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-sal2">Budget to (ETB)</Label>
              <Input id="j-sal2" type="number" placeholder="60000" value={job.salaryBudgetMax} onChange={(e) => set("salaryBudgetMax", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Knockout questionnaire ---------------- */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <div>
              <h2 className="font-bold">Knockout questionnaire (Yes/No)</h2>
              <p className="text-xs text-muted-foreground">Mandatory pre-requisite questions — wrong answers disqualify.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setKnock((k) => [...k, { questionText: "", requiredAnswer: "YES" }])}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {knock.length === 0 ? <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No knockout questions.</p> : null}
            {knock.map((k, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                <Input className="min-w-48 flex-1" placeholder={`e.g. Do you have ${job.minExperienceYears || 2}+ years of experience?`} value={k.questionText} onChange={(e) => setKnock((arr) => arr.map((x, xi) => (xi === i ? { ...x, questionText: e.target.value } : x)))} />
                <RadioGroup value={k.requiredAnswer} onValueChange={(v) => setKnock((arr) => arr.map((x, xi) => (xi === i ? { ...x, requiredAnswer: v } : x)))} className="flex gap-4">
                  <div className="flex items-center gap-1.5"><RadioGroupItem value="YES" id={`kq-yes-${i}`} /><Label htmlFor={`kq-yes-${i}`} className="text-xs font-normal">Required: Yes</Label></div>
                  <div className="flex items-center gap-1.5"><RadioGroupItem value="NO" id={`kq-no-${i}`} /><Label htmlFor={`kq-no-${i}`} className="text-xs font-normal">Required: No</Label></div>
                </RadioGroup>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove question" onClick={() => setKnock((arr) => arr.filter((_, xi) => xi !== i))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
