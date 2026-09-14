
/** EthioHire — Candidate dashboard: funnel overview + application tracker */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState, ScoreRing, SectionTitle, StatCard, StatusBadge } from "@/components/ethiohire/bits";
import { apiJson, useAuth } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { formatDateTime } from "@/lib/constants";
import { Briefcase, FileSearch, GraduationCap, Trophy, Video, ChevronRight, ClipboardList } from "lucide-react";

interface AppRow {
  id: string;
  status: string;
  matchScore: number;
  examScore: number | null;
  examStatus: string | null;
  createdAt: string;
  job: { id: string; title: string; company: { companyName: string } };
}

interface InterviewRow {
  id: string;
  scheduledTime: string;
  status: string;
  application: { job: { title: string; company: { companyName: string } } };
}

export function CandidateDashboard() {
  const { user } = useAuth();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [a, iv] = await Promise.all([
          apiJson<{ applications: AppRow[] }>("/api/applications"),
          apiJson<{ interviews: InterviewRow[] }>("/api/interviews"),
        ]);
        setApps(a.applications);
        setInterviews(iv.interviews);
      } catch {
        /* session issue — central 401 handler manages the fallback */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const active = apps.filter((a) => !["REJECTED", "PRE_SCREEN_REJECTED", "HIRED"].includes(a.status));
  const passed = apps.filter((a) => ["EXAM_PASSED", "INTERVIEW_SCHEDULED", "INTERVIEW_COMPLETED", "SHORTLISTED"].includes(a.status)).length;
  const upcoming = interviews.filter((i) => i.status === "SCHEDULED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome, {user?.name?.split(" ")[0]} 👋</h1>
        <p className="text-sm text-muted-foreground">Track your applications through every stage of the EthioHire selection funnel.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Active applications" value={active.length} icon={<Briefcase className="h-4 w-4" />} hint="Currently in the funnel" />
        <StatCard label="Exams passed" value={passed} icon={<Trophy className="h-4 w-4" />} hint="Cleared proctored assessment" />
        <StatCard label="Interviews" value={upcoming.length} icon={<Video className="h-4 w-4" />} hint={upcoming.length ? `Next: ${formatDateTime(upcoming[0].scheduledTime)}` : "None scheduled"} />
        <StatCard label="Profile strength" value={apps.length || active.length ? "Ready" : "Setup"} icon={<GraduationCap className="h-4 w-4" />} hint="Structured CV & documents" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle sub="Every application moves through pre-screening → proctored exam → live interview.">My applications</SectionTitle>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
            </div>
          ) : apps.length === 0 ? (
            <EmptyState
              title="No applications yet"
              body="Browse the job board, apply with one structured form, and you'll instantly see whether you clear the pre-screening thresholds."
              action={<Button onClick={() => navigate("/candidate/jobs")}><FileSearch className="mr-1 h-4 w-4" /> Find jobs</Button>}
            />
          ) : (
            <div className="space-y-3">
              {apps.slice(0, 6).map((a) => (
                <Card key={a.id} className="transition-colors hover:border-primary/40">
                  <CardContent className="flex items-center gap-4 p-4">
                    <ScoreRing score={a.matchScore} size={56} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate font-semibold">{a.job.title}</p>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{a.job.company.companyName} · applied {formatDateTime(a.createdAt)}</p>
                      <div className="mt-2 max-w-xs">
                        <Progress value={funnelProgress(a.status)} className="h-1.5" />
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Open application" onClick={() => navigate("/candidate/applications")}>
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionTitle sub="Live voice/video sessions scheduled by employers.">Upcoming interviews</SectionTitle>
          {upcoming.length === 0 ? (
            <EmptyState title="No interviews scheduled" body="When you pass an assessment, recruiters schedule live interviews here." />
          ) : (
            <div className="space-y-3">
              {upcoming.map((i) => (
                <Card key={i.id}>
                  <CardContent className="p-4">
                    <p className="font-semibold">{i.application.job.title}</p>
                    <p className="text-xs text-muted-foreground">{i.application.job.company.companyName}</p>
                    <p className="mt-2 text-sm font-medium text-primary">{formatDateTime(i.scheduledTime)}</p>
                    <Button size="sm" className="mt-3 w-full" onClick={() => navigate(`/interview-room/${i.id}`)}>
                      <Video className="mr-1 h-4 w-4" /> Open interview room
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card className="mt-4 bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-2.5">
                <ClipboardList className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Complete your profile</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    A complete structured CV (education, GPA, salary expectation, documents) maximizes your pre-screening
                    match score.
                  </p>
                  <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate("/candidate/profile")}>
                    Update profile →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function funnelProgress(status: string): number {
  const map: Record<string, number> = {
    APPLIED: 25,
    PRE_SCREEN_REJECTED: 25,
    EXAM_SCHEDULED: 40,
    EXAM_IN_PROGRESS: 50,
    EXAM_PASSED: 75,
    EXAM_FAILED: 50,
    EXAM_TERMINATED: 50,
    EXAM_SUBMITTED: 65,
    INTERVIEW_SCHEDULED: 85,
    INTERVIEW_COMPLETED: 95,
    SHORTLISTED: 95,
    HIRED: 100,
    REJECTED: 95,
  };
  return map[status] ?? 10;
}
