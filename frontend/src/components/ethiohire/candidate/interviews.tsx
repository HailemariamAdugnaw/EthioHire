
/** EthioHire — Candidate interviews list (Stage 3 entry point) */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, SectionTitle } from "@/components/ethiohire/bits";
import { apiJson } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { formatDateTime } from "@/lib/constants";
import { Video, CalendarClock, EyeOff } from "lucide-react";

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
  /** Set by the backend while the employer holds the result (manual release). */
  resultWithheld?: boolean;
  resultReleaseAt?: string | null;
  application: { id: string; job: { title: string; company: { companyName: string } } };
}

export function CandidateInterviews() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson<{ interviews: Interview[] }>("/api/interviews")
      .then((d) => setInterviews(d.interviews))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading interviews…</div>;

  const scheduled = interviews.filter((i) => i.status === "SCHEDULED");
  const past = interviews.filter((i) => i.status !== "SCHEDULED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live interviews</h1>
        <p className="text-sm text-muted-foreground">Stage 3 — human-led voice/video sessions for candidates who passed the assessment.</p>
      </div>

      <SectionTitle sub="Join from here at the scheduled time — the room supports voice, video and answer recording.">Upcoming</SectionTitle>
      {scheduled.length === 0 ? (
        <EmptyState title="No upcoming interviews" body="Once you pass a proctored assessment, the recruiter schedules your live interview here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {scheduled.map((i) => (
            <Card key={i.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold">{i.application.job.title}</h3>
                    <p className="text-sm text-muted-foreground">{i.application.job.company.companyName}</p>
                  </div>
                  <Badge className="border-teal-200 bg-teal-50 text-teal-700" variant="outline">{i.format}</Badge>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary">
                  <CalendarClock className="h-4 w-4" /> {formatDateTime(i.scheduledTime)}
                  {i.endTime ? <span className="font-normal text-muted-foreground">– {new Date(i.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span> : null}
                </p>
                {i.slotDurationMinutes ? <p className="text-xs text-muted-foreground">Your reserved slot: {i.slotDurationMinutes} minutes</p> : null}
                {i.interviewerName ? <p className="mt-1 text-xs text-muted-foreground">Interviewer: {i.interviewerName}</p> : null}
                <Button className="mt-4 w-full" onClick={() => navigate(`/interview-room/${i.id}`)}>
                  <Video className="mr-1 h-4 w-4" /> Enter interview room
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {past.length > 0 ? (
        <>
          <SectionTitle>History</SectionTitle>
          <div className="space-y-2">
            {past.map((i) => (
              <Card key={i.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{i.application.job.title}</p>
                    <p className="text-xs text-muted-foreground">{i.application.job.company.companyName} · {formatDateTime(i.scheduledTime)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {i.resultWithheld ? (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700" data-testid="withheld-badge">
                        <EyeOff className="mr-1 h-3 w-3" />
                        Result withheld{(() => {
                          const t = i.resultReleaseAt ? new Date(i.resultReleaseAt).getTime() : 0;
                          return t > Date.now() ? ` — releases ${formatDateTime(i.resultReleaseAt!)}` : " — the employer will publish it";
                        })()}
                      </Badge>
                    ) : i.score !== null ? (
                      <Badge variant="outline">Score: {i.score}</Badge>
                    ) : null}
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
