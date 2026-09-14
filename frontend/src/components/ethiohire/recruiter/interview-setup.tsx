
/** EthioHire — Interview Setup module (recruiter): the single home of live-
 *  interview configuration — standalone reusable resources (question banks,
 *  weighted evaluation templates) AND per-job setup (bank/template links,
 *  candidate question visibility SINGLE/ALL/HIDDEN, result release mode).
 *  These never appear in the job editor; the records are provisioned
 *  automatically when a job is created. */
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
import { apiJson } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/constants";
import { Eye, EyeOff, Gauge, Loader2, MessagesSquare, Plus, Save, Settings2, Trash2 } from "lucide-react";

interface BankQ { questionText: string; guidance: string; visibleToCandidate: boolean }
interface BankRow { id: string; name: string; description: string | null; questionCount: number; linkedJobs: { id: string; title: string; status: string }[] }
interface TplRow { id: string; name: string; competencies: { key: string; label: string; weight: number }[]; scaleMax: number; rateQuestions: boolean; instructions: string | null; linkedJobs?: { id: string; title: string }[] }
interface JobRow { id: string; title: string; status: string; bankId?: string | null; evalTemplateId?: string | null }
const NONE = "__none__";

export function RecruiterInterviewSetup() {
  const [tab, setTab] = useState<"banks" | "templates" | "jobs">("banks");
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [templates, setTemplates] = useState<TplRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBank, setEditingBank] = useState<BankRow | "new" | null>(null);
  const [editingTpl, setEditingTpl] = useState<TplRow | "new" | null>(null);
  const [configJob, setConfigJob] = useState<JobRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bk, tp, jb] = await Promise.all([
        apiJson<{ banks: BankRow[] }>("/api/question-banks"),
        apiJson<{ templates: TplRow[] }>("/api/eval-templates"),
        apiJson<{ jobs: JobRow[] }>("/api/jobs?mine=1"),
      ]);
      setBanks(bk.banks ?? []);
      setTemplates(tp.templates ?? []);
      setJobs(jb.jobs ?? []);
    } catch {
      /* session issue — central 401 handler manages the fallback */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteBank = async (b: BankRow) => {
    try {
      await apiJson(`/api/question-banks/${b.id}`, { method: "DELETE" });
      toast({ title: "Bank deleted" });
      setEditingBank(null);
      load();
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const deleteTpl = async (t: TplRow) => {
    try {
      await apiJson(`/api/eval-templates/${t.id}`, { method: "DELETE" });
      toast({ title: "Template deleted" });
      setEditingTpl(null);
      load();
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading interview setup…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Interview setup</h1>
        <p className="text-sm text-muted-foreground">
          The single home of live-interview configuration — reusable banks and scoring templates, plus each job's
          candidate question visibility and result release. The job editor does not duplicate any of it.
        </p>
      </div>

      <div className="flex gap-1.5 rounded-xl border bg-muted/30 p-1" role="tablist">
        {([
          ["banks", "Question banks", MessagesSquare],
          ["templates", "Evaluation templates", Gauge],
          ["jobs", "Job configuration", Settings2],
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
            data-testid={`setup-tab-${key}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ------------------------------ question banks ------------------------------ */}
      {tab === "banks" ? (
        editingBank ? (
          <BankEditor
            bank={editingBank === "new" ? null : editingBank}
            onDone={() => { setEditingBank(null); load(); }}
            onDelete={editingBank === "new" ? undefined : () => deleteBank(editingBank as BankRow)}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setEditingBank("new")} data-testid="new-bank">
                <Plus className="mr-1 h-3.5 w-3.5" /> New question bank
              </Button>
            </div>
            {banks.length === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No question banks yet — create one and link it to a job from the job editor.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {banks.map((b) => (
                  <Card key={b.id} data-testid="bank-row">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold">{b.name}</h3>
                          <p className="text-xs text-muted-foreground">{b.questionCount} question{b.questionCount === 1 ? "" : "s"}</p>
                        </div>
                        {b.linkedJobs.length > 0 ? (
                          <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">Used by {b.linkedJobs.length} job{b.linkedJobs.length === 1 ? "" : "s"}</Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">Unlinked</Badge>
                        )}
                      </div>
                      {b.linkedJobs.length > 0 ? (
                        <p className="mt-2 line-clamp-1 text-[11px] text-muted-foreground">{b.linkedJobs.map((j) => j.title).join(" · ")}</p>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setEditingBank(b)} data-testid={`edit-bank-${b.id}`}>Edit</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )
      ) : null}

      {/* -------------------------- evaluation templates -------------------------- */}
      {tab === "templates" ? (
        editingTpl ? (
          <TemplateEditor
            template={editingTpl === "new" ? null : editingTpl}
            onDone={() => { setEditingTpl(null); load(); }}
            onDelete={editingTpl === "new" ? undefined : () => deleteTpl(editingTpl as TplRow)}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setEditingTpl("new")} data-testid="new-template">
                <Plus className="mr-1 h-3.5 w-3.5" /> New evaluation template
              </Button>
            </div>
            {templates.length === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No evaluation templates yet — create one with weighted competencies and link it to a job.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {templates.map((t) => (
                  <Card key={t.id} data-testid="template-row">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold">{t.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {t.competencies.length} competenc{t.competencies.length === 1 ? "y" : "ies"} · 1–{t.scaleMax} scale{t.competencies.some((c) => (c.weight ?? 1) !== 1) ? " · weighted" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {t.competencies.slice(0, 6).map((c) => (
                          <Badge key={c.key} variant="outline" className="text-[10px]">
                            {c.label}{(c.weight ?? 1) !== 1 ? ` ×${c.weight}` : ""}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setEditingTpl(t)} data-testid={`edit-template-${t.id}`}>Edit</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )
      ) : null}

      {/* ------------------------- per-job configuration ------------------------- */}
      {tab === "jobs" ? (
        configJob ? (
          <JobConfigEditor
            jobId={configJob.id}
            jobTitle={configJob.title}
            banks={banks}
            templates={templates}
            onDone={() => { setConfigJob(null); load(); }}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Pick a job to manage its live-interview setup — linked question bank &amp; evaluation template, what
              candidates see during the interview (SINGLE / ALL / HIDDEN) and when interview results are released.
            </p>
            {jobs.length === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No jobs yet — create a posting first; its interview setup record is provisioned automatically.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {jobs.map((j) => (
                  <Card key={j.id} data-testid="job-config-row">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold">{j.title}</h3>
                          <p className="text-xs text-muted-foreground">
                            {banks.find((b) => b.id === j.bankId)?.name ?? "No bank linked"}
                            {" · "}
                            {templates.find((t) => t.id === j.evalTemplateId)?.name ?? "No template linked"}
                          </p>
                        </div>
                        <Badge variant="outline" className={j.status === "OPEN" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}>
                          {j.status}
                        </Badge>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setConfigJob(j)} data-testid={`job-config-open-${j.id}`}>
                          <Settings2 className="mr-1 h-3.5 w-3.5" /> Configure
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------- bank editor
function BankEditor({ bank, onDone, onDelete }: { bank: BankRow | null; onDone: () => void; onDelete?: () => void }) {
  const [name, setName] = useState(bank?.name ?? "");
  const [description, setDescription] = useState(bank?.description ?? "");
  const [questions, setQuestions] = useState<BankQ[]>(
    bank ? [] : [{ questionText: "", guidance: "", visibleToCandidate: true }]
  );
  const [loaded, setLoaded] = useState(!bank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!bank) return;
    apiJson<{ bank: BankRow & { questions: BankQ[] } }>(`/api/question-banks/${bank.id}`)
      .then((d) => {
        setName(d.bank.name);
        setDescription(d.bank.description ?? "");
        setQuestions(d.bank.questions.map((q) => ({ questionText: q.questionText, guidance: q.guidance ?? "", visibleToCandidate: q.visibleToCandidate !== false })));
      })
      .catch(() => { /* central 401 handler */ })
      .finally(() => setLoaded(true));
  }, [bank]);

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Bank name is required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const body = JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        questions: questions.filter((q) => q.questionText.trim()),
      });
      if (bank) await apiJson(`/api/question-banks/${bank.id}`, { method: "PUT", body });
      else await apiJson("/api/question-banks", { method: "POST", body });
      toast({ title: bank ? "Question bank updated" : "Question bank created", description: "Link it to a job from the job editor." });
      onDone();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <div className="py-10 text-center text-sm text-muted-foreground">Loading bank…</div>;

  return (
    <Card data-testid="bank-editor">
      <CardContent className="p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bk-name">Bank name *</Label>
            <Input id="bk-name" placeholder="e.g. Senior developer screen" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-desc">Description (optional)</Label>
            <Input id="bk-desc" placeholder="What this bank covers" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Label className="text-sm font-semibold">Questions</Label>
          <Button variant="outline" size="sm" onClick={() => setQuestions((q) => [...q, { questionText: "", guidance: "", visibleToCandidate: true }])}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add question
          </Button>
        </div>

        {questions.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 p-2.5" data-testid="bank-bulk-bar">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{questions.filter((q) => q.visibleToCandidate).length}</span> of {questions.length} visible to candidates (per-question and bulk)
            </p>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-7" onClick={() => setQuestions((arr) => arr.map((q) => ({ ...q, visibleToCandidate: true })))} data-testid="bank-show-all">
                <Eye className="mr-1 h-3 w-3" /> Show all
              </Button>
              <Button variant="outline" size="sm" className="h-7" onClick={() => setQuestions((arr) => arr.map((q) => ({ ...q, visibleToCandidate: false })))} data-testid="bank-hide-all">
                <EyeOff className="mr-1 h-3 w-3" /> Hide all
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-2 space-y-2">
          {questions.map((q, i) => (
            <div key={i} className={cn("rounded-xl border p-3.5", q.visibleToCandidate ? "" : "border-amber-200 bg-amber-50/40")} data-testid="bank-question-row">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-muted-foreground">QUESTION {i + 1}</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={q.visibleToCandidate}
                    aria-label={q.visibleToCandidate ? "Hide this question from candidates" : "Show this question to candidates"}
                    data-testid={`bank-visibility-${i}`}
                    onClick={() => setQuestions((arr) => arr.map((x, xi) => (xi === i ? { ...x, visibleToCandidate: !x.visibleToCandidate } : x)))}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                      q.visibleToCandidate ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
                    )}
                  >
                    {q.visibleToCandidate ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {q.visibleToCandidate ? "Candidate sees" : "Hidden"}
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Remove question" onClick={() => setQuestions((arr) => arr.filter((_, xi) => xi !== i))}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <Textarea rows={2} placeholder="e.g. Walk me through a project you led end-to-end…" value={q.questionText} onChange={(e) => setQuestions((arr) => arr.map((x, xi) => (xi === i ? { ...x, questionText: e.target.value } : x)))} />
              <Input className="mt-2" placeholder="Optional guidance for the interviewer — what a strong answer covers" value={q.guidance} onChange={(e) => setQuestions((arr) => arr.map((x, xi) => (xi === i ? { ...x, guidance: e.target.value } : x)))} />
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy} data-testid="save-bank">
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            {bank ? "Save changes" : "Create bank"}
          </Button>
          {onDelete ? (
            <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={onDelete} data-testid="delete-bank">
              <Trash2 className="mr-1 h-4 w-4" /> Delete bank
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onDone}>Back to list</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------- template editor
function TemplateEditor({ template, onDone, onDelete }: { template: TplRow | null; onDone: () => void; onDelete?: () => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [competencies, setCompetencies] = useState(
    template?.competencies?.length
      ? template.competencies.map((c) => ({ ...c }))
      : [
          { key: "communication", label: "Communication", weight: 1 },
          { key: "technical", label: "Technical depth", weight: 1 },
          { key: "problem_solving", label: "Problem solving", weight: 1 },
          { key: "culture", label: "Culture fit", weight: 1 },
        ]
  );
  const [scaleMax, setScaleMax] = useState(template?.scaleMax ?? 5);
  const [rateQuestions, setRateQuestions] = useState(template?.rateQuestions ?? true);
  const [instructions, setInstructions] = useState(template?.instructions ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Template name is required", variant: "destructive" });
      return;
    }
    if (!competencies.some((c) => c.label.trim())) {
      toast({ title: "At least one competency is required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const body = JSON.stringify({
        name: name.trim(),
        competencies: competencies.filter((c) => c.label.trim()),
        scaleMax,
        rateQuestions,
        instructions: instructions.trim() || null,
      });
      if (template) await apiJson(`/api/eval-templates/${template.id}`, { method: "PUT", body });
      else await apiJson("/api/eval-templates", { method: "POST", body });
      toast({ title: template ? "Template updated" : "Template created", description: "Link it to a job from the job editor." });
      onDone();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="template-editor">
      <CardContent className="p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Template name *</Label>
            <Input id="tpl-name" placeholder="e.g. Engineering interview rubric" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Rating scale</Label>
            <Select value={String(scaleMax)} onValueChange={(v) => setScaleMax(parseInt(v) || 5)}>
              <SelectTrigger aria-label="Rating scale"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">1–3 points</SelectItem>
                <SelectItem value="4">1–4 points</SelectItem>
                <SelectItem value="5">1–5 points</SelectItem>
                <SelectItem value="10">1–10 points</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Label className="mt-4 block text-sm font-semibold">Competencies &amp; weights</Label>
        <p className="mb-2 text-xs text-muted-foreground">
          Weight controls how strongly a competency counts toward the auto-summed overall score — e.g. core technical depth ×3, soft skills ×1.
        </p>
        <div className="space-y-2">
          {competencies.map((c, i) => (
            <div key={c.key} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
              <Input
                placeholder={`Competency ${i + 1} — e.g. Communication`}
                value={c.label}
                onChange={(e) => setCompetencies((arr) => arr.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))}
              />
              <div className="flex shrink-0 items-center gap-1" title="Weight — how much this competency counts toward the overall score">
                <span className="text-[11px] text-muted-foreground">weight</span>
                <Input
                  type="number" min={1} max={10} className="h-9 w-16" value={c.weight}
                  aria-label={`Weight for ${c.label || `competency ${i + 1}`}`}
                  onChange={(e) => setCompetencies((arr) => arr.map((x, xi) => (xi === i ? { ...x, weight: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) } : x)))}
                />
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Remove competency" onClick={() => setCompetencies((arr) => arr.filter((_, xi) => xi !== i))}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setCompetencies((arr) => [...arr, { key: `c${Date.now()}`, label: "", weight: 1 }])}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add competency
          </Button>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-input" checked={rateQuestions} onChange={(e) => setRateQuestions(e.target.checked)} />
          Enable per-question ratings in the room
        </label>
        <div className="mt-3 space-y-1.5">
          <Label className="text-xs">Instructions shown in the interview room (optional)</Label>
          <Textarea rows={2} placeholder="e.g. Score each competency as you go; add concrete examples in the notes." value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy} data-testid="save-template">
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            {template ? "Save changes" : "Create template"}
          </Button>
          {onDelete ? (
            <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={onDelete} data-testid="delete-template">
              <Trash2 className="mr-1 h-4 w-4" /> Delete template
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onDone}>Back to list</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------- per-job config editor
const DEFAULT_JC_COMPETENCIES = [
  { key: "communication", label: "Communication", weight: 1 },
  { key: "technical", label: "Technical depth", weight: 1 },
  { key: "problem_solving", label: "Problem solving", weight: 1 },
  { key: "culture", label: "Culture fit", weight: 1 },
];

/** Per-job live-interview configuration — the ONLY editor for these settings
 * (removed from the job editor by design). Covers:
 *  - linked question bank (questions are edited in the Question banks tab,
 *    including per-question candidate visibility and bulk show/hide)
 *  - linked evaluation template (edited in the Evaluation templates tab)
 *  - candidate question visibility: SINGLE / ALL / HIDDEN
 *  - interview result release: IMMEDIATE / AFTER_ALL / MANUAL (+ schedule) */
function JobConfigEditor({ jobId, jobTitle, banks, templates, onDone }: {
  jobId: string;
  jobTitle: string;
  banks: BankRow[];
  templates: TplRow[];
  onDone: () => void;
}) {
  const [bankChoice, setBankChoice] = useState<string>(NONE);
  const [templateChoice, setTemplateChoice] = useState<string>(NONE);
  const [iqVisibility, setIqVisibility] = useState<"SINGLE" | "ALL" | "HIDDEN">("SINGLE");
  const [ivRelease, setIvRelease] = useState<"IMMEDIATE" | "AFTER_ALL" | "MANUAL">("IMMEDIATE");
  const [ivReleaseAt, setIvReleaseAt] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [competencyCount, setCompetencyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiJson<{
      job: {
        bankId?: string | null;
        evalTemplateId?: string | null;
        interviewQuestionVisibility?: string;
        interviewResultRelease?: string;
        interviewResultsReleaseAt?: string | null;
        interviewQuestions?: unknown[];
        scoringTemplate?: { configured: boolean; competencies: unknown[] } | null;
      };
    }>(`/api/jobs/${jobId}`)
      .then((d) => {
        const j = d.job;
        setBankChoice(j.bankId || NONE);
        setTemplateChoice(j.evalTemplateId || NONE);
        const vis = (j.interviewQuestionVisibility || "SINGLE").toUpperCase();
        if (vis === "SINGLE" || vis === "ALL" || vis === "HIDDEN") setIqVisibility(vis);
        const rel = (j.interviewResultRelease || "IMMEDIATE").toUpperCase();
        if (rel === "IMMEDIATE" || rel === "AFTER_ALL" || rel === "MANUAL") setIvRelease(rel);
        setIvReleaseAt(toDatetimeLocal(j.interviewResultsReleaseAt ?? null));
        setQuestionCount((j.interviewQuestions ?? []).length);
        setCompetencyCount(j.scoringTemplate?.competencies?.length ?? DEFAULT_JC_COMPETENCIES.length);
      })
      .catch(() => { /* central 401 handler */ })
      .finally(() => setLoading(false));
  }, [jobId]);

  const save = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/jobs/${jobId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...(bankChoice !== NONE ? { bankId: bankChoice } : { bankId: null }),
          ...(templateChoice !== NONE ? { templateId: templateChoice } : { templateId: null }),
          interviewQuestionVisibility: iqVisibility,
          interviewResultRelease: ivRelease,
          interviewResultsReleaseAt: ivRelease === "MANUAL" && ivReleaseAt ? fromDatetimeLocal(ivReleaseAt) : null,
        }),
      });
      toast({ title: "Interview setup saved", description: `Bank, template, question visibility and release mode updated for “${jobTitle}”.` });
      onDone();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">Loading job configuration…</div>;

  const linkedBank = banks.find((b) => b.id === bankChoice);
  const linkedTpl = templates.find((t) => t.id === templateChoice);

  return (
    <Card data-testid="job-config-editor">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold">{jobTitle}</h2>
            <p className="text-xs text-muted-foreground">Live-interview setup for this job.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onDone}>Back to jobs</Button>
        </div>

        {/* question source */}
        <Separator className="my-4" />
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="jc-bank" className="text-xs">Question bank</Label>
          <Select value={bankChoice} onValueChange={setBankChoice}>
            <SelectTrigger id="jc-bank" className="w-72" aria-label="Question bank"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not linked (no questions shown in the room)</SelectItem>
              {banks.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name} ({b.questionCount} Q)</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {bankChoice !== NONE ? (
          <p className="mt-3 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground" data-testid="bank-linked-note">
            Linked to the library bank <span className="font-semibold text-foreground">{linkedBank?.name ?? bankChoice}</span> — {linkedBank?.questionCount ?? questionCount} question(s).
            Questions and their per-candidate visibility are edited in the <b>Question banks</b> tab; edits apply everywhere the bank is used.
          </p>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">
            No bank linked — the live room will not show any questions. Link one above, or add questions in the Question banks tab and link it here.
          </p>
        )}

        {/* template source */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Label htmlFor="jc-template" className="text-xs">Evaluation template</Label>
          <Select value={templateChoice} onValueChange={setTemplateChoice}>
            <SelectTrigger id="jc-template" className="w-72" aria-label="Evaluation template"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Default competencies (not linked)</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {templateChoice !== NONE ? (
          <p className="mt-3 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground" data-testid="template-linked-note">
            Linked to the library template <span className="font-semibold text-foreground">{linkedTpl?.name ?? templateChoice}</span> — {competencyCount} competency(ies).
            Weights, scale and instructions are edited in the <b>Evaluation templates</b> tab.
          </p>
        ) : null}

        {/* candidate question visibility */}
        <Separator className="my-4" />
        <div className="flex items-center gap-1.5 font-semibold"><Eye className="h-4 w-4 text-primary" /> What candidates see during the interview</div>
        <RadioGroup
          value={iqVisibility}
          onValueChange={(v) => setIqVisibility(v as "SINGLE" | "ALL" | "HIDDEN")}
          className="mt-2 grid gap-2 sm:grid-cols-3"
        >
          <div className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${iqVisibility === "SINGLE" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="SINGLE" id="jc-single" className="mt-0.5" />
            <Label htmlFor="jc-single" className="cursor-pointer space-y-0.5 font-normal">
              <p className="font-semibold">Single question</p>
              <p className="text-xs text-muted-foreground">The candidate sees only the question the interviewer shows, one at a time.</p>
            </Label>
          </div>
          <div className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${iqVisibility === "ALL" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="ALL" id="jc-all" className="mt-0.5" />
            <Label htmlFor="jc-all" className="cursor-pointer space-y-0.5 font-normal">
              <p className="font-semibold">Full list</p>
              <p className="text-xs text-muted-foreground">The candidate sees every question with the active one highlighted.</p>
            </Label>
          </div>
          <div className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${iqVisibility === "HIDDEN" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="HIDDEN" id="jc-hidden" className="mt-0.5" />
            <Label htmlFor="jc-hidden" className="cursor-pointer space-y-0.5 font-normal">
              <p className="font-semibold">Hidden</p>
              <p className="text-xs text-muted-foreground">Questions stay on the interviewer's screen — candidates follow the conversation.</p>
            </Label>
          </div>
        </RadioGroup>

        {/* result release */}
        <Separator className="my-4" />
        <div className="flex items-center gap-1.5 font-semibold"><Gauge className="h-4 w-4 text-primary" /> Interview result release</div>
        <RadioGroup
          value={ivRelease}
          onValueChange={(v) => setIvRelease(v as "IMMEDIATE" | "AFTER_ALL" | "MANUAL")}
          className="mt-2 grid gap-2 sm:grid-cols-3"
        >
          <div className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${ivRelease === "IMMEDIATE" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="IMMEDIATE" id="jc-imm" className="mt-0.5" />
            <Label htmlFor="jc-imm" className="cursor-pointer space-y-0.5 font-normal">
              <p className="font-semibold">Immediately</p>
              <p className="text-xs text-muted-foreground">The candidate receives the evaluation result as soon as the interviewer submits it.</p>
            </Label>
          </div>
          <div className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${ivRelease === "AFTER_ALL" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="AFTER_ALL" id="jc-after" className="mt-0.5" />
            <Label htmlFor="jc-after" className="cursor-pointer space-y-0.5 font-normal">
              <p className="font-semibold">After all interviews</p>
              <p className="text-xs text-muted-foreground">Results publish together once every interview for this job is completed.</p>
            </Label>
          </div>
          <div className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${ivRelease === "MANUAL" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="MANUAL" id="jc-man" className="mt-0.5" />
            <Label htmlFor="jc-man" className="cursor-pointer space-y-0.5 font-normal">
              <p className="font-semibold">Manual release</p>
              <p className="text-xs text-muted-foreground">Results stay private until you publish them from the Interviews page — or automatically at the scheduled time below.</p>
            </Label>
          </div>
        </RadioGroup>
        {ivRelease === "MANUAL" ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="jc-release-at" className="text-xs">Scheduled release (date &amp; time)</Label>
                <Input
                  id="jc-release-at"
                  type="datetime-local"
                  value={ivReleaseAt}
                  onChange={(e) => setIvReleaseAt(e.target.value)}
                  className="w-64"
                  data-testid="jc-release-at"
                />
              </div>
              <p className="max-w-md pb-1 text-[11px] leading-relaxed text-muted-foreground">
                Recommended — set it once and every held result for this job publishes automatically at that moment.
                No need to release each candidate manually. Leave empty to publish manually from the Interviews page.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex gap-2">
          <Button onClick={save} disabled={busy} data-testid="save-job-config">
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Save interview setup
          </Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
