
/**
 * EthioHire — Stage 2: Proctored Online Assessment (client engine)
 *
 * Scheduled Text Exam Engine (Feature 3):
 *  - Candidates pooled by the recruiter into one session see a live countdown;
 *    the exam unlocks at the exact same timestamp for everyone.
 *  - Every candidate runs on the identical countdown window (scheduledAt →
 *    scheduledAt + durationMinutes); the attempt auto-submits when it closes.
 *  - Configurable result visibility: in MANUAL release mode the completion
 *    screen never reveals the score until the recruiter publishes results.
 *
 * Anti-cheating controls implemented here:
 *  - Fullscreen enforcement with blocking overlay on exit (FULLSCREEN_EXIT)
 *  - Tab-switch / window-blur detection (TAB_SWITCH / WINDOW_BLUR)
 *  - Copy, paste, cut, right-click and shortcut blocking (COPY_PASTE / RIGHT_CLICK)
 *  - Active webcam feed + periodic snapshot capture uploaded to the audit log
 *  - Face-presence watchdog: webcam stream loss logs FACE_MISSING
 *  - Strict per-question timer with auto-advance (prevents external AI/search use)
 *  - Automatic exam termination once the job's max violation count is reached
 *
 * All grading happens server-side; the client never sees correct answers.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { apiJson } from "@/lib/auth-client";
import { navigate } from "@/components/ethiohire/hash-router";
import { cn } from "@/lib/utils";
import { formatCountdown, formatDateTime } from "@/lib/constants";
import {
  AlarmClock, Camera, CameraOff, CheckCircle2, ChevronRight, ClipboardList, Eye, Loader2,
  Lock, ShieldAlert, ShieldCheck, Timer, XCircle,
} from "lucide-react";

interface ExamQuestion {
  id: string;
  questionText: string;
  questionType: "MCQ" | "TRUE_FALSE" | "FILL_BLANK" | "TEXT";
  options: string[] | null;
  timeLimitSeconds: number;
  order: number;
}

interface ExamSessionInfo {
  scheduledAt: string;
  endsAt: string;
  durationMinutes: number;
  releaseMode: string;
}

interface ExamData {
  applicationId: string;
  jobTitle: string;
  passMark: number;
  maxViolations: number;
  violationCount: number;
  questions: ExamQuestion[];
  savedAnswers: { questionId: string; answer: string | null }[];
  startedAt: string;
  session: ExamSessionInfo | null;
}

type Phase = "loading" | "scheduled" | "closed" | "gate" | "active" | "submitting" | "done" | "error";

export function ExamRoom({ applicationId }: { applicationId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [violations, setViolations] = useState(0);
  const [fullscreenBroken, setFullscreenBroken] = useState(false);
  const [webcamOn, setWebcamOn] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean; terminated?: boolean; withheld?: boolean; alreadyDone?: boolean } | null>(null);
  const [session, setSession] = useState<ExamSessionInfo | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const questionStartRef = useRef<number>(Date.now());
  const snapshotTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const violationsRef = useRef(0);
  const phaseRef = useRef<Phase>("loading");
  const qIndexRef = useRef(0);

  phaseRef.current = phase;
  answersRef.current = answers;
  violationsRef.current = violations;
  qIndexRef.current = qIndex;

  // ------------------------------------------------------------------ loaders
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiJson<{ user: { role: string } | null }>("/api/auth/me");
        if (!me.user || me.user.role !== "CANDIDATE") throw new Error("Sign in as a candidate to take assessments.");

        // Scheduled Text Exam Engine — check the pooled session state first
        const st = await apiJson<{ exam: {
          examStatus: string | null;
          canStart: boolean;
          locked: boolean;
          windowOver: boolean;
          resultsWithheld?: boolean;
          session: ExamSessionInfo | null;
          savedAnswers: { questionId: string; answer: string | null }[];
        } }>(`/api/applications/${applicationId}/exam`, { method: "POST", body: JSON.stringify({ action: "status" }) });
        if (cancelled) return;
        setSession(st.exam.session);

        // MANUAL release mode — the attempt is complete but scores are held
        // until the recruiter publishes them; never show pass/fail here.
        if (st.exam.resultsWithheld) {
          setResult({ score: 0, passed: false, withheld: true });
          setPhase("done");
          return;
        }

        const completed = ["PASSED", "FAILED", "TERMINATED", "SUBMITTED"].includes(st.exam.examStatus || "");
        if (completed) {
          // Already done — the applications page holds the authoritative result.
          setResult({ score: 0, passed: false, alreadyDone: true });
          setPhase("done");
          return;
        }
        if (st.exam.locked) {
          setPhase("scheduled");
          return;
        }
        if (st.exam.windowOver && !st.exam.canStart) {
          setPhase("closed");
          return;
        }

        const d = await apiJson<{ exam: ExamData }>(`/api/applications/${applicationId}/exam`, {
          method: "POST",
          body: JSON.stringify({ action: "start" }),
        });
        if (cancelled) return;
        setExam(d.exam);
        setSession(d.exam.session);
        setViolations(d.exam.violationCount);
        const saved = Object.fromEntries(d.exam.savedAnswers.map((a) => [a.questionId, a.answer || ""]));
        setAnswers(saved);
        const firstUnanswered = Math.max(0, d.exam.questions.findIndex((q) => !saved[q.id]));
        setQIndex(firstUnanswered);
        setPhase("gate");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load exam");
        setPhase("error");
      }
    })();
    return () => { cancelled = true; };
  }, [applicationId]);

  // Live ticker for the pre-exam countdown and the shared exam window
  useEffect(() => {
    if (phase !== "scheduled" && phase !== "active" && phase !== "gate") return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Scheduled session unlocking — flip from the countdown screen to the gate
  useEffect(() => {
    if (phase !== "scheduled" || !session) return;
    if (nowTick >= new Date(session.scheduledAt).getTime()) {
      // window may already be over by the time we get here
      if (nowTick >= new Date(session.endsAt).getTime()) {
        setPhase("closed");
        return;
      }
      (async () => {
        try {
          const d = await apiJson<{ exam: ExamData }>(`/api/applications/${applicationId}/exam`, {
            method: "POST",
            body: JSON.stringify({ action: "start" }),
          });
          setExam(d.exam);
          setSession(d.exam.session);
          setViolations(d.exam.violationCount);
          setAnswers(Object.fromEntries(d.exam.savedAnswers.map((a) => [a.questionId, a.answer || ""])));
          setQIndex(0);
          setPhase("gate");
          toast({ title: "The assessment is now open", description: "Good luck — every candidate started at the same moment." });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load exam");
          setPhase("error");
        }
      })();
    }
  }, [phase, session, nowTick, applicationId]);

  // ------------------------------------------------------------- helpers
  const cleanupMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (snapshotTimer.current) clearInterval(snapshotTimer.current);
    snapshotTimer.current = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const logViolation = useCallback(
    async (eventType: string, details: string, snapshotUrl?: string) => {
      if (phaseRef.current !== "active") return;
      try {
        const res = await apiJson<{ terminated: boolean; violationCount: number }>(`/api/applications/${applicationId}/exam`, {
          method: "POST",
          body: JSON.stringify({ action: eventType === "SNAPSHOT" ? "snapshot" : "violation", eventType, details, snapshotUrl }),
        });
        if (eventType !== "SNAPSHOT") {
          setViolations(res.violationCount);
          violationsRef.current = res.violationCount;
          if (res.terminated) {
            setResult({ score: 0, passed: false, terminated: true });
            setPhase("done");
            cleanupMedia();
          }
        }
      } catch {
        /* keep exam running if a log call fails */
      }
    },
    [applicationId]
  );

  const captureSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || phaseRef.current !== "active") return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.55);
      logViolation("SNAPSHOT", "Scheduled webcam snapshot — presence check", dataUrl);
    } catch {
      /* ignore frame capture errors */
    }
  }, [logViolation]);

  // ------------------------------------------------------------- anti-cheat listeners
  useEffect(() => {
    if (phase !== "active") return;

    const onVisibility = () => {
      if (document.hidden) logViolation("TAB_SWITCH", "Candidate switched away from the exam tab");
    };
    const onBlur = () => logViolation("WINDOW_BLUR", "Exam window lost focus");
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && phaseRef.current === "active") {
        setFullscreenBroken(true);
        logViolation("FULLSCREEN_EXIT", "Exited fullscreen mode during exam");
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logViolation("RIGHT_CLICK", "Right-click attempt blocked");
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logViolation("COPY_PASTE", "Copy/cut/paste attempt blocked");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "a", "p", "s", "u"].includes(k)) {
        e.preventDefault();
        logViolation("COPY_PASTE", `Shortcut blocked: ${e.ctrlKey || e.metaKey ? "Ctrl/⌘+" : ""}${k.toUpperCase()}`);
      }
      if (["f12"].includes(k) || (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(k))) {
        e.preventDefault();
        logViolation("COPY_PASTE", "DevTools shortcut blocked");
      }
    };
    const onStreamTrack = () => {
      if (phaseRef.current === "active") logViolation("FACE_MISSING", "Webcam stream ended — candidate presence lost");
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onCopy);
    document.addEventListener("keydown", onKeyDown);

    const stream = streamRef.current;
    stream?.getVideoTracks().forEach((t) => t.addEventListener("ended", onStreamTrack));

    // periodic snapshots
    snapshotTimer.current = setInterval(captureSnapshot, 20000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onCopy);
      document.removeEventListener("keydown", onKeyDown);
      stream?.getVideoTracks().forEach((t) => t.removeEventListener("ended", onStreamTrack));
      if (snapshotTimer.current) clearInterval(snapshotTimer.current);
    };
  }, [phase, logViolation, captureSnapshot]);

  // ------------------------------------------------------------- per-question timer
  const currentQuestion = exam?.questions[qIndex];

  const finishExam = useCallback(async () => {
    setPhase("submitting");
    cleanupMedia();
    try {
      const res = await apiJson<{ examStatus?: string; score?: number; passed?: boolean; resultsWithheld?: boolean }>(`/api/applications/${applicationId}/exam`, {
        method: "POST",
        body: JSON.stringify({ action: "complete" }),
      });
      if (res.resultsWithheld) {
        setResult({ score: 0, passed: false, withheld: true });
      } else {
        setResult({ score: res.score ?? 0, passed: !!res.passed });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit exam");
      setPhase("error");
      return;
    }
    setPhase("done");
  }, [applicationId, cleanupMedia]);

  // Shared countdown window — auto-submit everyone's attempt when it closes.
  // Guard: an unscheduled (provisioned) session has no endsAt — never treat
  // a missing window as an expired one.
  useEffect(() => {
    if (phase !== "active" || !session || !session.endsAt) return;
    const end = new Date(session.endsAt).getTime();
    const remain = end - nowTick;
    if (remain <= 0 && phaseRef.current === "active") {
      (async () => {
        toast({ title: "Time is up", description: "The assessment window has closed — your answers were submitted for grading." });
        await finishExam();
      })();
    }
  }, [phase, session, nowTick, finishExam]);

  const saveCurrentAnswer = useCallback(
    async (autoAdvance = false) => {
      const q = exam?.questions[qIndexRef.current];
      if (!q) return;
      const answer = answersRef.current[q.id] || "";
      const timeSpent = Math.round((Date.now() - questionStartRef.current) / 1000);
      await apiJson(`/api/applications/${applicationId}/exam`, {
        method: "POST",
        body: JSON.stringify({ action: "answer", questionId: q.id, answer, timeSpentSeconds: timeSpent }),
      }).catch(() => {});
      if (autoAdvance && qIndexRef.current < (exam?.questions.length || 0) - 1) {
        setQIndex((i) => i + 1);
      }
    },
    [applicationId, exam]
  );

  useEffect(() => {
    if (phase !== "active" || !currentQuestion) return;
    questionStartRef.current = Date.now();
    setSecondsLeft(currentQuestion.timeLimitSeconds);
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          // time expired → auto-save & advance
          (async () => {
            toast({ title: "Time expired for this question", description: "Auto-advancing to keep the exam fair." });
            await saveCurrentAnswer(true);
            if (qIndexRef.current >= (exam?.questions.length || 1) - 1) finishExam();
          })();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, qIndex, currentQuestion?.id]);

  // ------------------------------------------------------------- gate actions
  const beginExam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setWebcamOn(true);
      await document.documentElement.requestFullscreen().catch(() => {
        toast({ title: "Fullscreen required", description: "Please allow fullscreen mode for exam integrity.", variant: "destructive" });
      });
      logViolation("SNAPSHOT", "Exam started — initial proctoring snapshot");
      setPhase("active");
    } catch {
      toast({
        title: "Webcam access required",
        description: "The proctored assessment needs webcam monitoring. Grant camera permission and try again.",
        variant: "destructive",
      });
    }
  };

  // ------------------------------------------------------------- render
  if (phase === "loading") {
    return <Centered><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Preparing secure assessment…</p></Centered>;
  }

  if (phase === "error") {
    return (
      <Centered>
        <div className="max-w-md text-center">
          <XCircle className="mx-auto h-10 w-10 text-destructive" />
          <p className="mt-3 font-semibold">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/candidate/applications")}>Back to applications</Button>
        </div>
      </Centered>
    );
  }

  if (phase === "scheduled" && session) {
    const startMs = new Date(session.scheduledAt).getTime();
    const remaining = startMs - nowTick;
    return (
      <Centered>
        <div className="w-full max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm">
          <AlarmClock className="mx-auto h-12 w-12 text-primary" />
          <h2 className="mt-3 text-xl font-bold">Assessment scheduled</h2>
          <p className="mt-1 text-sm text-muted-foreground">{exam?.jobTitle ?? "Proctored online assessment"}</p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            The recruiter pooled every qualified candidate into a single session. The exam unlocks at the exact
            same moment for everyone — no early starts, no advantages.
          </p>
          <div className="mt-5 rounded-xl border bg-muted/40 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Opens at</p>
            <p className="mt-1 text-lg font-bold">{formatDateTime(session.scheduledAt)}</p>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Unlocks in</p>
            <p className="mt-1 font-mono text-4xl font-extrabold tabular-nums text-primary">{formatCountdown(remaining)}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              {session.durationMinutes}-minute countdown window for every candidate · results mode: {session.releaseMode === "MANUAL" ? "released together after review" : "shown immediately after submission"}
            </p>
          </div>
          <Button variant="outline" className="mt-5" onClick={() => navigate("/candidate/applications")}>Back to applications</Button>
        </div>
      </Centered>
    );
  }

  if (phase === "closed") {
    return (
      <Centered>
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <XCircle className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="mt-3 text-xl font-bold">Exam window closed</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The scheduled assessment window has already closed. Contact the recruiter if you believe this is a mistake —
            they can schedule a new session for the job.
          </p>
          <Button variant="outline" className="mt-5" onClick={() => navigate("/candidate/applications")}>Back to applications</Button>
        </div>
      </Centered>
    );
  }

  if (phase === "done" && result) {
    return (
      <Centered>
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          {result.terminated ? (
            <>
              <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
              <h2 className="mt-3 text-xl font-bold">Exam terminated</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Too many proctoring violations were detected ({exam?.maxViolations ?? 3}). This attempt has been flagged
                and reported to the recruiter with the full audit log.
              </p>
            </>
          ) : result.withheld ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h2 className="mt-3 text-xl font-bold">Answers submitted</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Your assessment was submitted successfully. The employer has configured result visibility — scores for all
                candidates will be published together, and you will be notified as soon as they are released.
              </p>
            </>
          ) : result.alreadyDone ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <h2 className="mt-3 text-xl font-bold">Assessment already completed</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                You have already taken this assessment — exams can only be taken once per job. Open My applications to see
                the current status and any released results.
              </p>
            </>
          ) : (
            <>
              {result.passed ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /> : <XCircle className="mx-auto h-12 w-12 text-destructive" />}
              <h2 className="mt-3 text-xl font-bold">{result.passed ? "Assessment passed!" : "Assessment not passed"}</h2>
              <p className="mt-1 text-4xl font-extrabold tabular-nums">{result.score}%</p>
              <p className="mt-1 text-sm text-muted-foreground">Pass mark: {exam?.passMark ?? 60}%</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {result.passed
                  ? "The employer has been notified and can now schedule your live interview."
                  : "Your result has been recorded. You can apply to other positions anytime."}
              </p>
            </>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => navigate("/candidate/applications")}>View application status</Button>
            <Button variant="outline" onClick={() => navigate("/candidate/jobs")}>Browse more jobs</Button>
          </div>
        </div>
      </Centered>
    );
  }

  if (phase === "gate" && exam) {
    const alreadyStarted = exam.savedAnswers.some((a) => a.answer);
    return (
      <Centered>
        <div className="w-full max-w-lg">
          <div className="mb-4 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-2 text-2xl font-bold tracking-tight">{exam.jobTitle}</h1>
            <p className="text-sm text-muted-foreground">Proctored online assessment · {exam.questions.length} questions · strict per-question timers</p>
            {alreadyStarted ? (
              <Alert className="mt-3 text-left">
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>Resuming exam</AlertTitle>
                <AlertDescription>You have an in-progress attempt. Your saved answers were restored.</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold"><Lock className="h-4 w-4 text-primary" /> Exam integrity rules</h2>
            <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
              <li className="flex gap-2"><Eye className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Your webcam stays on — periodic snapshots are stored in the proctoring audit log.</span></li>
              <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Fullscreen is mandatory. Leaving fullscreen or switching tabs is flagged.</span></li>
              <li className="flex gap-2"><Timer className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Each question has a strict timer (45–120s). Time up = auto-advance.</span></li>
              <li className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Copy/paste, right-click and shortcuts are disabled. After <b>{exam.maxViolations} violations</b> the exam is terminated automatically.</span></li>
            </ul>
            <Button className="mt-5 w-full" size="lg" onClick={beginExam}>
              <Camera className="mr-1.5 h-4 w-4" /> Enable webcam & start exam
            </Button>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate("/candidate/applications")}>Not now</Button>
          </div>
        </div>
      </Centered>
    );
  }

  if ((phase === "active" || phase === "submitting") && exam && currentQuestion) {
    const q = currentQuestion;
    const progress = ((qIndex + 1) / exam.questions.length) * 100;
    const timeColor = secondsLeft <= 10 ? "text-destructive" : secondsLeft <= 20 ? "text-amber-600" : "text-foreground";

    return (
      <div className="min-h-screen bg-muted/30 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          {/* header */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{exam.jobTitle}</p>
              <p className="text-sm font-semibold">Question {qIndex + 1} of {exam.questions.length}</p>
            </div>
            <div className="flex items-center gap-2">
              {session ? (
                <div className="hidden items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium sm:flex">
                  <AlarmClock className="h-3.5 w-3.5 text-primary" />
                  Window: <b className="font-mono tabular-nums">{formatCountdown(new Date(session.endsAt).getTime() - nowTick)}</b>
                </div>
              ) : null}
              <div className={cn("flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 font-mono text-lg font-bold tabular-nums", timeColor)}>
                <Timer className="h-4 w-4" /> {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}
              </div>
            </div>
          </div>
          <Progress value={progress} className="mb-5 h-1.5" />

          {/* violation strip */}
          <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className={cn("h-4 w-4", violations === 0 ? "text-primary" : "text-amber-600")} />
              Violations: <b>{violations}</b> / {exam.maxViolations}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {webcamOn ? <><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" /></span> Webcam monitored</> : <CameraOff className="h-4 w-4 text-destructive" />}
            </span>
          </div>

          {/* question card */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            {q.questionType === "MCQ" ? (
              <RadioGroup
                value={answers[q.id] || ""}
                onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                className="gap-3"
              >
                <p className="mb-3 text-base font-semibold leading-relaxed">{q.questionText}</p>
                {(q.options || []).map((opt, i) => (
                  <div key={i} className={cn("flex items-center gap-3 rounded-xl border p-3.5 transition-colors hover:border-primary/50", answers[q.id] === opt && "border-primary bg-primary/5")}>
                    <RadioGroupItem value={opt} id={`opt-${i}`} />
                    <Label htmlFor={`opt-${i}`} className="cursor-pointer font-normal leading-relaxed">{opt}</Label>
                  </div>
                ))}
              </RadioGroup>
            ) : q.questionType === "TRUE_FALSE" ? (
              <RadioGroup
                value={answers[q.id] || ""}
                onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                className="gap-3"
              >
                <p className="mb-3 text-base font-semibold leading-relaxed">{q.questionText}</p>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">True or false</p>
                {(["TRUE", "FALSE"] as const).map((v) => (
                  <div key={v} className={cn("flex items-center gap-3 rounded-xl border p-3.5 transition-colors hover:border-primary/50", answers[q.id] === v && "border-primary bg-primary/5")}>
                    <RadioGroupItem value={v} id={`tf-${v}`} />
                    <Label htmlFor={`tf-${v}`} className="cursor-pointer font-normal leading-relaxed">{v === "TRUE" ? "True" : "False"}</Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              <>
                <p className="mb-3 text-base font-semibold leading-relaxed">{q.questionText}</p>
                {q.questionType === "FILL_BLANK" ? (
                  <Input
                    placeholder="Fill in the blank… (copy/paste is disabled)"
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    className="h-11 text-base"
                    autoComplete="off"
                  />
                ) : (
                  <Textarea
                    rows={5}
                    placeholder="Type your answer… (copy/paste is disabled)"
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    className="resize-none"
                  />
                )}
              </>
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Answers save automatically as you advance.</p>
              {qIndex < exam.questions.length - 1 ? (
                <Button
                  onClick={async () => { await saveCurrentAnswer(true); }}
                >
                  Save & continue <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    // Save the final question's answer before grading — otherwise
                    // the last answer is silently dropped (submit → complete only).
                    await saveCurrentAnswer(false);
                    await finishExam();
                  }}
                  disabled={phase === "submitting"}
                >
                  {phase === "submitting" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                  Submit exam
                </Button>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Proctored by EthioHire — snapshots, focus events and integrity checks are recorded for the recruiter.
          </p>
        </div>

        {/* webcam PiP */}
        <div className="fixed bottom-4 right-4 z-50 overflow-hidden rounded-xl border-2 border-primary/40 bg-black shadow-xl">
          <video ref={videoRef} muted playsInline className="h-32 w-48 object-cover sm:h-40 sm:w-60" />
          <span className="absolute bottom-1 left-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
            <Camera className="h-2.5 w-2.5" /> PROCTORING
          </span>
        </div>

        {/* fullscreen-broken blocker */}
        {fullscreenBroken ? (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 p-6 text-center backdrop-blur">
            <ShieldAlert className="h-12 w-12 text-destructive" />
            <h2 className="mt-3 text-xl font-bold">Fullscreen mode exited</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              This incident was recorded ({violations}/{exam.maxViolations} violations). Re-enter fullscreen to continue the exam.
            </p>
            <Button
              className="mt-5"
              onClick={async () => {
                await document.documentElement.requestFullscreen().catch(() => {});
                setFullscreenBroken(false);
              }}
            >
              <Lock className="mr-1.5 h-4 w-4" /> Re-enter fullscreen & continue
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center px-4">{children}</div>;
}
