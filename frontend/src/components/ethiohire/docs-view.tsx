
/** EthioHire — in-app documentation viewer (renders the setup/deploy guides) */
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EhLogo } from "@/components/ethiohire/bits";
import { navigate } from "@/components/ethiohire/hash-router";
import { useAuth } from "@/lib/auth-client";
import { GUIDE_TITLES, GUIDE_INDEX, GUIDE_FIREBASE, GUIDE_RESEND, GUIDE_LIVEKIT, GUIDE_DOCKER, GUIDE_VERCEL, GUIDE_RENDER } from "@/content/guides";
import { ArrowLeft, BookOpen, Container, Cloud, KeyRound, Mail, Rocket, Video, Home } from "lucide-react";

const GUIDES: Record<string, { icon: typeof KeyRound; body: string; blurb: string }> = {
  index: { icon: BookOpen, body: GUIDE_INDEX, blurb: "Start here — docs index, quick start and demo accounts." },
  firebase: { icon: KeyRound, body: GUIDE_FIREBASE, blurb: "Configure Firebase Authentication (Email/Password + Google) step by step." },
  resend: { icon: Mail, body: GUIDE_RESEND, blurb: "Reporting & Decisioning emails — evaluation summaries, proctoring audit reports, status notifications." },
  livekit: { icon: Video, body: GUIDE_LIVEKIT, blurb: "Live voice/video interview rooms over WebRTC — question display, scoring templates, scheduling." },
  docker: { icon: Container, body: GUIDE_DOCKER, blurb: "Run the full stack (app + PostgreSQL + Redis) with Docker Compose." },
  vercel: { icon: Cloud, body: GUIDE_VERCEL, blurb: "Deploy to Vercel with managed PostgreSQL." },
  render: { icon: Rocket, body: GUIDE_RENDER, blurb: "Deploy to Render with Postgres, Redis, WebRTC signaling and workers." },
};

export function DocsView({ topic }: { topic: string }) {
  const guide = GUIDES[topic] || GUIDES.index;
  const [showIndex, setShowIndex] = useState(topic === "index");
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const toc = useMemo(() => {
    if (topic === "index" || topic === "") return [];
    return guide.body
      .split("\n")
      .filter((l) => l.startsWith("## "))
      .map((l) => l.replace(/^## /, "").trim());
  }, [topic, guide]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      {/* header */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} aria-label="EthioHire home" className="flex items-center">
              <EhLogo size={30} />
            </button>
            <span className="hidden text-sm font-medium text-muted-foreground sm:inline">Setup & deployment guides</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}><Home className="mr-1 h-4 w-4" /> Home</Button>
            {isAdmin ? (
              <Button size="sm" variant="outline" onClick={() => navigate("/admin")}>Back to admin portal</Button>
            ) : (
              <Button size="sm" onClick={() => navigate("/register")}>Get started</Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row">
        {/* sidebar */}
        <aside className="lg:w-64 lg:shrink-0">
          <div className="rounded-xl border bg-card p-3">
            <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Guides</p>
            <nav className="space-y-1" aria-label="Guides">
              {Object.entries(GUIDES).map(([key, g]) => (
                <button
                  key={key}
                  onClick={() => { navigate(`/docs/${key}`); setShowIndex(key === "index"); }}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    topic === key ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  aria-current={topic === key ? "page" : undefined}
                >
                  <g.icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">{GUIDE_TITLES[key]}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* content */}
        <article className="min-w-0 flex-1">
          {topic === "index" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(GUIDES).filter(([k]) => k !== "index").map(([key, g]) => (
                <button key={key} onClick={() => navigate(`/docs/${key}`)} className="text-left">
                  <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                    <CardContent className="p-5">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <g.icon className="h-5 w-5" />
                      </span>
                      <h3 className="mt-3 font-bold">{GUIDE_TITLES[key]}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{g.blurb}</p>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="px-5 py-2 sm:px-8">
                <div className="py-4">
                  <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/docs")}>
                    <ArrowLeft className="mr-1 h-4 w-4" /> All guides
                  </Button>
                </div>
                {toc.length > 0 ? (
                  <div className="mb-6 rounded-xl border bg-muted/40 p-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">On this page</p>
                    <ol className="space-y-1 text-sm">
                      {toc.map((t, i) => (
                        <li key={i} className="text-muted-foreground">{i + 1}. {t}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                <div className="prose-hire pb-10">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: (p) => <h1 className="mb-4 mt-2 text-3xl font-extrabold tracking-tight" {...p} />,
                      h2: (p) => <h2 className="mb-3 mt-8 border-b pb-1.5 text-xl font-bold" {...p} />,
                      h3: (p) => <h3 className="mb-2 mt-6 text-lg font-bold" {...p} />,
                      p: (p) => <p className="my-3 text-[15px] leading-relaxed text-foreground/90" {...p} />,
                      a: (p) => <a className="font-medium text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
                      ul: (p) => <ul className="my-3 list-disc space-y-1.5 pl-6 text-[15px] leading-relaxed" {...p} />,
                      ol: (p) => <ol className="my-3 list-decimal space-y-1.5 pl-6 text-[15px] leading-relaxed" {...p} />,
                      li: (p) => <li className="marker:text-primary/60" {...p} />,
                      strong: (p) => <strong className="font-bold text-foreground" {...p} />,
                      blockquote: (p) => <blockquote className="my-4 rounded-r-lg border-l-4 border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900" {...p} />,
                      code: ({ className, children, ...p }) => {
                        const isBlock = /language-/.test(className || "");
                        if (isBlock) return <code className={className} {...p}>{children}</code>;
                        return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] text-primary" {...p}>{children}</code>;
                      },
                      pre: (p) => <pre className="eh-scroll my-4 overflow-x-auto rounded-xl border bg-slate-950 p-4 text-[13px] leading-relaxed text-slate-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-slate-100" {...p} />,
                      table: (p) => <div className="eh-scroll my-4 overflow-x-auto rounded-xl border"><table className="w-full text-sm" {...p} /></div>,
                      th: (p) => <th className="border-b bg-muted/50 px-3 py-2 text-left font-semibold" {...p} />,
                      td: (p) => <td className="border-b px-3 py-2 align-top" {...p} />,
                      hr: () => <hr className="my-6 border-border" />,
                    }}
                  >
                    {guide.body}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}
        </article>
      </main>

      {/* sticky footer */}
      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} EthioHire — Automated Recruitment, Pre-Screening, and Interview Platform</span>
          <span className="hidden sm:inline">Guides are also available as markdown in the <code className="rounded bg-muted px-1 py-0.5">docs/</code> folder.</span>
        </div>
      </footer>
    </div>
  );
}
