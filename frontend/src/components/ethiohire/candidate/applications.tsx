
/** EthioHire — Candidate application status tracker (Stage 4 reporting) */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ScoreRing, SectionTitle, StatusBadge } from "@/components/ethiohire/bits";
import { apiJson } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { funnelProgress } from "@/components/ethiohire/candidate/dashboard";
import { formatDateTime, PROCTORING_EVENT_LABELS } from "@/lib/constants";
import { AlarmClock, ClipboardList, FileWarning, Hourglass, Video } from "lucide-react";

interface AppRow {
  id: string;
  status: string;
  matchScore: number;
  examScore: number | null;
  examStatus: string | null;
  violationCount: number;
  rejectReason: string | null;
  createdAt: string;
  examSession: { scheduledAt: string; durationMinutes: number; releaseMode: string } | null;
  job: { id: string; title: string; company: { companyName: string } };
  interviewSchedules: { id: string; scheduledTime: string; status: string; meetingLink: string | null; format: string }[];
}

export function CandidateApplications() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AppRow | null>(null);
  const [logs, setLogs] = useState<{ id: string; eventType: string; details: string | null; createdAt: string }[]>([]);

  useEffect(() => {
    apiJson<{ applications: AppRow[] }>("/api/applications")
      .then((d) => setApps(d.applications))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openDetail = async (a: AppRow) => {
    setDetail(a);
    try {
      const d = await apiJson<{ application: { proctoringLogs: typeof logs } }>(`/api/applications/${a.id}`);
      setLogs(d.application.proctoringLogs);
    } catch {
      setLogs([]);
    }
  };

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading applications…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My applications</h1>
        <p className="text-sm text-muted-foreground">Live status for every stage — pre-screening, proctored exam, and interview.</p>
      </div>

      {apps.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Apply to jobs from the job board and track each stage of the selection funnel in real time."
          action={<Button onClick={() => navigate("/candidate/jobs")}><ClipboardList className="mr-1 h-4 w-4" /> Browse jobs</Button>}
        />
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <Card key={a.id} className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => openDetail(a)}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <ScoreRing score={a.matchScore} size={60} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{a.job.title}</p>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{a.job.company.companyName} · applied {formatDateTime(a.createdAt)}</p>
                  {a.status === "EXAM_SCHEDULED" && a.examSession ? (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-violet-700">
                      <AlarmClock className="h-3.5 w-3.5" /> Assessment opens {formatDateTime(a.examSession.scheduledAt)} · {a.examSession.durationMinutes}-min shared window
                    </p>
                  ) : null}
                  {a.status === "EXAM_SUBMITTED" ? (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                      <Hourglass className="h-3.5 w-3.5" /> Answers submitted — the employer will publish results for all candidates together.
                    </p>
                  ) : null}
                  {a.examScore !== null ? <p className="mt-1 text-xs text-muted-foreground">Exam score: <span className="font-semibold text-foreground">{a.examScore}%</span></p> : null}
                  {a.interviewSchedules.length > 0 && a.status === "INTERVIEW_SCHEDULED" ? (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                      <Video className="h-3.5 w-3.5" /> Interview: {formatDateTime(a.interviewSchedules[0].scheduledTime)}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {a.status === "EXAM_SCHEDULED" && a.examSession ? (
                    new Date(a.examSession.scheduledAt).getTime() <= Date.now() ? (
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/candidate/exam/${a.id}`); }}>
                        Start assessment →
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/candidate/exam/${a.id}`); }}>
                        <AlarmClock className="mr-1 h-3.5 w-3.5" /> Assessment schedule →
                      </Button>
                    )
                  ) : null}
                  {a.status === "EXAM_IN_PROGRESS" ? (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/candidate/exam/${a.id}`); }}>
                      Resume exam →
                    </Button>
                  ) : null}
                  {a.status === "INTERVIEW_SCHEDULED" && a.interviewSchedules[0] ? (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/interview-room/${a.interviewSchedules[0].id}`); }}>
                      <Video className="mr-1 h-4 w-4" /> Join room
                    </Button>
                  ) : null}
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${funnelProgress(a.status)}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="eh-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle>{detail.job.title}</DialogTitle>
                <DialogDescription>{detail.job.company.companyName} · applied {formatDateTime(detail.createdAt)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Pre-screening match score</p>
                    <p className="text-xl font-bold">{detail.matchScore}/100</p>
                  </div>
                  <StatusBadge status={detail.status} />
                </div>

                {detail.examScore !== null ? (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Proctored assessment</p>
                    <p className="text-xl font-bold">{detail.examScore}% <span className="text-sm font-medium text-muted-foreground">({detail.examStatus})</span></p>
                    {detail.violationCount > 0 ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                        <FileWarning className="h-3.5 w-3.5" /> {detail.violationCount} proctoring violation(s) recorded
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {detail.rejectReason ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-700">{detail.rejectReason}</div>
                ) : null}

                <div>
                  <SectionTitle sub="Integrity audit trail recorded during your exam.">Proctoring log</SectionTitle>
                  <ScrollableLogs logs={logs} />
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScrollableLogs({ logs }: { logs: { id: string; eventType: string; details: string | null; createdAt: string }[] }) {
  if (logs.length === 0) return <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No proctoring events recorded.</p>;
  return (
    <div className="eh-scroll max-h-64 space-y-2 overflow-y-auto pr-1">
      {logs.map((l) => (
        <div key={l.id} className="flex items-start justify-between gap-2 rounded-lg border p-2.5 text-sm">
          <div>
            <Badge variant="outline" className="mr-2 text-[10px]">{PROCTORING_EVENT_LABELS[l.eventType] || l.eventType}</Badge>
            {l.details ? <span className="text-xs text-muted-foreground">{l.details}</span> : null}
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(l.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}
