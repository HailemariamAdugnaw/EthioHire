/**
 * EthioHire — Application root (single-page app with hash-based navigation)
 * Routes: / · /login · /register · /docs/:topic · /candidate/… · /recruiter/… · /admin/… · /interview-room/:id
 */
import { useEffect } from "react";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-client";
import { useHashRoute, useMounted, navigate } from "@/components/ethiohire/hash-router";
import { PortalShell, PageLoading } from "@/components/ethiohire/shell";
import { Toaster } from "@/components/ui/toaster";
import { LandingView } from "@/components/ethiohire/landing";
import { AuthView } from "@/components/ethiohire/auth-view";
import { DocsView } from "@/components/ethiohire/docs-view";
import { CandidateDashboard } from "@/components/ethiohire/candidate/dashboard";
import { CandidateJobs } from "@/components/ethiohire/candidate/jobs";
import { CandidateApplications } from "@/components/ethiohire/candidate/applications";
import { CandidateProfile } from "@/components/ethiohire/candidate/profile";
import { CandidateInterviews } from "@/components/ethiohire/candidate/interviews";
import { ExamRoom } from "@/components/ethiohire/candidate/exam-room";
import { InterviewRoom } from "@/components/ethiohire/candidate/interview-room";
import { RecruiterDashboard } from "@/components/ethiohire/recruiter/dashboard";
import { RecruiterJobs } from "@/components/ethiohire/recruiter/jobs";
import { RecruiterJobEditor } from "@/components/ethiohire/recruiter/job-editor";
import { RecruiterCompany } from "@/components/ethiohire/recruiter/company";
import { RecruiterApplicants } from "@/components/ethiohire/recruiter/applicants";
import { RecruiterInterviews } from "@/components/ethiohire/recruiter/interviews";
import { RecruiterExams } from "@/components/ethiohire/recruiter/exams";
import { RecruiterInterviewSetup } from "@/components/ethiohire/recruiter/interview-setup";
import { AdminOverview, AdminCompanies, AdminSubscriptions, AdminAudit, AdminNotifications } from "@/components/ethiohire/admin/portal";

type Role = "ADMIN" | "RECRUITER" | "CANDIDATE";

function homeFor(role: string) {
  return role === "ADMIN" ? "/admin" : `/${role.toLowerCase()}`;
}

function Router() {
  const route = useHashRoute();
  const { user, loading } = useAuth();
  const mounted = useMounted();
  const seg = route.segments;
  const segKey = seg.join("/");

  // ---------------- auth/role redirects (declared before any early return) ----------------
  const publicPaths = ["", "login", "register"];
  const isPublic = seg.length === 0 || publicPaths.includes(seg[0]);

  useEffect(() => {
    if (loading) return;
    // signed-in users hitting auth pages → their portal
    if (user && ["login", "register"].includes(seg[0] || "")) {
      navigate(homeFor(user.role), { replace: true });
      return;
    }
    // protected routes require auth
    if (!user && !isPublic) {
      navigate("/login", { replace: true });
      return;
    }
    // setup/deployment guides are restricted to platform administrators
    if (user && seg[0] === "docs" && user.role !== "ADMIN") {
      navigate(homeFor(user.role), { replace: true });
      return;
    }
    // role-guard portal prefixes
    if (user && ["candidate", "recruiter", "admin"].includes(seg[0] || "")) {
      const needed = seg[0].toUpperCase() as Role;
      if (user.role !== needed) navigate(homeFor(user.role), { replace: true });
    }
  }, [user, loading, segKey, isPublic, seg]);

  // Avoid first-paint flicker: hash routing is a client concern
  if (!mounted) return <PageLoading />;

  if (loading && !isPublic) return <PageLoading />;

  // docs
  if (seg[0] === "docs") return <DocsView topic={seg[1] || "index"} />;

  if (seg.length === 0 || (seg[0] !== "candidate" && seg[0] !== "recruiter" && seg[0] !== "admin" && seg[0] !== "interview-room")) {
    if (seg[0] === "login") return <AuthView initialMode="login" />;
    if (seg[0] === "register") return <AuthView initialMode="register" />;
    return <LandingView />;
  }

  // immersive full-screen routes (no shell)
  if (seg[0] === "interview-room") {
    const id = seg[1];
    return id ? <InterviewRoom interviewId={id} /> : <LandingView />;
  }
  if (seg[0] === "candidate" && seg[1] === "exam") {
    const id = seg[2];
    return id ? <ExamRoom applicationId={id} /> : <NotFound />;
  }

  // ---------------- shelled portal routes ----------------
  if (!user) return <AuthView initialMode="login" />;

  let view: ReactNode = <NotFound />;
  if (seg[0] === "candidate") {
    view =
      seg[1] === "jobs" ? <CandidateJobs /> :
      seg[1] === "applications" ? <CandidateApplications /> :
      seg[1] === "profile" ? <CandidateProfile /> :
      seg[1] === "interviews" ? <CandidateInterviews /> :
      <CandidateDashboard />;
  } else if (seg[0] === "recruiter") {
    view =
      seg[1] === "jobs" && seg[2] === "new" ? <RecruiterJobEditor /> :
      seg[1] === "jobs" && seg[2] ? <RecruiterJobEditor jobId={seg[2]} /> :
      seg[1] === "jobs" ? <RecruiterJobs /> :
      seg[1] === "company" ? <RecruiterCompany /> :
      seg[1] === "applicants" ? <RecruiterApplicants /> :
      seg[1] === "interviews" ? <RecruiterInterviews /> :
      seg[1] === "exams" && seg[2] ? <RecruiterExams jobId={seg[2]} /> :
      seg[1] === "exams" ? <RecruiterExams /> :
      seg[1] === "interview-setup" ? <RecruiterInterviewSetup /> :
      <RecruiterDashboard />;
  } else if (seg[0] === "admin") {
    view =
      seg[1] === "companies" ? <AdminCompanies /> :
      seg[1] === "subscriptions" ? <AdminSubscriptions /> :
      seg[1] === "audit" ? <AdminAudit /> :
      seg[1] === "notifications" ? <AdminNotifications /> :
      <AdminOverview />;
  }

  return (
    <>
      <PortalShell route={route.path}>{view}</PortalShell>
      <Toaster />
    </>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-extrabold text-primary/30">404</p>
      <p className="font-semibold">Page not found</p>
      <button onClick={() => navigate("/")} className="text-sm text-primary underline underline-offset-2">
        Back to EthioHire home
      </button>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
