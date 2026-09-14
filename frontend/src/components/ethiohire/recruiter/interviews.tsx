
/** EthioHire — Recruiter interview scheduler: automated sequential time-slotting
 *  (start time + per-candidate slot duration → non-overlapping slots) + manual scheduling. */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EmptyState, SectionTitle } from "@/components/ethiohire/bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiJson } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { toast } from "@/hooks/use-toast";
import { formatDateTime, fromDatetimeLocal, toDatetimeLocal } from "@/lib/constants";
import { CalendarClock, CalendarPlus, CheckCheck, Clock, Eye, Hourglass, Link2, Loader2, MailWarning, Sparkles, Video, X } from "lucide-react";

interface Interview {
  id: string;
  scheduledTime: string;
  endTime: string | null;
  slotDurationMinutes: number | null;
  format: string;
  status: string;
  meetingLink: string | null;
  interviewerName: string | null;
  score: number | null;
  notes: string | null;
  application: { id: string; job: { title: string }; candidate: { fullName: string } };
}

interface SlotResult {
  applicationId: string;
  candidateName: string;
  interviewId: string;
  startTime: string;
  endTime: string;
  status: string;
  candidateNotified?: string;
  notifyError?: string | null;
}

interface SlotNotificationSummary {
  sent: number;
  skipped: number;
  failed: number;
  emailConfigured: boolean;
}

interface SlotReleaseConfig {
  mode: "IMMEDIATE" | "AFTER_ALL" | "MANUAL";
  releaseAt?: string | null;
}

interface PendingRelease { jobId: string; jobTitle: string; mode: string; held: number; releaseAt?: string | null }

export function RecruiterInterviews() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [eligible, setEligible] = useState<{ id: string; name: string; job: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // schedule form
  const [appId, setAppId] = useState("");
  const [time, setTime] = useState("");
  const [format, setFormat] = useState("VIDEO");
  const [link, setLink] = useState("");

  // automated slotting form (Feature 4)
  const [myJobs, setMyJobs] = useState<{ id: string; title: string }[]>([]);
  const [slotJobId, setSlotJobId] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotDuration, setSlotDuration] = useState("30");
  const [slotFormat, setSlotFormat] = useState("VIDEO");
  const [slotLink, setSlotLink] = useState("");
  const [slotResult, setSlotResult] = useState<{ created: number; startAt: string; slotDurationMinutes: number; slots: SlotResult[]; notificationSummary?: SlotNotificationSummary; releaseApplied?: SlotReleaseConfig | null } | null>(null);
  const [slotBusy, setSlotBusy] = useState(false);
  // Result release configuration step — opens right after the recruiter
  // clicks "Generate slots & notify candidates" and is applied to the job
  // together with the slot generation.
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [slotRelease, setSlotRelease] = useState<"IMMEDIATE" | "AFTER_ALL" | "MANUAL">("IMMEDIATE");
  const [slotReleaseAt, setSlotReleaseAt] = useState("");
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [pendingReleases, setPendingReleases] = useState<PendingRelease[]>([]);
  const [releasingJob, setReleasingJob] = useState("");
  const [releaseSchedule, setReleaseSchedule] = useState<Record<string, string>>({});
  const [schedulingJob, setSchedulingJob] = useState("");

  const load = useCallback(async () => {
    try {
      const [iv, ap, jb, health] = await Promise.all([
        apiJson<{ interviews: Interview[]; pendingReleases?: PendingRelease[] }>("/api/interviews"),
        apiJson<{ applications: { id: string; status: string; job: { title: string }; candidate: { fullName: string } }[] }>("/api/applications"),
        apiJson<{ jobs: { id: string; title: string }[] }>("/api/jobs?mine=1"),
        apiJson<{ integrations?: { email?: string } }>("/api/health").catch(() => ({ integrations: { email: "unknown" } }) as { integrations?: { email?: string } }),
      ]);
      setInterviews(iv.interviews);
      setPendingReleases(iv.pendingReleases ?? []);
      setEmailConfigured(health.integrations?.email === "resend");
      setEligible(
        ap.applications
          .filter((a) => ["EXAM_PASSED", "INTERVIEW_COMPLETED", "SHORTLISTED"].includes(a.status))
          .map((a) => ({ id: a.id, name: a.candidate.fullName, job: a.job.title }))
      );
      setMyJobs(jb.jobs.map((j) => ({ id: j.id, title: j.title })));
    } catch {
      /* session issue — central 401 handler manages the fallback */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---------------------------------------------------------------- Feature 4
  // Step 1 — validate the slot form, then open the release-configuration step.
  const generateSlots = async () => {
    if (!slotJobId || !slotStart) {
      toast({ title: "Pick a job and an interview start date & time", variant: "destructive" });
      return;
    }
    const startIso = fromDatetimeLocal(slotStart);
    if (!startIso) {
      toast({ title: "Interview start date & time is invalid", variant: "destructive" });
      return;
    }
    if (new Date(startIso).getTime() <= Date.now()) {
      toast({ title: "Interview start must be in the future", description: "You picked a past date & time — adjust the picker and try again.", variant: "destructive" });
      return;
    }
    setReleaseDialogOpen(true);
  };

  // Step 2 — confirmed: generate the slots AND apply the release configuration.
  const confirmGenerateSlots = async () => {
    const startIso = fromDatetimeLocal(slotStart);
    if (!startIso || new Date(startIso).getTime() <= Date.now()) {
      toast({ title: "Interview start date & time is invalid", variant: "destructive" });
      return;
    }
    if (slotRelease === "MANUAL" && slotReleaseAt && new Date(fromDatetimeLocal(slotReleaseAt)!).getTime() <= Date.now()) {
      toast({ title: "Scheduled release must be in the future", variant: "destructive" });
      return;
    }
    setSlotBusy(true);
    try {
      const d = await apiJson<{ created: number; startAt: string; slotDurationMinutes: number; slots: SlotResult[]; notificationSummary?: SlotNotificationSummary; releaseApplied?: SlotReleaseConfig | null }>(
        `/api/jobs/${slotJobId}/interview-slots`,
        {
          method: "POST",
          body: JSON.stringify({
            startAt: startIso,
            slotDurationMinutes: parseInt(slotDuration) || 30,
            format: slotFormat,
            meetingLink: slotLink || undefined,
            interviewResultRelease: slotRelease,
            interviewResultsReleaseAt: slotRelease === "MANUAL" && slotReleaseAt ? fromDatetimeLocal(slotReleaseAt) : undefined,
          }),
        }
      );
      setSlotResult(d);
      setReleaseDialogOpen(false);
      const relText = d.releaseApplied
        ? d.releaseApplied.mode === "IMMEDIATE"
          ? "Results release immediately"
          : d.releaseApplied.mode === "AFTER_ALL"
            ? "Results publish after all interviews"
            : `Results release manually${d.releaseApplied.releaseAt ? ` on ${formatDateTime(d.releaseApplied.releaseAt)}` : ""}`
        : "";
      const sum = d.notificationSummary;
      if (sum && !sum.emailConfigured) {
        toast({
          title: `${d.created} interview slot${d.created === 1 ? "" : "s"} generated — emails NOT sent`,
          description: `${relText}. RESEND_API_KEY is not configured, so candidate invitations were skipped. Add the key in the project .env (see Setup Guides), then re-run generation.`,
          variant: "destructive",
        });
      } else if (sum && (sum.failed > 0)) {
        toast({ title: `${d.created} slot${d.created === 1 ? "" : "s"} generated — ${sum.failed} email(s) failed`, description: relText, variant: "destructive" });
      } else {
        toast({
          title: `${d.created} interview slot${d.created === 1 ? "" : "s"} generated`,
          description: `Sequential ${d.slotDurationMinutes}-minute slots starting ${formatDateTime(d.startAt)} — ${sum?.sent ?? d.created} invitation email${(sum?.sent ?? d.created) === 1 ? "" : "s"} sent via Resend. ${relText}.`,
        });
      }
      setSlotLink("");
      load();
    } catch (err) {
      toast({ title: "Slot generation failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSlotBusy(false);
    }
  };

  const releaseInterviewResults = async (job: PendingRelease) => {
    setReleasingJob(job.jobId);
    try {
      const d = await apiJson<{ released: number }>(`/api/jobs/${job.jobId}/interview-results/release`, { method: "POST", body: JSON.stringify({}) });
      toast({ title: "Interview results published", description: `${d.released} candidate result(s) were emailed.` });
      load();
    } catch (err) {
      toast({ title: "Release failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setReleasingJob("");
    }
  };

  // Scheduled manual release — set date & time once; every held result for the
  // job publishes automatically at that moment (no per-candidate releasing).
  const scheduleInterviewRelease = async (job: PendingRelease) => {
    const local = releaseSchedule[job.jobId];
    if (!local) {
      toast({ title: "Pick a release date & time first", variant: "destructive" });
      return;
    }
    const iso = fromDatetimeLocal(local);
    if (!iso) {
      toast({ title: "Scheduled release time is invalid", variant: "destructive" });
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      toast({ title: "Scheduled release must be in the future", description: "Pick a later date & time.", variant: "destructive" });
      return;
    }
    setSchedulingJob(job.jobId);
    try {
      await apiJson(`/api/jobs/${job.jobId}/interview-results/release`, { method: "POST", body: JSON.stringify({ releaseAt: iso }) });
      toast({ title: "Release scheduled", description: `${job.jobTitle}: all held results publish automatically on ${formatDateTime(iso)} — candidates are notified at that time.` });
      load();
    } catch (err) {
      toast({ title: "Scheduling failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSchedulingJob("");
    }
  };

  const schedule = async () => {
    if (!appId || !time) {
      toast({ title: "Pick a candidate and a time", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiJson(`/api/applications/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "SCHEDULE_INTERVIEW", scheduledTime: new Date(time).toISOString(), format, meetingLink: link }),
      });
      toast({ title: "Interview scheduled", description: "The candidate has been notified by email." });
      setAppId("");
      setTime("");
      setLink("");
      load();
    } catch (err) {
      toast({ title: "Scheduling failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (i: Interview, status: string) => {
    await apiJson(`/api/interviews/${i.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    toast({ title: `Interview ${status.toLowerCase()}` });
    load();
  };

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading interviews…</div>;

  const upcoming = interviews.filter((i) => i.status === "SCHEDULED");
  const past = interviews.filter((i) => i.status !== "SCHEDULED");
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const slotPreview = (() => {
    if (!slotStart || !slotJobId) return null;
    const startIso = fromDatetimeLocal(slotStart);
    if (!startIso) return null;
    const dur = parseInt(slotDuration) || 30;
    const end = new Date(new Date(startIso).getTime() + dur * 60000);
    const fmt = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return `${fmt(new Date(startIso))} → ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Interviews</h1>
        <p className="text-sm text-muted-foreground">Stage 3 — automatically time-slot live sessions for everyone who passed the exam, or schedule candidates individually.</p>
      </div>

      {!emailConfigured ? (
        <Alert data-testid="email-banner">
          <MailWarning className="h-4 w-4" />
          <AlertTitle>Email delivery is not configured</AlertTitle>
          <AlertDescription>
            Invitations and result notifications are being <b>skipped</b> until a Resend API key is set. Add <code className="rounded bg-muted px-1 py-0.5 text-[11px]">RESEND_API_KEY</code> to the project <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.env</code> and restart the backend — see the Setup Guides page (Resend guide).
          </AlertDescription>
        </Alert>
      ) : null}

      {pendingReleases.length > 0 ? (
        <Card className="border-amber-300 bg-amber-50/60" data-testid="pending-releases">
          <CardContent className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold"><Hourglass className="h-4 w-4 text-amber-600" /> Held interview results</h2>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Evaluations for these jobs are complete but results are held by the release setting. Schedule an automatic release (recommended) or publish them now.</p>
            <div className="space-y-2">
              {pendingReleases.map((p) => (
                <div key={p.jobId} className="rounded-lg border bg-card px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{p.jobTitle}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.held} held result{p.held === 1 ? "" : "s"} · release mode: {p.mode === "MANUAL" ? "manual" : "after all interviews"}
                        {p.releaseAt && new Date(p.releaseAt).getTime() > Date.now() ? ` · scheduled for ${formatDateTime(p.releaseAt)}` : ""}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => releaseInterviewResults(p)} disabled={releasingJob === p.jobId} data-testid={`release-${p.jobId}`}>
                      {releasingJob === p.jobId ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                      Release now
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                    <Label htmlFor={`rel-at-${p.jobId}`} className="text-[11px] text-muted-foreground">Scheduled release</Label>
                    <Input
                      id={`rel-at-${p.jobId}`}
                      type="datetime-local"
                      className="h-8 w-56 text-xs"
                      value={releaseSchedule[p.jobId] ?? (p.releaseAt && new Date(p.releaseAt).getTime() > Date.now() ? toDatetimeLocal(p.releaseAt) : "")}
                      onChange={(e) => setReleaseSchedule((s) => ({ ...s, [p.jobId]: e.target.value }))}
                      data-testid={`release-at-${p.jobId}`}
                    />
                    <Button size="sm" variant="secondary" className="h-8" onClick={() => scheduleInterviewRelease(p)} disabled={schedulingJob === p.jobId} data-testid={`schedule-release-${p.jobId}`}>
                      {schedulingJob === p.jobId ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="mr-1 h-3.5 w-3.5" />}
                      Schedule auto-release
                    </Button>
                    <p className="text-[11px] text-muted-foreground">Every held result publishes automatically at that moment — no per-candidate releasing.</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* -------- automated slotting (Feature 4) -------- */}
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="p-5">
          <h2 className="mb-1 flex items-center gap-2 font-bold"><Sparkles className="h-[18px] w-[18px] text-primary" /> Automated live interview time-slotting</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Pick a start time and a duration per candidate — the system books consecutive, non-overlapping slots for every
            candidate who passed the text exam (ordered by exam score), then notifies each of them.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="slot-job">Job</Label>
              <Select value={slotJobId} onValueChange={setSlotJobId}>
                <SelectTrigger id="slot-job" aria-label="Job"><SelectValue placeholder="Select job…" /></SelectTrigger>
                <SelectContent>
                  {myJobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slot-start">Interview start date & time</Label>
              <Input id="slot-start" type="datetime-local" min={nowLocal} value={slotStart} onChange={(e) => setSlotStart(e.target.value)} />
              {slotPreview ? (
                <p className="text-[11px] text-muted-foreground" data-testid="slot-preview">Booked start: <span className="font-medium text-foreground">{slotPreview}</span> — the table below shows the exact local times.</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Times are booked in your local timezone.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slot-dur">Slot duration per candidate</Label>
              <Select value={slotDuration} onValueChange={setSlotDuration}>
                <SelectTrigger id="slot-dur" aria-label="Slot duration"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">90 minutes</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slot-fmt">Format</Label>
              <Select value={slotFormat} onValueChange={setSlotFormat}>
                <SelectTrigger id="slot-fmt" aria-label="Format"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIDEO">Video call</SelectItem>
                  <SelectItem value="VOICE">Voice call</SelectItem>
                  <SelectItem value="ONSITE">On-site</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="slot-link">Meeting link (optional — auto-generated per slot if empty)</Label>
              <Input id="slot-link" placeholder="https://meet…" value={slotLink} onChange={(e) => setSlotLink(e.target.value)} />
            </div>
            <div className="flex items-end lg:col-span-2">
              <Button className="w-full" onClick={generateSlots} disabled={slotBusy}>
                {slotBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                Generate slots & notify candidates
              </Button>
            </div>
          </div>

          {slotResult ? (
            <div className="mt-4 overflow-hidden rounded-xl border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold">
                <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-primary" /> Generated schedule — {formatDateTime(slotResult.startAt)} · {slotResult.slotDurationMinutes} min per candidate</span>
                {slotResult.releaseApplied ? (
                  <Badge variant="outline" className={slotResult.releaseApplied.mode === "IMMEDIATE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"} data-testid="release-applied-badge">
                    <Hourglass className="mr-1 h-3 w-3" />
                    {slotResult.releaseApplied.mode === "IMMEDIATE"
                      ? "Release: immediately"
                      : slotResult.releaseApplied.mode === "AFTER_ALL"
                        ? "Release: after all interviews"
                        : slotResult.releaseApplied.releaseAt
                          ? `Release: scheduled ${formatDateTime(slotResult.releaseApplied.releaseAt)}`
                          : "Release: manual"}
                  </Badge>
                ) : null}
                <button className="text-muted-foreground hover:text-foreground" onClick={() => setSlotResult(null)} aria-label="Dismiss">✕</button>
              </div>
              <div className="eh-scroll max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Candidate</th>
                      <th className="px-3 py-2 font-medium">Slot start</th>
                      <th className="px-3 py-2 font-medium">Slot end</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slotResult.slots.map((s, i) => (
                      <tr key={s.interviewId} className="border-t">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{s.candidateName}</td>
                        <td className="px-3 py-2">{formatDateTime(s.startTime)}</td>
                        <td className="px-3 py-2">{formatDateTime(s.endTime)}</td>
                        <td className="px-3 py-2" title={s.notifyError || undefined}>
                          {s.candidateNotified === "SENT" ? (
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Sent</Badge>
                          ) : s.candidateNotified === "FAILED" ? (
                            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Failed</Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Skipped</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2"><Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">{s.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* -------- result release configuration step -------- */}
      <Dialog open={releaseDialogOpen} onOpenChange={setReleaseDialogOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="release-config-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Hourglass className="h-4 w-4 text-primary" /> How should interview results be released?</DialogTitle>
            <DialogDescription>
              Choose when candidates see their interview results for <b>{myJobs.find((j) => j.id === slotJobId)?.title ?? "this job"}</b>. You can change this anytime in the job editor or Interviews page.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={slotRelease} onValueChange={(v) => setSlotRelease(v as "IMMEDIATE" | "AFTER_ALL" | "MANUAL")} className="grid gap-2">
            <div className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${slotRelease === "IMMEDIATE" ? "border-primary bg-primary/5" : ""}`}>
              <RadioGroupItem value="IMMEDIATE" id="dlg-rel-immediate" className="mt-0.5" />
              <Label htmlFor="dlg-rel-immediate" className="cursor-pointer space-y-0.5 font-normal">
                <p className="font-semibold">Immediately</p>
                <p className="text-xs text-muted-foreground">As soon as the interviewer submits the evaluation.</p>
              </Label>
            </div>
            <div className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${slotRelease === "AFTER_ALL" ? "border-primary bg-primary/5" : ""}`}>
              <RadioGroupItem value="AFTER_ALL" id="dlg-rel-after" className="mt-0.5" />
              <Label htmlFor="dlg-rel-after" className="cursor-pointer space-y-0.5 font-normal">
                <p className="font-semibold">After all interviews</p>
                <p className="text-xs text-muted-foreground">Publish every result together once all interviews for this job are complete.</p>
              </Label>
            </div>
            <div className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${slotRelease === "MANUAL" ? "border-primary bg-primary/5" : ""}`}>
              <RadioGroupItem value="MANUAL" id="dlg-rel-manual" className="mt-0.5" />
              <Label htmlFor="dlg-rel-manual" className="cursor-pointer space-y-0.5 font-normal">
                <p className="font-semibold">Manual release</p>
                <p className="text-xs text-muted-foreground">Results stay private until you publish them — from the Interviews page or automatically at the scheduled time.</p>
              </Label>
            </div>
          </RadioGroup>
          {slotRelease === "MANUAL" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="dlg-rel-at" className="text-xs">Scheduled release (date &amp; time)</Label>
                <Input id="dlg-rel-at" type="datetime-local" className="w-64" value={slotReleaseAt} onChange={(e) => setSlotReleaseAt(e.target.value)} data-testid="dlg-rel-at" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Recommended — set it once and every held result publishes automatically at that moment (batch release, no per-candidate work). Leave empty to publish manually from the Interviews page.
                </p>
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReleaseDialogOpen(false)} disabled={slotBusy}>Cancel</Button>
            <Button onClick={confirmGenerateSlots} disabled={slotBusy} data-testid="confirm-generate-slots">
              {slotBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              Generate slots &amp; notify
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* scheduler */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 flex items-center gap-2 font-bold"><CalendarPlus className="h-[18px] w-[18px] text-primary" /> Schedule an interview</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <div className="text-xs">Qualified candidate</div>
              <select
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Candidate"
              >
                <option value="">Select candidate…</option>
                {eligible.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} — {e.job}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs">Date & time</div>
              <Input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Interview time" />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs">Format</div>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Format"
              >
                <option value="VIDEO">Video call</option>
                <option value="VOICE">Voice call</option>
                <option value="ONSITE">On-site</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <div className="text-xs">Meeting link (optional)</div>
              <Input placeholder="Auto-generated if empty" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Meeting link" />
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={schedule} disabled={busy}>Schedule & notify</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* upcoming */}
      <SectionTitle sub="Open the room at the scheduled time — both sides join from the same room link.">Upcoming sessions</SectionTitle>
      {upcoming.length === 0 ? (
        <EmptyState title="No upcoming interviews" body="Schedule one from the form above once candidates pass their assessments." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {upcoming.map((i) => (
            <Card key={i.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold">{i.application.candidate.fullName}</h3>
                    <p className="text-sm text-muted-foreground">{i.application.job.title}</p>
                  </div>
                  <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">{i.format}</Badge>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary">
                  <CalendarClock className="h-4 w-4" /> {formatDateTime(i.scheduledTime)}
                  {i.endTime ? <span className="text-muted-foreground">– {new Date(i.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span> : null}
                  {i.slotDurationMinutes ? <Badge variant="outline" className="ml-1 text-[10px]"><Clock className="mr-1 h-3 w-3" />{i.slotDurationMinutes} min</Badge> : null}
                </p>
                {i.meetingLink ? (
                  <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><Link2 className="h-3 w-3" />{i.meetingLink}</p>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => navigate(`/interview-room/${i.id}`)}>
                    <Video className="mr-1 h-4 w-4" /> Enter room
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setStatus(i, "COMPLETED")}><CheckCheck className="mr-1 h-3.5 w-3.5" /> Done</Button>
                  <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setStatus(i, "CANCELLED")} aria-label="Cancel interview">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* history */}
      {past.length > 0 ? (
        <>
          <SectionTitle>History</SectionTitle>
          <div className="space-y-2">
            {past.map((i) => (
              <Card key={i.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{i.application.candidate.fullName} — {i.application.job.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(i.scheduledTime)}{i.notes ? ` · ${i.notes}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {i.score !== null ? <Badge variant="outline">Score: {i.score}</Badge> : null}
                    <Badge variant={i.status === "COMPLETED" ? "secondary" : "destructive"}>{i.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
