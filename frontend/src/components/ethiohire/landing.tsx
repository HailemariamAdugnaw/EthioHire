
/** EthioHire — public landing page */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  BellRing,
  BrainCircuit,
  Camera,
  ClipboardCheck,
  Cloud,
  Container,
  Database,
  FileSearch,
  Gauge,
  KeyRound,
  ListChecks,
  Lock,
  MessagesSquare,
  MonitorPlay,
  Quote,
  Rocket,
  ScanFace,
  ShieldCheck,
  Star,
  Timer,
  TrendingUp,
  Video,
  Ban,
} from "lucide-react";
import { EhLogo } from "@/components/ethiohire/bits";
import { navigate } from "@/components/ethiohire/hash-router";
import { useAuth } from "@/lib/auth-client";
import { motion } from "framer-motion";

const STAGES = [
  {
    n: 1,
    icon: FileSearch,
    title: "Application & Pre-Screening",
    desc: "Structured CV intake, verified document uploads, hard-criteria knockout filters (GPA, graduation year, experience), salary matching and automated reference checks.",
    color: "from-amber-400 to-orange-500",
  },
  {
    n: 2,
    icon: MonitorPlay,
    title: "Proctored Online Assessment",
    desc: "Fullscreen-enforced quizzes with tab-switch termination, copy/paste blocking, periodic webcam snapshots with multi-face detection, and strict per-question timers.",
    color: "from-emerald-400 to-teal-500",
  },
  {
    n: 3,
    icon: Video,
    title: "Live Voice / Video Interview",
    desc: "Human-led real-time interviews over WebRTC for candidates who pass — with question-bank displays, scoring templates and automated scheduling.",
    color: "from-teal-400 to-cyan-500",
  },
  {
    n: 4,
    icon: ClipboardCheck,
    title: "Reporting & Decisioning",
    desc: "Automated evaluation summaries, match scores, full proctoring audit logs and email/SMS status notifications for every decision point.",
    color: "from-lime-400 to-emerald-500",
  },
];

const PORTALS = [
  {
    icon: ScanFace,
    title: "Candidate Portal",
    tagline: "Land the job on merit",
    points: ["Profile & structured CV builder", "Job search & filter portal", "Proctored exam environment", "Live interview room", "Application status tracker"],
    cta: "Join as a candidate",
    accent: "from-emerald-500/10 to-teal-500/10",
  },
  {
    icon: ListChecks,
    title: "Recruiter / HR Portal",
    tagline: "Shortlists without the grunt work",
    points: ["Company profile management", "Job listing & screening configurator", "Assessment & question bank builder", "Applicant review & proctoring audit logs", "Live interview scheduler"],
    cta: "Start hiring",
    accent: "from-teal-500/10 to-cyan-500/10",
  },
  {
    icon: Gauge,
    title: "System Admin Portal",
    tagline: "The control room",
    points: ["Platform analytics & usage overview", "Company verification dashboard", "Subscription & local payment management", "Audit & security logs"],
    cta: "Administer the platform",
    accent: "from-lime-500/10 to-emerald-500/10",
  },
];

const STACK = [
  { icon: Rocket, label: "React 19 + Vite" },
  { icon: BrainCircuit, label: "Django REST Framework" },
  { icon: Database, label: "PostgreSQL" },
  { icon: KeyRound, label: "Firebase Auth" },
  { icon: Video, label: "WebRTC + MediaRecorder" },
  { icon: BellRing, label: "Email / SMS outbox" },
  { icon: Container, label: "Docker Compose" },
  { icon: Cloud, label: "Vercel / Render / S3" },
];

const STATS = [
  { value: "−80%", label: "Manual screening time", icon: TrendingUp },
  { value: "4-stage", label: "Automated hiring funnel", icon: ListChecks },
  { value: "100%", label: "Exams audit-logged", icon: ShieldCheck },
  { value: "3", label: "Role-based portals", icon: ScanFace },
];

const QUOTES = [
  {
    quote: "We used to lose two days a week reading CVs. The knockout filters and auto-scored exams hand us a ranked shortlist before lunch.",
    who: "Senior HR Manager",
    where: "Logistics company, Addis Ababa",
  },
  {
    quote: "The proctored exam experience felt professional and fair — timers, webcam checks, instant results. No more 'ghost' applicants at interviews.",
    who: "Technical Recruiter",
    where: "Fintech startup",
  },
  {
    quote: "I applied, took the assessment from home, and got my interview slot automatically. It respects the candidate's time.",
    who: "Software Engineering Candidate",
    where: "Hired through EthioHire",
  },
];

const floatAnim = (delay = 0, y = 10) => ({
  animate: { y: [-y, y, -y] },
  transition: { duration: 5 + delay, repeat: Infinity, ease: "easeInOut" as const, delay },
});

export function LandingView() {
  const { user } = useAuth();

  const dashboardTarget = !user ? "/login" : user.role === "ADMIN" ? "/admin" : `/${user.role.toLowerCase()}`;
  const primaryCta = () => navigate(user ? dashboardTarget : "/register");

  return (
    <div className="flex min-h-screen flex-col">
      {/* ---------------- Header ---------------- */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => navigate("/")} aria-label="EthioHire home" className="flex items-center">
            <EhLogo />
          </button>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex" aria-label="Primary">
            <a href="#workflow" className="transition-colors hover:text-foreground">Workflow</a>
            <a href="#portals" className="transition-colors hover:text-foreground">Portals</a>
            <a href="#voices" className="transition-colors hover:text-foreground">Voices</a>
            <a href="#stack" className="transition-colors hover:text-foreground">Stack</a>
            <button onClick={() => navigate("/docs")} className="transition-colors hover:text-foreground">Guides</button>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button onClick={() => navigate(dashboardTarget)}>
                Go to dashboard <Chevron />
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate("/login")}>Sign in</Button>
                <Button onClick={() => navigate("/register")}>Get started</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ---------------- Hero ---------------- */}
        <section className="relative overflow-hidden border-b bg-[linear-gradient(160deg,oklch(0.97_0.02_150)_0%,oklch(0.99_0.004_110)_45%,oklch(0.96_0.04_95)_100%)]">
          {/* decorative mesh */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.05)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_35%,black,transparent)]" />
          <div className="pointer-events-none absolute -right-24 -top-28 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-36 -left-28 h-[26rem] w-[26rem] rounded-full bg-amber-400/15 blur-3xl" />
          <div className="pointer-events-none absolute left-1/3 top-1/2 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />

          <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background/70 py-1 pl-2 pr-3.5 text-xs font-semibold text-primary shadow-sm backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                Auto-scheduled interviews & proctored exams — live now
              </span>

              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                Hire the best.
                <br />
                <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-lime-500 bg-clip-text text-transparent">
                  Skip the noise.
                </span>
              </h1>
              <p className="mt-2 text-xl font-semibold text-foreground/80 sm:text-2xl">
                Ethiopia's automated recruitment, pre-screening & interview platform
              </p>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Replace manual CV screening and first-round physical interviews with a structured, fraud-resistant
                funnel: automated pre-screening, proctored online exams, and live voice/video interviews — employers
                only meet candidates worth meeting.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button size="lg" className="h-12 px-6 text-base shadow-lg shadow-primary/25" onClick={primaryCta}>
                  {user ? "Open my portal" : "Create free account"} <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" className="h-12 px-6 text-base bg-background/70 backdrop-blur" onClick={() => document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" })}>
                  See how it works
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Free to join · No credit card · Candidate-first by design</p>

              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> Anti-cheat proctoring</span>
                <span className="inline-flex items-center gap-1.5"><Timer className="h-4 w-4 text-primary" /> Per-question timers</span>
                <span className="inline-flex items-center gap-1.5"><Camera className="h-4 w-4 text-primary" /> Webcam monitoring</span>
              </div>
            </motion.div>

            {/* Product-mock collage */}
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.15 }} className="relative mx-auto w-full max-w-md lg:max-w-none">
              {/* main candidate card */}
              <motion.div {...floatAnim(0, 7)}>
                <Card className="relative z-10 border-2 bg-background/80 shadow-xl shadow-primary/10 backdrop-blur">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Top match · Senior Backend</p>
                      <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">92% fit</Badge>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-base font-bold text-white">MA</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">Meron Alemu</p>
                        <p className="text-xs text-muted-foreground">BSc CS · 3.7 GPA · 2 yrs experience</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      {[
                        { k: "Screening", v: "Passed", c: "text-emerald-600" },
                        { k: "Exam", v: "87/100", c: "text-emerald-600" },
                        { k: "Interview", v: "Booked", c: "text-teal-600" },
                      ].map((s) => (
                        <div key={s.k} className="rounded-lg border bg-muted/40 px-2 py-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{s.k}</p>
                          <p className={`text-sm font-bold ${s.c}`}>{s.v}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* exam proctoring card (overlapping) */}
              <motion.div {...floatAnim(1.2, 9)} className="relative z-20 -mt-8 ml-auto w-[78%]">
                <Card className="border bg-background/90 shadow-lg backdrop-blur">
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
                      <MonitorPlay className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">Proctored exam in progress</p>
                      <p className="text-xs text-muted-foreground">Fullscreen · webcam snapshot 00:14 · tab-switch 0</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-600">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> REC
                    </span>
                  </CardContent>
                </Card>
              </motion.div>

              {/* auto-scheduler card (overlapping) */}
              <motion.div {...floatAnim(2.4, 8)} className="relative z-30 -mt-6 w-[82%]">
                <Card className="border bg-background/90 shadow-lg backdrop-blur">
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 text-white">
                      <Video className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">Interview auto-scheduled</p>
                      <p className="text-xs text-muted-foreground">Thu 14:30 · no-overlap slots · invites sent</p>
                    </div>
                    <span className="rounded-full bg-teal-500/10 px-2 py-1 text-[11px] font-bold text-teal-700">WebRTC</span>
                  </CardContent>
                </Card>
              </motion.div>

              {/* funnel footer chip */}
              <div className="relative z-10 mt-4 rounded-xl border bg-muted/60 p-3 text-center text-xs leading-relaxed text-muted-foreground backdrop-blur">
                Every stage transition is logged, scored and notified — candidates advance only when they clear each threshold.
              </div>
            </motion.div>
          </div>

          {/* stats band */}
          <div className="relative border-t bg-background/60 backdrop-blur">
            <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xl font-extrabold leading-none">{s.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Workflow detail ---------------- */}
        <section id="workflow" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-3 border-primary/30 bg-primary/5 text-primary">The workflow</Badge>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">A four-stage, fraud-resistant hiring funnel</h2>
            <p className="mt-3 text-muted-foreground">
              A structured, multi-phase selection pipeline that eliminates manual overhead, prevents examination fraud,
              and keeps employers focused only on candidates worth their time.
            </p>
          </div>
          <div className="relative mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STAGES.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.07 }}
                className="relative"
              >
                <Card className="group h-full transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${s.color} transition-transform duration-300 group-hover:scale-110`}>
                        <s.icon className="h-5 w-5" />
                      </span>
                      <span className="text-4xl font-extrabold text-muted-foreground/20 transition-colors group-hover:text-primary/25">0{s.n}</span>
                    </div>
                    <h3 className="mt-3 font-bold">{s.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                  </CardContent>
                </Card>
                {i < STAGES.length - 1 ? (
                  <ArrowRight className="absolute -right-3.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-primary/50 lg:block" />
                ) : null}
              </motion.div>
            ))}
          </div>

          {/* anti-cheat strip */}
          <div className="mt-8 grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-3 sm:p-6">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">Browser locking</p>
                <p className="text-xs text-muted-foreground">Fullscreen enforcement, tab-switch flags, exam termination after repeated violations.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Ban className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">Input restrictions</p>
                <p className="text-xs text-muted-foreground">Copy, paste, right-click and system shortcuts disabled during the assessment.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Camera className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">Webcam proctoring</p>
                <p className="text-xs text-muted-foreground">Periodic snapshots for presence and multi-face detection, stored in the audit log.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Portals ---------------- */}
        <section id="portals" className="border-y bg-muted/40">
          <div className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-20">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline" className="mb-3 border-primary/30 bg-primary/5 text-primary">Purpose-built</Badge>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">Three portals, one account</h2>
              <p className="mt-3 text-muted-foreground">
                Role-based access rights keep every user focused on exactly what they need — from structured CV building
                to platform-wide verification and fee management.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {PORTALS.map((p, i) => (
                <motion.div key={p.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} className="h-full">
                  <Card className="group relative h-full overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10">
                    <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${p.accent}`} />
                    <CardContent className="relative p-5">
                      <div className="flex items-center justify-between">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-300 group-hover:scale-110">
                          <p.icon className="h-5 w-5" />
                        </span>
                        <Star className="h-4 w-4 text-amber-400" />
                      </div>
                      <h3 className="mt-3 text-lg font-bold">{p.title}</h3>
                      <p className="text-xs font-medium text-primary">{p.tagline}</p>
                      <ul className="mt-3 space-y-2">
                        {p.points.map((pt) => (
                          <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                            {pt}
                          </li>
                        ))}
                      </ul>
                      <Button variant="link" className="mt-3 h-auto p-0 text-primary" onClick={primaryCta}>
                        {p.cta} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Voices ---------------- */}
        <section id="voices" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-3 border-primary/30 bg-primary/5 text-primary">Voices</Badge>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">What the funnel feels like</h2>
            <p className="mt-3 text-muted-foreground">
              From the people on both sides of the hiring table.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {QUOTES.map((q, i) => (
              <motion.div key={q.who} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} className="h-full">
                <Card className="h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10">
                  <CardContent className="flex h-full flex-col p-5">
                    <Quote className="h-6 w-6 text-primary/40" />
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground/90">"{q.quote}"</p>
                    <div className="mt-4 border-t pt-3">
                      <p className="text-sm font-bold">{q.who}</p>
                      <p className="text-xs text-muted-foreground">{q.where}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ---------------- Tech stack ---------------- */}
        <section id="stack" className="scroll-mt-20 border-y bg-[oklch(0.24_0.03_200)] text-white">
          <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 md:py-16">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <Badge className="mb-3 border border-white/20 bg-white/10 text-white hover:bg-white/10">Engineering</Badge>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Production-grade technical stack</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  A modern SPA backed by a clean REST API and a relational core — designed for exactly this workload:
                  file-heavy applications, strict exam sessions, real-time interviews and full audit trails. Deployable
                  with Docker Compose or to managed platforms in minutes.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {STACK.map((s) => (
                  <span key={s.label} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-medium backdrop-blur transition-colors hover:bg-white/10">
                    <s.icon className="h-4 w-4 text-emerald-400" /> {s.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- CTA ---------------- */}
        <section className="relative overflow-hidden bg-primary text-primary-foreground">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.10),transparent_40%)]" />
          <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6">
            <MessagesSquare className="h-8 w-8 opacity-80" />
            <h2 className="text-2xl font-bold sm:text-3xl md:text-4xl">Hire faster. Screen fairly. Decide with data.</h2>
            <p className="max-w-2xl text-primary-foreground/85">
              Join EthioHire as a candidate, recruiter or platform administrator — the entire funnel runs from a single
              account.
            </p>
            <div className="mt-3 grid w-full max-w-lg gap-3 sm:grid-cols-2">
              <Button size="lg" variant="secondary" className="h-12 text-base" onClick={primaryCta}>
                I'm hiring — post a job
              </Button>
              <Button size="lg" variant="outline" className="h-12 border-white/40 bg-transparent text-base text-primary-foreground hover:bg-white/10 hover:text-primary-foreground" onClick={primaryCta}>
                I'm job hunting — apply
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-3">
              <EhLogo size={30} />
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                Automated recruitment, pre-screening and interviewing — built for the Ethiopian job market.
              </p>
            </div>
            <div>
              <p className="text-sm font-bold">Product</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><a href="#workflow" className="transition-colors hover:text-foreground">How it works</a></li>
                <li><a href="#portals" className="transition-colors hover:text-foreground">Portals</a></li>
                <li><a href="#stack" className="transition-colors hover:text-foreground">Tech stack</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-bold">Get started</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><button className="transition-colors hover:text-foreground" onClick={() => navigate("/register")}>Create an account</button></li>
                <li><button className="transition-colors hover:text-foreground" onClick={() => navigate("/login")}>Sign in</button></li>
                <li><button className="transition-colors hover:text-foreground" onClick={() => navigate("/docs")}>Guides & docs</button></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-bold">Trust</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Server-side session verification</li>
                <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-primary" /> Proctoring audit logs</li>
                <li className="flex items-center gap-2"><Star className="h-4 w-4 text-primary" /> Fair, transparent scoring</li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t pt-5 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} EthioHire. Automated recruitment for Ethiopia.
          </div>
        </div>
      </footer>
    </div>
  );
}

function Chevron() {
  return <ArrowRight className="ml-1 h-4 w-4" />;
}
