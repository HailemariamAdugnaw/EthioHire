
/** EthioHire — Exams module (recruiter): standalone exam management decoupled
 *  from the job editor. Per job: proctored question bank, scheduled group
 *  session + result visibility, and proctoring rules — all editable WITHOUT
 *  re-saving core job details. */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { EmptyState, SectionTitle } from "@/components/ethiohire/bits";
import { apiJson } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { toast } from "@/hooks/use-toast";
import { formatDateTime, fromDatetimeLocal, toDatetimeLocal } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  AlarmClock, ArrowLeft, CalendarClock, ClipboardList, Eye, EyeOff, Loader2, ListChecks, MonitorPlay, Plus, Save, Trash2,
} from "lucide-react";

type QuestionType = "MCQ" | "TRUE_FALSE" | "FILL_BLANK" | "TEXT";
interface AQ { questionText: string; questionType: QuestionType; options: string[]; correctAnswer: string; timeLimitSeconds: number }
interface ExamRow {
  jobId: string; title: string; category: string | null; status: string;
  questionCount: number; examPassMark: number; maxViolations: number;
  session: { scheduledAt: string; durationMinutes: number; releaseMode: "IMMEDIATE" | "MANUAL"; releaseAt: string | null; resultsReleasedAt: string | null } | null;
  released: boolean;
  stats: { qualified: number; completed: number; passed: number; failed: number };
}

/** Switch a question's type and normalize its answer fields for the new shape. */
function withType(q: AQ, t: string): AQ {
  const questionType = t as QuestionType;
  const wasTF = ["TRUE", "FALSE"].includes(q.correctAnswer.trim().toUpperCase());
  if (questionType === "TRUE_FALSE") {
    return { ...q, questionType, options: [], correctAnswer: wasTF ? q.correctAnswer.trim().toUpperCase() : "TRUE" };
  }
  if (questionType === "FILL_BLANK") {
    return { ...q, questionType, options: [], correctAnswer: wasTF ? "" : q.correctAnswer };
  }
  if (questionType === "MCQ") {
    return { ...q, questionType, options: q.options.length ? q.options : ["", "", "", ""] };
  }
  return { ...q, questionType }; // TEXT keeps keywords in correctAnswer
}

export function RecruiterExams({ jobId }: { jobId?: string }) {
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await apiJson<{ exams: ExamRow[] }>("/api/exams");
      setRows(d.exams ?? []);
    } catch {
      /* session issue — central 401 handler manages the fallback */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading exams…</div>;

  // Detail view — one job's exam management (question bank / session / rules)
  if (jobId) {
    const row = rows.find((r) => r.jobId === jobId);
    return <ExamDetail jobId={jobId} row={row} onBack={() => navigate("/recruiter/exams")} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Exams</h1>
        <p className="text-sm text-muted-foreground">
          Proctored text exams, decoupled from the job editor — manage question banks, sessions, result visibility and rules independently.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No jobs yet" body="Create a job first — its exam configuration then appears here for independent management." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.jobId} data-testid="exam-row">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold">{r.title}</h3>
                    <p className="text-xs text-muted-foreground">{r.category ?? "No category"} · pass mark {r.examPassMark}% · max {r.maxViolations} violation{r.maxViolations === 1 ? "" : "s"}</p>
                  </div>
                  <Badge variant="outline" className={cn(
                    r.session ? (r.released || r.session.releaseMode === "IMMEDIATE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700") : "border-slate-200 bg-slate-50 text-slate-600",
                  )}>
                    <ClipboardList className="mr-1 h-3 w-3" />
                    {r.questionCount} question{r.questionCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 rounded-xl border bg-muted/30 p-2.5 text-center">
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Qualified</p><p className="text-base font-bold tabular-nums">{r.stats.qualified}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Completed</p><p className="text-base font-bold tabular-nums">{r.stats.completed}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Passed</p><p className="text-base font-bold tabular-nums text-emerald-600">{r.stats.passed}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Failed</p><p className="text-base font-bold tabular-nums text-red-500">{r.stats.failed}</p></div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.session && r.session.scheduledAt ? (
                    <>
                      <CalendarClock className="mr-1 inline h-3 w-3" />
                      Session opens {formatDateTime(r.session.scheduledAt)} · {r.session.durationMinutes} min · results{" "}
                      <span className="font-medium text-foreground">{r.session.releaseMode === "IMMEDIATE" ? "immediate" : r.released || r.session.resultsReleasedAt ? "released" : "held"}</span>
                    </>
                  ) : (
                    "Not scheduled yet — candidates start right after pre-screening. Schedule it for a synchronized pooled session."
                  )}
                </p>
                <Button size="sm" className="mt-3 w-full" onClick={() => navigate(`/recruiter/exams/${r.jobId}`)} data-testid={`manage-exam-${r.jobId}`}>
                  Manage exam
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamDetail({ jobId, row, onBack }: { jobId: string; row?: ExamRow; onBack: () => void }) {
  const [tab, setTab] = useState<"questions" | "session" | "rules">("questions");

  return (
    <div className="space-y-5">
      <div>
        <Button variant="ghost" size="sm" className="mb-1 -ml-2" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All exams
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{row?.title ?? "Exam management"}</h1>
        <p className="text-sm text-muted-foreground">Everything about this job's proctored exam — saved independently of the job details.</p>
      </div>

      <div className="flex gap-1.5 rounded-xl border bg-muted/30 p-1" role="tablist">
        {([
          ["questions", "Question bank", ListChecks],
          ["session", "Session & results", CalendarClock],
          ["rules", "Rules", ClipboardList],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              tab === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`exam-tab-${key}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "questions" ? <ExamQuestions jobId={jobId} initialCount={row?.questionCount ?? 0} /> : null}
      {tab === "session" ? <ExamSession jobId={jobId} /> : null}
      {tab === "rules" ? <ExamRules jobId={jobId} passMark={row?.examPassMark ?? 60} maxViolations={row?.maxViolations ?? 3} /> : null}
    </div>
  );
}

// ------------------------------------------------------------ question bank
function ExamQuestions({ jobId, initialCount }: { jobId: string; initialCount: number }) {
  const [questions, setQuestions] = useState<AQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiJson<{ questions: (AQ & { options: string | null })[] | null }>(`/api/jobs/${jobId}/questions`)
      .then((d) => {
        setQuestions(
          (d.questions ?? []).map((q) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options ? (JSON.parse(q.options as string) as string[]) : [],
            correctAnswer: q.correctAnswer,
            timeLimitSeconds: q.timeLimitSeconds,
          }))
        );
      })
      .catch(() => { /* central 401 handler */ })
      .finally(() => setLoading(false));
  }, [jobId]);

  const save = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/jobs/${jobId}/exam-questions`, {
        method: "PUT",
        body: JSON.stringify({ questions: questions.filter((q) => q.questionText.trim()) }),
      });
      toast({ title: "Exam question bank saved", description: `${questions.filter((q) => q.questionText.trim()).length} question(s) stored — job details untouched.` });
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">Loading questions…</div>;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-1.5 font-bold"><ListChecks className="h-4 w-4 text-primary" /> Proctored exam question bank</h2>
            <p className="text-xs text-muted-foreground">Four question types — MCQ, true/false, fill-in-the-blank and free text. Correct answers stay server-side.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setQuestions((q) => [...q, { questionText: "", questionType: "MCQ", options: ["", "", "", ""], correctAnswer: "", timeLimitSeconds: 90 }])}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add question
          </Button>
        </div>
        <div className="mt-3 space-y-3">
          {questions.length === 0 ? (
            <p className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              <MonitorPlay className="h-4 w-4" /> No exam questions yet — add at least 3–5 for a meaningful assessment.
            </p>
          ) : null}
          {questions.map((q, i) => (
            <div key={i} className="rounded-xl border p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-muted-foreground">QUESTION {i + 1}</p>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Remove" onClick={() => setQuestions((arr) => arr.filter((_, xi) => xi !== i))}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <Textarea rows={2} placeholder="Question text…" value={q.questionText} onChange={(e) => setQuestions((arr) => arr.map((x, xi) => (xi === i ? { ...x, questionText: e.target.value } : x)))} />
              <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select value={q.questionType} onValueChange={(v) => setQuestions((arr) => arr.map((x, xi) => (xi === i ? withType(x, v) : x)))}>
                    <SelectTrigger className="h-9" aria-label="Question type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MCQ">Multiple choice</SelectItem>
                      <SelectItem value="TRUE_FALSE">True or false</SelectItem>
                      <SelectItem value="FILL_BLANK">Fill in the blank</SelectItem>
                      <SelectItem value="TEXT">Free text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Time limit (seconds)</Label>
                  <Input type="number" min="15" max="300" value={q.timeLimitSeconds} onChange={(e) => setQuestions((arr) => arr.map((x, xi) => (xi === i ? { ...x, timeLimitSeconds: parseInt(e.target.value) || 90 } : x)))} />
                </div>
              </div>
              {q.questionType === "MCQ" ? (
                <div className="mt-2.5 space-y-2">
                  <Label className="text-xs">Options (exact correct answer must match one)</Label>
                  {q.options.map((opt, oi) => (
                    <Input key={oi} placeholder={`Option ${oi + 1}`} value={opt} onChange={(e) => setQuestions((arr) => arr.map((x, xi) => (xi === i ? { ...x, options: x.options.map((o, oi2) => (oi2 === oi ? e.target.value : o)) } : x)))} />
                  ))}
                  <div className="space-y-1">
                    <Label className="text-xs">Correct answer</Label>
                    <Input placeholder="Exact text of the correct option" value={q.correctAnswer} onChange={(e) => setQuestions((arr) => arr.map((x, xi) => (xi === i ? { ...x, correctAnswer: e.target.value } : x)))} />
                  </div>
                </div>
              ) : q.questionType === "TRUE_FALSE" ? (
                <div className="mt-2.5 space-y-1.5">
                  <Label className="text-xs">Correct answer</Label>
                  <RadioGroup
                    value={q.correctAnswer.toUpperCase() === "FALSE" ? "FALSE" : "TRUE"}
                    onValueChange={(v) => setQuestions((arr) => arr.map((x, xi) => (xi === i ? { ...x, correctAnswer: v } : x)))}
                    className="flex gap-6"
                  >
                    <div className="flex items-center gap-2 rounded-lg border px-4 py-2.5">
                      <RadioGroupItem value="TRUE" id={`tf-true-${i}`} />
                      <Label htmlFor={`tf-true-${i}`} className="cursor-pointer font-normal">True</Label>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border px-4 py-2.5">
                      <RadioGroupItem value="FALSE" id={`tf-false-${i}`} />
                      <Label htmlFor={`tf-false-${i}`} className="cursor-pointer font-normal">False</Label>
                    </div>
                  </RadioGroup>
                </div>
              ) : q.questionType === "FILL_BLANK" ? (
                <div className="mt-2.5 space-y-1">
                  <Label className="text-xs">Accepted answers (comma separated — graded case-insensitively)</Label>
                  <Input placeholder="Addis Ababa, addis abeba" value={q.correctAnswer} onChange={(e) => setQuestions((arr) => arr.map((x, xi) => (xi === i ? { ...x, correctAnswer: e.target.value } : x)))} />
                  <p className="text-[11px] text-muted-foreground">Tip: write the blank as ___ in the question text, e.g. “The capital of Ethiopia is ___”.</p>
                </div>
              ) : (
                <div className="mt-2.5 space-y-1">
                  <Label className="text-xs">Expected keywords (comma separated — used for auto-feedback; recruiters review text answers)</Label>
                  <Input placeholder="parameterized queries, prepared statements" value={q.correctAnswer} onChange={(e) => setQuestions((arr) => arr.map((x, xi) => (xi === i ? { ...x, correctAnswer: e.target.value } : x)))} />
                </div>
              )}
            </div>
          ))}
        </div>
        <Button className="mt-4" onClick={save} disabled={busy} data-testid="save-exam-questions">
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Save question bank ({questions.filter((q) => q.questionText.trim()).length})
        </Button>
        {initialCount !== questions.length ? (
          <p className="ml-3 inline text-[11px] text-muted-foreground">was {initialCount} question{initialCount === 1 ? "" : "s"}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------- session & results
function ExamSession({ jobId }: { jobId: string }) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(60);
  const [releaseMode, setReleaseMode] = useState<"IMMEDIATE" | "MANUAL">("IMMEDIATE");
  const [releaseAt, setReleaseAt] = useState("");
  const [existing, setExisting] = useState<ExamRow["session"]>(null);
  const [stats, setStats] = useState<{ qualified: number; completed: number; released: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiJson<{ session: ExamRow["session"]; stats: { qualified: number; completed: number; released: boolean } }>(`/api/jobs/${jobId}/exam-session`);
      setStats(d.stats);
      if (d.session) {
        setExisting(d.session);
        setScheduledAt(toDatetimeLocal(d.session.scheduledAt));
        setDuration(d.session.durationMinutes);
        setReleaseMode(d.session.releaseMode);
        setReleaseAt(toDatetimeLocal(d.session.releaseAt));
      }
    } catch { /* central 401 handler */ }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!scheduledAt) {
      toast({ title: "Pick an exam date & time first", variant: "destructive" });
      return;
    }
    const scheduledIso = fromDatetimeLocal(scheduledAt);
    if (!scheduledIso) {
      toast({ title: "Exam schedule date is invalid", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const d = await apiJson<{ session: ExamRow["session"]; notified: number }>(`/api/jobs/${jobId}/exam-session`, {
        method: "PUT",
        body: JSON.stringify({
          scheduledAt: scheduledIso,
          durationMinutes: duration,
          releaseMode,
          releaseAt: releaseMode === "MANUAL" && releaseAt ? fromDatetimeLocal(releaseAt) : null,
        }),
      });
      setExisting(d.session);
      toast({ title: "Exam session scheduled", description: `${d.notified} qualified candidate(s) were notified — everyone starts at the same moment.` });
    } catch (err) {
      toast({ title: "Could not schedule exam session", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const releaseResults = async () => {
    setBusy(true);
    try {
      const d = await apiJson<{ released: number }>(`/api/jobs/${jobId}/exam-session/release`, { method: "POST", body: JSON.stringify({}) });
      toast({ title: "Results published", description: `${d.released} candidate(s) can now see their scores.` });
      load();
    } catch (err) {
      toast({ title: "Release failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 font-bold"><AlarmClock className="h-4 w-4 text-primary" /> Scheduled exam session &amp; result visibility</h2>
            <p className="text-xs text-muted-foreground">
              Pool every pre-screening passer into one session — the exam unlocks at the same timestamp for all of them,
              running on an identical countdown. Leave unscheduled to let candidates start immediately after pre-screening.
            </p>
          </div>
          {existing ? (
            <Badge variant="outline" className={stats?.released || existing.releaseMode === "IMMEDIATE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
              <CalendarClock className="mr-1 h-3 w-3" />
              {existing.releaseMode === "IMMEDIATE" ? "Results: immediate" : stats?.released || existing.resultsReleasedAt ? "Results: released" : "Results: held"}
            </Badge>
          ) : null}
        </div>

        {stats ? (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 p-3 text-center">
            <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Qualified</p><p className="text-lg font-bold tabular-nums">{stats.qualified}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Completed</p><p className="text-lg font-bold tabular-nums">{stats.completed}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Results</p><p className="text-lg font-bold">{existing?.releaseMode === "IMMEDIATE" ? "Auto" : stats.released ? "Released" : "Held"}</p></div>
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="es-at">Exam opens at (shared start)</Label>
            <Input id="es-at" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="es-dur">Countdown window (minutes)</Label>
            <Input id="es-dur" type="number" min="10" max="300" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 60)} />
          </div>
        </div>

        <Separator className="my-4" />
        <div className="flex items-center gap-1.5 font-semibold"><Eye className="h-4 w-4 text-primary" /> Result visibility</div>
        <RadioGroup
          value={releaseMode}
          onValueChange={(v) => setReleaseMode(v as "IMMEDIATE" | "MANUAL")}
          className="mt-2 grid gap-2 sm:grid-cols-2"
        >
          <div className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${releaseMode === "IMMEDIATE" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="IMMEDIATE" id="es-mode-immediate" className="mt-0.5" />
            <Label htmlFor="es-mode-immediate" className="cursor-pointer space-y-0.5 font-normal">
              <p className="font-semibold">Option A — Immediate</p>
              <p className="text-xs text-muted-foreground">Candidates see their score and answer breakdown right after submitting.</p>
            </Label>
          </div>
          <div className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${releaseMode === "MANUAL" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="MANUAL" id="es-mode-manual" className="mt-0.5" />
            <Label htmlFor="es-mode-manual" className="cursor-pointer space-y-0.5 font-normal">
              <p className="font-semibold">Option B — Scheduled / manual release</p>
              <p className="text-xs text-muted-foreground">Scores stay hidden until you release them from this page, or until the optional release time passes. Submitting the exam never publishes them.</p>
            </Label>
          </div>
        </RadioGroup>
        {releaseMode === "MANUAL" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="es-rel">Release results at (optional)</Label>
              <Input id="es-rel" type="datetime-local" value={releaseAt} onChange={(e) => setReleaseAt(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Leave empty to release manually from this page.</p>
            </div>
            {existing?.releaseMode === "MANUAL" && !existing.resultsReleasedAt ? (
              <div className="flex items-end">
                <Button variant="secondary" onClick={releaseResults} disabled={busy} className="w-full">
                  <Eye className="mr-1 h-4 w-4" /> Release results now
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <Button className="mt-4" onClick={save} disabled={busy} data-testid="save-exam-session">
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          {existing ? "Update exam session" : "Schedule exam session"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------- rules
function ExamRules({ jobId, passMark, maxViolations }: { jobId: string; passMark: number; maxViolations: number }) {
  const [pm, setPm] = useState(passMark);
  const [mv, setMv] = useState(maxViolations);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/jobs/${jobId}/exam-rules`, {
        method: "PATCH",
        body: JSON.stringify({ examPassMark: pm, maxViolations: mv }),
      });
      toast({ title: "Exam rules saved", description: `Pass mark ${pm}% · max ${mv} proctoring violation${mv === 1 ? "" : "s"} before termination.` });
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 flex items-center gap-1.5 font-bold"><EyeOff className="h-4 w-4 text-primary" /> Proctoring &amp; pass rules</h2>
        <p className="mb-4 text-xs text-muted-foreground">Anti-cheating tolerance and the score required to advance to interviews.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ex-pass">Exam pass mark (%)</Label>
            <Input id="ex-pass" type="number" min="0" max="100" value={pm} onChange={(e) => setPm(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-viol">Max proctoring violations before termination</Label>
            <Input id="ex-viol" type="number" min="1" max="10" value={mv} onChange={(e) => setMv(parseInt(e.target.value) || 1)} />
          </div>
        </div>
        <Button className="mt-4" onClick={save} disabled={busy} data-testid="save-exam-rules">
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Save rules
        </Button>
      </CardContent>
    </Card>
  );
}
