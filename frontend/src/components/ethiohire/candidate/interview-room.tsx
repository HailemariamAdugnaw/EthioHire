
/**
 * EthioHire — Live Interview Room (Stage 3)
 *
 * Two transports, chosen automatically:
 *
 *  1. LiveKit (preferred) — when the backend reports LIVEKIT_URL /
 *     LIVEKIT_API_KEY / LIVEKIT_API_SECRET configured, the room joins a real
 *     WebRTC SFU room with a server-minted access token
 *     (`GET /api/interviews/:id/livekit`). Includes in-room question-bank
 *     display (interviewer drives, synced over the LiveKit data channel),
 *     structured scoring templates, chat and local answer recording.
 *
 *  2. Legacy fallback — the original socket.io signaling mini-service with
 *     raw peer-to-peer WebRTC (works without LiveKit).
 *
 * If the LiveKit connection fails after joining, the room degrades to the
 * legacy transport automatically.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { apiJson } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { formatDateTime } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Camera, CameraOff, CheckCircle2, ChevronLeft, ChevronRight, EyeOff, Loader2, MessageSquare, Mic, MicOff,
  PauseCircle, PhoneOff, Play, Radio, Send, ShieldCheck, Square, Video, WifiOff,
} from "lucide-react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
  VideoConference,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import type { Room } from "livekit-client";
import "@livekit/components-styles";

interface InterviewData {
  id: string;
  scheduledTime: string;
  format: string;
  status: string;
  meetingLink: string | null;
  interviewerName: string | null;
  score: number | null;
  notes: string | null;
  sessionState?: string;
  application: {
    id: string;
    job: {
      title: string;
      company: { companyName: string };
      /** Dedicated live-interview question bank (visibility-controlled).
       *  The proctored exam pool is deliberately NOT exposed to the room —
       *  live interviews always ask from this bank only. */
      interviewQuestions?: { id: string; questionText: string | null; guidance: string | null; visibleToCandidate?: boolean; order: number }[];
      questionsHidden?: boolean;
      interviewQuestionVisibility?: string;
      evaluationTemplate?: EvaluationTemplate;
    };
    candidate: { fullName: string };
  };
}

export interface EvaluationTemplate {
  configured: boolean;
  competencies: { key: string; label: string; weight?: number }[];
  scaleMax: number;
  rateQuestions: boolean;
  instructions: string | null;
}

type MeRole = "CANDIDATE" | "RECRUITER" | "OTHER";

/** Question bank shown in the room — the dedicated live-interview bank only.
 *  The proctored written-exam pool (assessmentQuestions) is NEVER used here:
 *  live interviews ask from the interviewQuestionBank, full stop. */
function roomQuestionBank(job: NonNullable<InterviewData["application"]["job"]>): { id: string; questionText: string | null; guidance: string | null; visibleToCandidate?: boolean; order: number }[] {
  return (job.interviewQuestions || []) as { id: string; questionText: string | null; guidance: string | null; visibleToCandidate?: boolean; order: number }[];
}

/** A question the candidate must never receive text for: job-wide HIDDEN mode
 * or the per-question visibleToCandidate=false toggle. Used both for the
 * data-channel broadcast payload and the interviewer's badge UI. */
function candidateNeverSees(q: { visibleToCandidate?: boolean } | undefined, jobHidden: boolean): boolean {
  return jobHidden || (q ? q.visibleToCandidate === false : false);
}

interface LiveKitInfo {
  configured: boolean;
  reason?: string;
  url?: string;
  token?: string;
  room?: string;
  identity?: string;
  name?: string;
  role?: "CANDIDATE" | "INTERVIEWER";
  expiresIn?: number;
}

interface ChatMsg { from: string; text: string; at: number; mine?: boolean }

export function InterviewRoom({ interviewId }: { interviewId: string }) {
  const [interview, setInterview] = useState<InterviewData | null>(null);
  const [meRole, setMeRole] = useState<MeRole>("OTHER");
  const [lk, setLk] = useState<LiveKitInfo | null>(null);
  const [lkFailed, setLkFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiJson<{ user: { role: string } | null }>("/api/auth/me");
        if (!me.user) throw new Error("Please sign in.");
        setMeRole(me.user.role === "CANDIDATE" ? "CANDIDATE" : me.user.role === "RECRUITER" ? "RECRUITER" : "OTHER");
        const [d, lkRes] = await Promise.all([
          apiJson<{ interview: InterviewData }>(`/api/interviews/${interviewId}`),
          apiJson<LiveKitInfo>(`/api/interviews/${interviewId}/livekit`).catch(() => ({ configured: false, reason: "LiveKit config unavailable" }) as LiveKitInfo),
        ]);
        setInterview(d.interview);
        setLk(lkRes);
      } catch (err) {
        toast({ title: "Cannot open interview room", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
        navigate("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [interviewId]);

  if (loading) {
    return <div className="py-24 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />Preparing interview room…</div>;
  }
  if (!interview) return null;

  const useLiveKit = lk?.configured && !lkFailed;
  return useLiveKit
    ? <LiveKitRoomView interview={interview} interviewId={interviewId} meRole={meRole} lk={lk!} onFallback={() => setLkFailed(true)} />
    : <LegacyInterviewRoom interviewId={interviewId} />;
}

// =====================================================================
// LiveKit transport (SFU)
// =====================================================================

function LiveKitRoomView({ interview, interviewId, meRole, lk, onFallback }: {
  interview: InterviewData;
  interviewId: string;
  meRole: MeRole;
  lk: LiveKitInfo;
  onFallback: () => void;
}) {
  const [joined, setJoined] = useState(false);
  // Recruiter Control Panel — session state (PAUSED shows a hold overlay on
  // the candidate's screen). Question visibility is NOT a live override: it
  // follows the configured job mode (SINGLE/ALL/HIDDEN) strictly.
  const [sessionPaused, setSessionPaused] = useState(interview.sessionState === "PAUSED");
  // "av" = publish camera+mic; "receive-only" = join without local media
  // (camera blocked / no webcam — still see, hear and chat); "legacy" = give
  // up on LiveKit and fall back to the socket.io transport.
  const [mediaMode, setMediaMode] = useState<"av" | "receive-only" | "legacy">("av");
  const isInterviewer = meRole === "RECRUITER" || meRole === "OTHER";
  const questions = roomQuestionBank(interview.application.job);

  useEffect(() => {
    if (mediaMode === "legacy") onFallback();
  }, [mediaMode, onFallback]);

  const withMedia = mediaMode === "av";

  return (
    <div className="space-y-5" data-testid="livekit-room">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Video className="h-6 w-6 text-primary" /> Interview room</h1>
          <p className="text-sm text-muted-foreground">
            {interview.application.job.title} · {interview.application.job.company.companyName} · {formatDateTime(interview.scheduledTime)}
          </p>
        </div>
        <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700" variant="outline">
          <Radio className="mr-1 h-3 w-3" /> Powered by LiveKit
        </Badge>
      </div>

      {!joined ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <Camera className="h-10 w-10 text-primary" />
            <div>
              <p className="font-bold">Ready to join the {interview.format.toLowerCase()} interview?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Low-latency video powered by LiveKit. Your camera and microphone stay under your control.
              </p>
              {lk.role === "INTERVIEWER" ? (
                <p className="mt-1 text-xs text-muted-foreground">You join as the interviewer — you drive the question display and submit the evaluation.</p>
              ) : null}
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button size="lg" onClick={() => setJoined(true)} data-testid="join-livekit">
                <Video className="mr-1.5 h-4 w-4" /> Join live room
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setMediaMode("receive-only"); setJoined(true); }} data-testid="join-listen-only">
                No camera? Join in listen-only mode
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <LiveKitRoom
          key={mediaMode}
          token={lk.token!}
          serverUrl={lk.url!}
          connect
          video={withMedia}
          audio={withMedia}
          data-testid="livekit-stage"
          onError={(err: unknown) => {
            if (withMedia) {
              // Camera/mic unavailable (blocked or missing) — degrade to a
              // listen-only connection instead of dropping the interview.
              console.warn("[EthioHire] Local media unavailable — joining listen-only:", err);
              toast({ title: "Camera/microphone unavailable", description: "Joining in listen-only mode — you can still see, hear and chat." });
              setMediaMode("receive-only");
            } else {
              console.error("[EthioHire] LiveKit connection failed — falling back to legacy room:", err);
              toast({ title: "Live connection failed", description: "Switching to the built-in interview transport.", variant: "destructive" });
              setMediaMode("legacy");
            }
          }}
          onDisconnected={() => toast({ title: "You left the interview room" })}
          style={{ height: "100%" }}
        >
          <div className={cn("grid gap-5", isInterviewer ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
            <div className={cn("space-y-4", isInterviewer && "lg:col-span-2")}>
              <div className="relative h-[540px] overflow-hidden rounded-2xl border bg-black shadow-sm lk-stage">
                <VideoConference />
                {sessionPaused ? (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/70 text-center backdrop-blur-sm" data-testid="session-paused-overlay">
                    <PauseCircle className="h-10 w-10 text-amber-300" />
                    <p className="text-lg font-bold text-white">Session paused</p>
                    <p className="max-w-sm text-sm text-white/70">
                      {isInterviewer
                        ? "The candidate sees this hold screen — audio is still open to you. Resume when ready."
                        : "The interviewer has paused the session. Please hold — the interview resumes shortly."}
                    </p>
                  </div>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                In-room chat, microphone and camera controls are built into the stage above.
              </p>
            </div>

            <div className="space-y-4">
              <QuestionBankPanel meRole={meRole} job={interview.application.job} />
              {isInterviewer ? (
                <>
                  <RoomControlPanel interviewId={interviewId} sessionPaused={sessionPaused} onPaused={setSessionPaused} />
                  <ScoringTemplatePanel interviewId={interviewId} questions={questions} template={interview.application.job.evaluationTemplate ?? { configured: false, competencies: [], scaleMax: 5, rateQuestions: true, instructions: null }} />
                </>
              ) : (
                <>
                  <CandidateControlHandler sessionPaused={sessionPaused} onPaused={setSessionPaused} />
                  <FinishSessionPanel interviewId={interviewId} />
                </>
              )}
            </div>
          </div>
          <RoomAudioRenderer />
          <ConnectionBadge />
        </LiveKitRoom>
      )}
    </div>
  );
}

function ConnectionBadge() {
  const state = useConnectionState();
  if (state === ConnectionState.Connected) {
    return (
      <div className="fixed bottom-4 left-4 z-40">
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
          <Radio className="mr-1 h-3 w-3" /> LiveKit connected
        </Badge>
      </div>
    );
  }
  if (state === ConnectionState.Connecting || state === ConnectionState.Reconnecting) {
    return (
      <div className="fixed bottom-4 left-4 z-40">
        <Badge className="border-amber-200 bg-amber-50 text-amber-700" variant="outline">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Connecting…
        </Badge>
      </div>
    );
  }
  return null;
}

// =====================================================================
// Recruiter live-session Control Panel + candidate-side handler
// =====================================================================

type ControlAction = "PAUSE" | "RESUME" | "REQUEST_MUTE" | "REQUEST_UNMUTE" | "DISCONNECT";

interface ControlMsg { t: "control"; action: ControlAction }

/** Publish a control command to the data channel AND record it server-side
 * (audit + sessionState persistence for rejoining clients). */
async function sendControl(room: Room | null, interviewId: string, action: ControlAction) {
  try {
    if (room) {
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ t: "control", action } satisfies ControlMsg)),
        { reliable: true },
      );
    }
  } catch { /* data channel not open yet */ }
  try {
    await apiJson(`/api/interviews/${interviewId}/control`, { method: "POST", body: JSON.stringify({ action }) });
  } catch { /* audited control is best-effort — session continues */ }
}

/** Interviewer-side control panel: manage the session state and handle
 * exceptions dynamically — all live. Question visibility is intentionally not
 * a control here: candidates see questions strictly per the configured mode
 * (SINGLE — one at a time / ALL — full list with active highlight / HIDDEN —
 * never shown), set in the Interview Setup module. */
function RoomControlPanel({ interviewId, sessionPaused, onPaused }: {
  interviewId: string;
  sessionPaused: boolean;
  onPaused: (p: boolean) => void;
}) {
  const room = useRoomContext();
  const [busy, setBusy] = useState("");

  const act = async (action: ControlAction) => {
    setBusy(action);
    await sendControl(room, interviewId, action);
    if (action === "PAUSE") onPaused(true);
    if (action === "RESUME") onPaused(false);
    if (action === "REQUEST_MUTE") toast({ title: "Mute request sent", description: "The candidate is asked to turn their microphone off." });
    if (action === "REQUEST_UNMUTE") toast({ title: "Unmute request sent", description: "The candidate is asked to turn their microphone back on." });
    if (action === "DISCONNECT") toast({ title: "Candidate removal sent", description: "The candidate's room session is being closed." });
    setBusy("");
  };

  return (
    <Card data-testid="control-panel">
      <CardContent className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Session control</p>
          {sessionPaused ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Paused</Badge> : <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Live</Badge>}
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Real-time controls — the candidate's screen updates instantly over the data channel. Every action is audit-logged.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {sessionPaused ? (
            <Button size="sm" variant="secondary" className="col-span-2" onClick={() => act("RESUME")} disabled={busy === "RESUME"} data-testid="control-resume">
              <Play className="mr-1 h-3.5 w-3.5" /> Resume session
            </Button>
          ) : (
            <Button size="sm" variant="secondary" className="col-span-2" onClick={() => act("PAUSE")} disabled={busy === "PAUSE"} data-testid="control-pause">
              <PauseCircle className="mr-1 h-3.5 w-3.5" /> Pause session
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => act("REQUEST_MUTE")} disabled={!!busy} data-testid="control-mute">
            <MicOff className="mr-1 h-3.5 w-3.5" /> Ask to mute
          </Button>
          <Button size="sm" variant="outline" onClick={() => act("REQUEST_UNMUTE")} disabled={!!busy} data-testid="control-unmute">
            <Mic className="mr-1 h-3.5 w-3.5" /> Ask to unmute
          </Button>
          <p className="col-span-2 text-[11px] leading-relaxed text-muted-foreground" data-testid="control-visibility-note">
            Question display follows the configured mode for this job (single question / full list / hidden) — set it in the Interview Setup module.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="col-span-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => act("DISCONNECT")}
            disabled={!!busy}
            data-testid="control-disconnect"
          >
            <PhoneOff className="mr-1 h-3.5 w-3.5" /> Remove candidate from room
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Candidate-side handler — honors the interviewer's control commands live. */
function CandidateControlHandler({ sessionPaused, onPaused }: {
  sessionPaused: boolean;
  onPaused: (p: boolean) => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    const on = (payload: Uint8Array) => {
      try {
        const d = JSON.parse(new TextDecoder().decode(payload)) as Partial<ControlMsg>;
        if (d?.t !== "control" || !d.action) return;
        switch (d.action) {
          case "PAUSE":
            onPaused(true);
            break;
          case "RESUME":
            onPaused(false);
            toast({ title: "Interview resumed", description: "You are back in the session." });
            break;
          case "REQUEST_MUTE":
            localParticipant.setMicrophoneEnabled(false).catch(() => {});
            toast({ title: "The interviewer asked you to mute", description: "Your microphone was turned off — you can turn it back on from the toolbar when ready." });
            break;
          case "REQUEST_UNMUTE":
            toast({ title: "The interviewer asked you to unmute", description: "Turn your microphone on from the toolbar when ready." });
            break;
          case "DISCONNECT":
            toast({ title: "The interviewer ended your session", description: "You have been removed from the interview room." });
            try { room.disconnect(); } catch { /* already gone */ }
            navigate("/candidate/interviews");
            break;
        }
      } catch { /* ignore malformed payloads */ }
    };
    room.on(RoomEvent.DataReceived, on);
    return () => { room.off(RoomEvent.DataReceived, on); };
  }, [room, onPaused, localParticipant]);

  // Joined while the interviewer already paused — reflect it immediately.
  useEffect(() => {
    if (sessionPaused) onPaused(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!sessionPaused) return null;
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700" data-testid="candidate-hold-note">
      The interviewer paused the session — please hold.
    </p>
  );
}

/** Question-bank display — the interviewer drives which question is active;
 * the change is broadcast to the candidate over the LiveKit data channel.
 *
 * Visibility is bound STRICTLY to the mode configured for the job in the
 * Interview Setup module — there is no live/global toggle:
 *   SINGLE — candidate sees one question at a time; the question TEXT arrives
 *            inside the broadcast payload (the API masks all texts)
 *   ALL    — candidate sees the full question list + the active highlight
 *   HIDDEN — candidate sees no questions at all
 */
function QuestionBankPanel({ meRole, job }: { meRole: MeRole; job: NonNullable<InterviewData["application"]["job"]> }) {
  const room = useRoomContext();
  const [activeQ, setActiveQ] = useState(0);
  const [broadcastText, setBroadcastText] = useState<string | null>(null);
  const isInterviewer = meRole !== "CANDIDATE";
  const questions = roomQuestionBank(job);
  // Job-wide HIDDEN mode as configured during setup — nothing else can change it.
  const hidden = job.questionsHidden === true;

  useEffect(() => {
    const on = (payload: Uint8Array) => {
      try {
        const d = JSON.parse(new TextDecoder().decode(payload)) as { t?: string; i?: number; text?: string };
        if (d?.t === "q" && typeof d.i === "number") {
          setActiveQ(d.i);
          if (typeof d.text === "string") setBroadcastText(d.text);
        }
      } catch { /* ignore malformed payloads */ }
    };
    room.on(RoomEvent.DataReceived, on);
    return () => { room.off(RoomEvent.DataReceived, on); };
  }, [room]);

  const pushQuestion = useCallback((i: number) => {
    setActiveQ(i);
    // Per-question privacy: individually hidden questions broadcast WITHOUT
    // their text so a candidate on the data channel can never read them.
    const q = questions[i];
    const text = q && !candidateNeverSees(q, hidden) ? (q.questionText ?? null) : null;
    try {
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ t: "q", i, text })),
        { reliable: true },
      );
    } catch { /* data channel not open yet */ }
  }, [room, questions, hidden]);

  // Latest panel state for the sync effects below (no re-subscription churn).
  const stateRef = useRef({ activeQ, questions, isInterviewer });
  stateRef.current = { activeQ, questions, isInterviewer };

  useEffect(() => {
    const publishCurrent = () => {
      const { activeQ: i, questions: qs } = stateRef.current;
      const q = qs[i];
      const text = q && !candidateNeverSees(q, hidden) ? (q.questionText ?? null) : null;
      try {
        room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ t: "q", i, text })),
          { reliable: true },
        );
      } catch { /* data channel not open yet */ }
    };

    if (stateRef.current.isInterviewer) {
      // Publish the active question shortly after joining so a candidate who
      // is already in the room sees it immediately, and answer explicit sync
      // requests from candidates joining later.
      const boot = window.setTimeout(publishCurrent, 1200);
      const on = (payload: Uint8Array) => {
        try {
          const d = JSON.parse(new TextDecoder().decode(payload)) as { t?: string };
          if (d?.t === "qsync") publishCurrent();
        } catch { /* ignore malformed payloads */ }
      };
      room.on(RoomEvent.DataReceived, on);
      return () => { window.clearTimeout(boot); room.off(RoomEvent.DataReceived, on); };
    }

    // Candidate — ask the interviewer to (re-)send the active question.
    const ask = window.setTimeout(() => {
      try {
        room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ t: "qsync" })),
          { reliable: true },
        );
      } catch { /* data channel not open yet */ }
    }, 1500);
    return () => window.clearTimeout(ask);
  }, [room, hidden]);

  if (hidden && !isInterviewer) {
    return (
      <Card data-testid="question-bank-hidden">
        <CardContent className="p-5">
          <p className="text-sm font-semibold">Interview questions</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The employer has chosen not to display questions during this session — simply follow the conversation.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (questions.length === 0) return null;

  // Candidate in SINGLE mode receives the text via the data channel;
  // interviewer and ALL-mode candidates read it straight from the list.
  const currentText = !isInterviewer && !hidden ? (broadcastText ?? "The interviewer will present the first question shortly.") : (questions[Math.min(activeQ, questions.length - 1)]?.questionText ?? "");
  const current = questions[Math.min(activeQ, questions.length - 1)];

  return (
    <Card data-testid="question-bank">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Interview questions ({questions.length})</p>
          <span className="text-xs text-muted-foreground" data-testid="question-progress">Question {Math.min(activeQ, questions.length - 1) + 1} of {questions.length}</span>
        </div>

        {/* current question display */}
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold leading-snug" data-testid="current-question">{currentText}</p>
          {!isInterviewer && current?.guidance ? null : null}
          {isInterviewer ? (
            <>
              {current?.guidance ? (
                <p className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground" data-testid="question-guidance">
                  <span className="font-semibold">Look for:</span> {current.guidance}
                </p>
              ) : null}
              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={activeQ === 0} onClick={() => pushQuestion(activeQ - 1)} aria-label="Previous question">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={activeQ >= questions.length - 1} onClick={() => pushQuestion(activeQ + 1)} aria-label="Next question">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {hidden || current?.visibleToCandidate === false
                    ? "Hidden from the candidate's screen"
                    : "Shown live on the candidate's screen"}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">The interviewer drives the question display.</p>
          )}
        </div>

        {/* full list — interviewer always; candidate only in ALL mode */}
        {isInterviewer || (!hidden && questions[0]?.questionText !== null) ? (
          <div className="eh-scroll mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => isInterviewer && pushQuestion(i)}
                className={cn(
                  "block w-full rounded-lg border px-3 py-2 text-left text-xs leading-snug transition-colors",
                  i === activeQ ? "border-primary/50 bg-primary/5 font-medium" : "border-transparent bg-muted/40 hover:bg-muted",
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  {i + 1}. {q.questionText}
                  {isInterviewer && q.visibleToCandidate === false ? (
                    <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700">
                      <EyeOff className="h-2.5 w-2.5" /> hidden
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Structured scoring template — driven by the recruiter-configured template
 * (competencies, rating scale, per-question ratings) with comments, submitted
 * via POST /api/interviews/:id/evaluation. The overall score is NOT manual
 * entry: it is auto-summed from the competency ratings
 * (earned ÷ possible × 100) both here and server-side. Falls back to the
 * default competency set when the job has no template. */
function ScoringTemplatePanel({ interviewId, questions, template, onSubmitted }: {
  interviewId: string;
  questions: { id: string; questionText: string | null }[];
  template: EvaluationTemplate;
  /** Called after a successful submission instead of navigating (legacy room reuse). */
  onSubmitted?: () => void;
}) {
  const competencies = template.competencies?.length
    ? template.competencies
    : [
        { key: "communication", label: "Communication", weight: 1 },
        { key: "technical", label: "Technical depth", weight: 1 },
        { key: "problem_solving", label: "Problem solving", weight: 1 },
        { key: "culture", label: "Culture fit", weight: 1 },
      ];
  const scaleMax = Math.max(1, Math.min(10, template.scaleMax || 5));
  const scale = Array.from({ length: scaleMax }, (_, i) => i + 1);
  const weightOf = (c: { weight?: number }) => Math.max(1, Math.min(10, c.weight ?? 1));

  const [qRatings, setQRatings] = useState<Record<string, number>>({});
  const [competency, setCompetency] = useState<Record<string, number>>({});
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);

  // Overall score — WEIGHTED auto-sum: each competency contributes
  // rating × weight, normalized by Σ(scale × weight) × 100. With equal
  // weights this is the classic flat average.
  const earned = competencies.reduce((acc, c) => acc + (competency[c.key] || 0) * weightOf(c), 0);
  const possible = competencies.reduce((acc, c) => acc + scaleMax * weightOf(c), 0);
  const autoOverall = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  const ratedCount = competencies.filter((c) => (competency[c.key] || 0) > 0).length;

  const submit = async () => {
    if (ratedCount === 0) {
      toast({ title: "Rate the competencies first", description: "The overall score is summed from the competency ratings automatically — rate at least one competency.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiJson(`/api/interviews/${interviewId}/evaluation`, {
        method: "POST",
        body: JSON.stringify({
          overallScore: autoOverall,
          competencyScores: competencies.map((c) => ({ key: c.key, label: c.label, score: competency[c.key] || 0, weight: weightOf(c) })),
          questionRatings: template.rateQuestions
            ? questions.map((q) => ({ questionId: q.id, score: qRatings[q.id] || 0, note: "" }))
            : [],
          comments,
        }),
      });
      toast({ title: "Evaluation submitted", description: `Overall ${autoOverall}/100 (auto-summed from competencies). The candidate has been notified per the job's result release setting.` });
      if (onSubmitted) onSubmitted();
      else navigate("/recruiter/interviews");
    } catch (err) {
      toast({ title: "Failed to submit evaluation", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="scoring-template">
      <CardContent className="p-4">
        <p className="mb-1 text-sm font-semibold">Interview scoring template</p>
        <p className="mb-3 text-[11px] text-muted-foreground">
          {template.configured ? "Configured by the recruiter for this job." : "Default template — configure it in the job editor."}
        </p>
        {template.instructions ? (
          <p className="mb-3 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground" data-testid="template-instructions">{template.instructions}</p>
        ) : null}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="lk-overall">Overall score (0–100)</Label>
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-[10px] text-primary">Auto-summed</Badge>
            </div>
            <div id="lk-overall" data-testid="overall-auto" className="flex items-baseline gap-1.5 rounded-md border bg-muted/40 px-3 py-2">
              <span className="text-2xl font-bold tabular-nums">{autoOverall}</span>
              <span className="text-[11px] text-muted-foreground">/ 100 · {ratedCount}/{competencies.length} competencies rated</span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              No manual entry — the overall score is summed automatically from the competency ratings below
              ({competencies.some((c) => weightOf(c) !== 1) ? "weighted: rating × weight ÷ possible × 100" : "earned ÷ possible × 100"}).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Competencies (1–{scaleMax})</Label>
            {competencies.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {c.label}
                  {weightOf(c) !== 1 ? (
                    <span className="ml-1.5 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-px text-[10px] font-semibold text-indigo-700" title={`Weighted competency — counts ×${weightOf(c)} toward the overall score`}>
                      ×{weightOf(c)}
                    </span>
                  ) : null}
                </span>
                <div className="flex gap-1">
                  {scale.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${c.label} ${n}`}
                      onClick={() => setCompetency((s) => ({ ...s, [c.key]: n }))}
                      className={cn(
                        "h-6 w-6 rounded-md border text-[11px] font-medium transition-colors",
                        (competency[c.key] || 0) >= n ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {template.rateQuestions && questions.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Per-question rating (1–{scaleMax})</Label>
              <div className="eh-scroll max-h-28 space-y-1 overflow-y-auto pr-1">
                {questions.map((q, i) => (
                  <div key={q.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                    <span className="truncate text-[11px] text-muted-foreground">Q{i + 1}</span>
                    <div className="flex gap-1">
                      {scale.map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={`Question ${i + 1} rating ${n}`}
                          onClick={() => setQRatings((s) => ({ ...s, [q.id]: n }))}
                          className={cn(
                            "h-5 w-5 rounded border text-[10px] font-medium",
                            (qRatings[q.id] || 0) >= n ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="lk-comments">Structured evaluation notes</Label>
            <Textarea id="lk-comments" rows={3} placeholder="Communication ✓, technical depth ✓, culture fit ✓…" value={comments} onChange={(e) => setComments(e.target.value)} />
          </div>
          <Button className="w-full" onClick={submit} disabled={saving} data-testid="submit-evaluation">
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
            Submit evaluation & complete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FinishSessionPanel({ interviewId }: { interviewId: string }) {
  const [completing, setCompleting] = useState(false);
  const room = useRoomContext();
  const { cameraTrack, microphoneTrack } = useLocalParticipant();
  // TrackPublication -> Track -> mediaStreamTrack
  const localVideoMs = cameraTrack?.track?.mediaStreamTrack;
  const localAudioMs = microphoneTrack?.track?.mediaStreamTrack;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  const markComplete = async () => {
    setCompleting(true);
    try {
      await apiJson(`/api/interviews/${interviewId}`, { method: "PATCH", body: JSON.stringify({ status: "COMPLETED" }) });
      toast({ title: "Interview marked complete" });
      try { room.disconnect(); } catch { /* already gone */ }
      navigate("/candidate/interviews");
    } catch (err) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  const toggleRecording = () => {
    if (recording) { recorderRef.current?.stop(); return; }
    const tracks = [localVideoMs, localAudioMs].filter(Boolean) as MediaStreamTrack[];
    if (tracks.length === 0) {
      toast({ title: "No local media yet", description: "Join with camera/microphone enabled to record.", variant: "destructive" });
      return;
    }
    try {
      const stream = new MediaStream(tracks);
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setLastUrl(URL.createObjectURL(blob));
        setRecording(false);
        toast({ title: "Answer recorded", description: "Your recorded response is ready for playback." });
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast({ title: "Recording not supported in this browser", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-2 text-sm font-semibold">Finish session</p>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          When the conversation is over, mark the interview complete — the recruiter is notified and finalizes the decision.
        </p>
        <div className="mb-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={toggleRecording}>
            {recording ? <><Square className="mr-1 h-3 w-3" /> Stop recording</> : <><Radio className="mr-1 h-3 w-3 text-destructive" /> Record answer</>}
          </Button>
          {lastUrl ? (
            <a href={lastUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border px-2 text-xs hover:bg-accent" aria-label="Play recording">
              <Play className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
        <Button className="w-full" variant="secondary" onClick={markComplete} disabled={completing} data-testid="candidate-complete">
          {completing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
          Mark interview complete
        </Button>
        <Separator className="my-3" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Tip: record a video answer per question — the interviewer reviews recordings after the session.
        </p>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// Legacy transport — socket.io signaling + raw WebRTC (LiveKit-free fallback)
// =====================================================================

function LegacyInterviewRoom({ interviewId }: { interviewId: string }) {
  const [interview, setInterview] = useState<InterviewData | null>(null);
  const [meRole, setMeRole] = useState<MeRole>("OTHER");
  const [loading, setLoading] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [peerConnected, setPeerConnected] = useState(false);
  const [live, setLive] = useState(false); // signaling connected
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordings, setRecordings] = useState<Record<string, string>>({}); // questionId -> blob url
  const [activeQ, setActiveQ] = useState(0);
  const [completing, setCompleting] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<import("socket.io-client").Socket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiJson<{ user: { role: string } | null }>("/api/auth/me");
        if (!me.user) throw new Error("Please sign in.");
        setMeRole(me.user.role === "CANDIDATE" ? "CANDIDATE" : me.user.role === "RECRUITER" ? "RECRUITER" : "OTHER");
        const d = await apiJson<{ interview: InterviewData }>(`/api/interviews/${interviewId}`);
        setInterview(d.interview);
      } catch (err) {
        toast({ title: "Cannot open interview room", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
        navigate("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [interviewId]);

  // ---------------- media ----------------
  const startMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch(() => {});
      }
      setCamOn(true);
      // connect to signaling after media is on
      connectSignaling(stream);
    } catch {
      toast({
        title: "Camera/microphone blocked",
        description: "Allow camera and microphone access to join the live interview room.",
        variant: "destructive",
      });
    }
  }, [interviewId]);

  // ---------------- WebRTC + signaling ----------------
  const connectSignaling = useCallback(
    (stream: MediaStream) => {
      (async () => {
        try {
          const { io } = await import("socket.io-client");
          const SIGNALING_URL = (import.meta.env.VITE_SIGNALING_URL as string | undefined) || "/?XTransformPort=3031";
          const socket = io(SIGNALING_URL, { path: "/", transports: ["websocket", "polling"], reconnectionAttempts: 3 });
          socketRef.current = socket;

          socket.on("connect", () => {
            setLive(true);
            socket.emit("join-room", { room: `interview-${interviewId}`, name: meRole === "CANDIDATE" ? interview?.application.candidate.fullName || "Candidate" : interview?.interviewerName || "Interviewer" });
          });
          socket.on("connect_error", () => setLive(false));
          socket.on("disconnect", () => setLive(false));

          socket.on("room-peers", async ({ peers }: { peers: string[] }) => {
            if (peers.length > 0) {
              // we joined second → create the offer
              await createPeer(stream);
              const pc = pcRef.current;
              if (pc) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit("signal", { room: `interview-${interviewId}`, data: { type: "offer", sdp: offer } });
              }
            }
          });

          socket.on("signal", async ({ data }: { data: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
            if (data.type === "offer") {
              await createPeer(stream);
              const pc = pcRef.current!;
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp!));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit("signal", { room: `interview-${interviewId}`, data: { type: "answer", sdp: answer } });
            } else if (data.type === "answer" && pcRef.current) {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp!));
            } else if (data.type === "ice" && pcRef.current && data.candidate) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
            }
          });

          socket.on("chat", ({ from, text, mine }: { from: string; text: string; mine?: boolean }) => {
            setChat((c) => [...c, { from, text, at: Date.now(), mine }]);
          });

          socket.on("peer-left", () => {
            setPeerConnected(false);
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
          });
        } catch {
          setLive(false);
        }
      })();
    },
    [interviewId, interview],
  );

  const createPeer = useCallback(
    async (stream: MediaStream) => {
      if (pcRef.current) return pcRef.current;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current?.emit("signal", { room: `interview-${interviewId}`, data: { type: "ice", candidate: e.candidate.toJSON() } });
        }
      };
      pc.ontrack = (e) => {
        if (remoteVideoRef.current && e.streams[0]) {
          remoteVideoRef.current.srcObject = e.streams[0];
          setPeerConnected(true);
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setPeerConnected(true);
      };
      return pc;
    },
    [interviewId],
  );

  // ---------------- recording ----------------
  const toggleRecording = (questionId: string) => {
    const stream = streamRef.current;
    if (!stream) return;
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecordings((r) => ({ ...r, [questionId]: URL.createObjectURL(blob) }));
        setRecording(false);
        toast({ title: "Answer recorded", description: "Your recorded response is ready for playback." });
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast({ title: "Recording not supported in this browser", variant: "destructive" });
    }
  };

  // ---------------- lifecycle ----------------
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
      socketRef.current?.disconnect();
    };
  }, []);

  const toggleCam = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    }
  };

  const toggleMic = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  };

  const hangUp = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    socketRef.current?.disconnect();
    navigate(meRole === "CANDIDATE" ? "/candidate/interviews" : "/recruiter/interviews");
  };

  const sendChat = () => {
    if (!chatDraft.trim()) return;
    socketRef.current?.emit("chat", { room: `interview-${interviewId}`, from: meRole === "CANDIDATE" ? "Candidate" : "Interviewer", text: chatDraft.trim() });
    setChat((c) => [...c, { from: "Me", text: chatDraft.trim(), at: Date.now(), mine: true }]);
    setChatDraft("");
  };

  const markComplete = async () => {
    setCompleting(true);
    try {
      await apiJson(`/api/interviews/${interviewId}`, { method: "PATCH", body: JSON.stringify({ status: "COMPLETED" }) });
      toast({ title: "Interview marked complete" });
      hangUp();
    } catch (err) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  // Recruiter scoring now uses the shared ScoringTemplatePanel (auto-summed
  // overall from competency ratings) — submitted via the structured evaluation
  // endpoint, which marks the interview COMPLETED and applies the job's
  // result-release mode. hangUp closes the legacy session afterwards.

  // ---------------- render ----------------
  if (loading) return <div className="py-24 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />Preparing interview room…</div>;
  if (!interview) return null;

  const jobCfg = interview.application.job;
  const hidden = jobCfg.questionsHidden === true;
  const isCand = meRole === "CANDIDATE";
  // Legacy transport has no live question broadcast — candidates only see the
  // list when the recruiter set visibility to ALL (SINGLE/HIDDEN stay hidden).
  const questions = (
    isCand && (hidden || (jobCfg.interviewQuestionVisibility ?? "SINGLE") !== "ALL")
      ? []
      : roomQuestionBank(jobCfg)
  ) as { id: string; questionText: string | null }[];
  const allQuestions = roomQuestionBank(jobCfg);

  return (
    <div className="space-y-5" data-testid="legacy-room">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Video className="h-6 w-6 text-primary" /> Interview room</h1>
          <p className="text-sm text-muted-foreground">
            {interview.application.job.title} · {interview.application.job.company.companyName} · {formatDateTime(interview.scheduledTime)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {live ? (
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline"><Radio className="mr-1 h-3 w-3" /> Live signaling</Badge>
          ) : (
            <Badge className="border-amber-200 bg-amber-50 text-amber-700" variant="outline"><WifiOff className="mr-1 h-3 w-3" /> Local mode</Badge>
          )}
          {peerConnected ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">Peer connected</Badge> : null}
        </div>
      </div>

      {!camOn ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <Camera className="h-10 w-10 text-primary" />
            <div>
              <p className="font-bold">Ready to join the {interview.format.toLowerCase()} interview?</p>
              <p className="mt-1 text-sm text-muted-foreground">Your camera and microphone stay under your control — enable them to go live.</p>
            </div>
            <Button size="lg" onClick={startMedia}><Video className="mr-1.5 h-4 w-4" /> Enable camera & join</Button>
          </CardContent>
        </Card>
      ) : null}

      <div className={cn("grid gap-5", meRole === "RECRUITER" ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {/* video area */}
        <div className={cn("space-y-4", meRole === "RECRUITER" && "lg:col-span-2")}>
          {isCand && questions.length === 0 && allQuestions.length > 0 ? (
            <Card data-testid="legacy-questions-hidden">
              <CardContent className="p-4">
                <p className="text-sm font-semibold">Interview questions</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {hidden
                    ? "The employer has chosen not to display questions during this session — simply follow the conversation."
                    : "Questions are presented one at a time by the interviewer in the live room — simply follow the conversation."}
                </p>
              </CardContent>
            </Card>
          ) : null}
          <div className="relative overflow-hidden rounded-2xl border bg-black shadow-sm">
            <video ref={remoteVideoRef} autoPlay playsInline className="aspect-video w-full object-cover" />
            {!peerConnected ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Waiting for the {meRole === "CANDIDATE" ? "interviewer" : "candidate"} to connect…</p>
                <p className="text-xs text-white/50">Both sides must enable camera in the same room.</p>
              </div>
            ) : (
              <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                {meRole === "CANDIDATE" ? interview.interviewerName || "Interviewer" : interview.application.candidate.fullName}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative overflow-hidden rounded-lg border border-primary/40 bg-black">
              <video ref={localVideoRef} muted playsInline className="h-24 w-36 object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">YOU</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={toggleCam} aria-label={camOn ? "Turn camera off" : "Turn camera on"}>
                {camOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4 text-destructive" />}
              </Button>
              <Button variant="outline" size="icon" onClick={toggleMic} aria-label={micOn ? "Mute microphone" : "Unmute microphone"}>
                {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-destructive" />}
              </Button>
              <Button variant="destructive" onClick={hangUp}><PhoneOff className="mr-1 h-4 w-4" /> Leave</Button>
            </div>
          </div>

          {/* question bank + recording (candidate) */}
          {questions.length > 0 ? (
            <Card>
              <CardContent className="p-5">
                <p className="mb-3 text-sm font-semibold">Interview question bank ({questions.length})</p>
                <div className="eh-scroll max-h-72 space-y-2 overflow-y-auto pr-1">
                  {questions.map((q, i) => (
                    <div key={q.id} className={cn("rounded-lg border p-3 transition-colors", activeQ === i && "border-primary/50 bg-primary/5")}>
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => setActiveQ(i)} className="text-left text-sm font-medium leading-snug">
                          {i + 1}. {q.questionText}
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          {recordings[q.id] ? (
                            <a href={recordings[q.id]} target="_blank" rel="noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-primary hover:bg-accent" aria-label="Play recording">
                              <Play className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          {meRole === "CANDIDATE" ? (
                            <Button variant="outline" size="sm" className="h-7" onClick={() => toggleRecording(q.id)}>
                              {recording && activeQ === i ? <><Square className="mr-1 h-3 w-3" /> Stop</> : <><Radio className="mr-1 h-3 w-3 text-destructive" /> Record</>}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {meRole === "CANDIDATE"
                    ? "Select a question and record your answer — the interviewer reviews recordings after the session."
                    : "Display questions one by one and use the score panel to grade the session."}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* side panel: chat + scoring */}
        <div className="space-y-4">
          {/* chat */}
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-primary" /> In-room chat</p>
              <div className="eh-scroll mb-2 h-44 space-y-1.5 overflow-y-auto rounded-lg border bg-muted/30 p-2.5">
                {chat.length === 0 ? (
                  <p className="pt-10 text-center text-xs text-muted-foreground">Messages appear here once both sides are live.</p>
                ) : (
                  chat.map((m, i) => (
                    <div key={i} className={cn("max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs", m.mine ? "ml-auto bg-primary text-primary-foreground" : "bg-card border")}>
                      <b className="mr-1">{m.from}:</b>{m.text}
                    </div>
                  ))
                )}
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
                <Input placeholder="Type a message…" value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} aria-label="Chat message" />
                <Button type="submit" size="icon" variant="secondary" aria-label="Send"><Send className="h-4 w-4" /></Button>
              </form>
            </CardContent>
          </Card>

          {/* role-specific panel */}
          {meRole === "RECRUITER" ? (
            <ScoringTemplatePanel
              interviewId={interviewId}
              questions={allQuestions}
              template={jobCfg.evaluationTemplate ?? { configured: false, competencies: [], scaleMax: 5, rateQuestions: true, instructions: null }}
              onSubmitted={hangUp}
            />
          ) : (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-semibold">Finish session</p>
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                  When the conversation is over, mark the interview complete — the recruiter is notified and finalizes
                  the decision (shortlist, offer, or rejection).
                </p>
                <Button className="w-full" variant="secondary" onClick={markComplete} disabled={completing}>
                  {completing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                  Mark interview complete
                </Button>
                <Separator className="my-3" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Tip: use the Record button next to each question to capture structured video answers for later review.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
