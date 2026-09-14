/**
 * EthioHire — end-to-end funnel smoke test (API level)
 * Run: bun scripts/e2e-test.ts
 */
const BASE = "http://localhost:3000";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

async function client() {
  let cookie = "";
  return {
    async req(method: string, path: string, body?: unknown) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      let data: unknown = null;
      try { data = await res.json(); } catch {}
      return { status: res.status, data } as { status: number; data: any };
    },
  };
}

async function main() {
  console.log("── Auth ──────────────────────────────────────");
  const anon = await client();
  const cfg = await anon.req("GET", "/api/auth/config");
  check("auth config reachable", cfg.status === 200 && cfg.data.mode === "DEMO");

  const bad = await anon.req("POST", "/api/auth/demo-login", { email: "candidate@ethiohire.et", password: "wrong" });
  check("wrong password rejected (401)", bad.status === 401);

  const cand = await client();
  const login = await cand.req("POST", "/api/auth/demo-login", { email: "candidate@ethiohire.et", password: "Demo123!" });
  check("candidate login", login.status === 200 && login.data.user.role === "CANDIDATE");

  const me = await cand.req("GET", "/api/auth/me");
  check("session resolves /api/auth/me", me.status === 200 && !!me.data.user);

  const candJobs = await cand.req("GET", "/api/jobs");
  check("candidate can list jobs", candJobs.status === 200 && candJobs.data.jobs.length >= 2);

  console.log("── Register new users ────────────────────────");
  const reg = await client();
  const r1 = await reg.req("POST", "/api/auth/demo-register", { email: `test.cand.${Date.now()}@t.et`, password: "Testpass1!", name: "Test Candidate", role: "CANDIDATE" });
  check("candidate registration", r1.status === 200 && r1.data.user.role === "CANDIDATE");
  const prof = await reg.req("PUT", "/api/candidate/profile", {
    fullName: "Test Candidate", phone: "+251900000000", universityName: "Arba Minch University",
    degreeLevel: "BACHELORS", fieldOfStudy: "Computer Science", graduationYear: 2023,
    gpa: 3.4, expectedSalary: 32000, experienceYears: 2, skills: "React, Node.js, SQL",
  });
  check("candidate profile saved", prof.status === 200 && prof.data.profile.gpa === 3.4);

  const recReg = await client();
  const r2 = await recReg.req("POST", "/api/auth/demo-register", { email: `test.rec.${Date.now()}@t.et`, password: "Testpass1!", name: "Test Recruiter", role: "RECRUITER" });
  check("recruiter registration", r2.status === 200 && r2.data.user.role === "RECRUITER");
  const newJob = await recReg.req("POST", "/api/jobs", { title: "QA Engineer (Test)", description: "Test job for e2e", status: "OPEN", minGpa: 3.0, minExperienceYears: 1, salaryBudgetMax: 40000,
    knockoutQuestions: [{ questionText: "Can you work full-time?", requiredAnswer: "YES" }],
    assessmentQuestions: [
      { questionText: "2+2 = ?", questionType: "MCQ", options: ["3", "4", "5"], correctAnswer: "4", timeLimitSeconds: 60 },
      { questionText: "What is HTTP?", questionType: "TEXT", correctAnswer: "protocol", timeLimitSeconds: 60 },
    ] });
  check("recruiter blocked from posting (unverified company)", newJob.status === 403, `got ${newJob.status}`);

  console.log("── Apply + pre-screening ─────────────────────");
  // fresh candidate so we control the full funnel (seeded ones already applied)
  const funnelCand = await client();
  await funnelCand.req("POST", "/api/auth/demo-register", { email: `test.funnel.${Date.now()}@t.et`, password: "Testpass1!", name: "Funnel Candidate", role: "CANDIDATE" });
  await funnelCand.req("PUT", "/api/candidate/profile", {
    fullName: "Funnel Candidate", phone: "+251911000000", universityName: "Addis Ababa University",
    degreeLevel: "BACHELORS", fieldOfStudy: "Computer Science", graduationYear: 2024,
    gpa: 3.7, expectedSalary: 40000, experienceYears: 3, skills: "React, TypeScript, Node.js, PostgreSQL, Git",
  });

  const jobs = (await funnelCand.req("GET", "/api/jobs")).data.jobs as { id: string; title: string }[];
  const job1 = jobs.find((j) => j.title.includes("Senior Full-Stack"))!;
  const detail = (await funnelCand.req("GET", `/api/jobs/${job1.id}`)).data;
  check("job detail includes knockout questions", detail.job.knockoutQuestions.length === 3);
  check("candidate sees no correct answers", detail.questions === null);

  const knockAnswers: Record<string, string> = {};
  detail.job.knockoutQuestions.forEach((k: { id: string }) => (knockAnswers[k.id] = "YES"));
  const apply = await funnelCand.req("POST", `/api/jobs/${job1.id}/apply`, { knockoutAnswers: knockAnswers });
  check("apply → pre-screen PASSED", apply.status === 200 && apply.data.screening.passed === true, JSON.stringify(apply.data).slice(0, 200));
  check("match score computed", apply.data.screening.matchScore > 0);
  const appId = apply.data.application.id as string;

  const dup = await funnelCand.req("POST", `/api/jobs/${job1.id}/apply`, { knockoutAnswers: knockAnswers });
  check("duplicate application blocked (409)", dup.status === 409);

  console.log("── Proctored exam ────────────────────────────");
  const fc = funnelCand;
  const start = await fc.req("POST", `/api/applications/${appId}/exam`, { action: "start" });
  check("exam start returns questions without answers", start.status === 200 && start.data.exam.questions.length === 7 && !("correctAnswer" in start.data.exam.questions[0]));

  const qs = start.data.exam.questions as { id: string; questionType: string; options: string[] | null }[];
  // answer Q1 correctly (useEffect), Q2 correctly (201 Created), Q3 correctly (B-tree), Q4 wrong,
  // Q5 text left unanswered, Q6 true/false correctly, Q7 fill-blank correctly (lowercase — grading is case-insensitive)
  await fc.req("POST", `/api/applications/${appId}/exam`, { action: "answer", questionId: qs[0].id, answer: "useEffect", timeSpentSeconds: 5 });
  await fc.req("POST", `/api/applications/${appId}/exam`, { action: "answer", questionId: qs[1].id, answer: "201 Created", timeSpentSeconds: 5 });
  await fc.req("POST", `/api/applications/${appId}/exam`, { action: "answer", questionId: qs[2].id, answer: "B-tree", timeSpentSeconds: 5 });
  await fc.req("POST", `/api/applications/${appId}/exam`, { action: "answer", questionId: qs[3].id, answer: "Blocks the event loop until the promise settles", timeSpentSeconds: 5 });
  check("true/false question served", qs[5].questionType === "TRUE_FALSE");
  await fc.req("POST", `/api/applications/${appId}/exam`, { action: "answer", questionId: qs[5].id, answer: "TRUE", timeSpentSeconds: 5 });
  check("fill-blank question served", qs[6].questionType === "FILL_BLANK");
  await fc.req("POST", `/api/applications/${appId}/exam`, { action: "answer", questionId: qs[6].id, answer: "addis ababa", timeSpentSeconds: 5 });

  const v1 = await fc.req("POST", `/api/applications/${appId}/exam`, { action: "violation", eventType: "TAB_SWITCH", details: "e2e test tab switch" });
  check("tab switch violation counted", v1.status === 200 && v1.data.violationCount === 1 && v1.data.terminated === false);

  const snap = await fc.req("POST", `/api/applications/${appId}/exam`, { action: "snapshot", details: "e2e snapshot" });
  check("webcam snapshot accepted", snap.status === 200);

  const complete = await fc.req("POST", `/api/applications/${appId}/exam`, { action: "complete" });
  check("exam graded server-side (5/7 correct incl. TF + fill-blank → 71%)", complete.status === 200 && complete.data.examStatus === "PASSED", JSON.stringify(complete.data));
  check("pass mark respected (60%)", complete.data.passed === true);

  const reStart = await fc.req("POST", `/api/applications/${appId}/exam`, { action: "start" });
  check("exam cannot be retaken (409)", reStart.status === 409);

  console.log("── Recruiter review & interview ──────────────");
  const rec = await client();
  await rec.req("POST", "/api/auth/demo-login", { email: "hr@addistech.et", password: "Demo123!" });
  const apps = await rec.req("GET", "/api/applications");
  check("recruiter sees company applications", apps.status === 200 && apps.data.applications.length >= 3);
  const mine = apps.data.applications.find((a: { id: string }) => a.id === appId);
  check("new applicant appears with exam score", !!mine && mine.examScore > 0);

  const detailRec = await rec.req("GET", `/api/applications/${appId}`);
  check("recruiter sees proctoring logs (incl. e2e TAB_SWITCH)", detailRec.status === 200 && detailRec.data.application.proctoringLogs.some((l: { eventType: string }) => l.eventType === "TAB_SWITCH"));

  const sched = await rec.req("PATCH", `/api/applications/${appId}`, { action: "SCHEDULE_INTERVIEW", scheduledTime: new Date(Date.now() + 86400000).toISOString(), format: "VIDEO" });
  check("interview scheduled", sched.status === 200 && sched.data.schedule.status === "SCHEDULED");
  const interviewId = sched.data.schedule.id as string;

  const ivList = await fc.req("GET", "/api/interviews");
  check("candidate sees scheduled interview", ivList.status === 200 && ivList.data.interviews.some((i: { id: string }) => i.id === interviewId));

  const ivDetail = await fc.req("GET", `/api/interviews/${interviewId}`);
  check("candidate sees interview questions", ivDetail.status === 200 && ivDetail.data.interview.application.job.assessmentQuestions.length > 0);

  console.log("── Recruiter security guards ─────────────────");
  const forbidden = await rec.req("GET", "/api/admin/analytics");
  check("recruiter blocked from admin API (403)", forbidden.status === 403);
  const candAdmin = await fc.req("GET", "/api/admin/companies");
  check("candidate blocked from admin API (403)", candAdmin.status === 403);
  const otherApp = apps.data.applications.find((a: { id: string; job: { company: { companyName: string } } }) => a.job.company.companyName !== "Addis Tech Group");
  if (otherApp) {
    const cross = await rec.req("GET", `/api/applications/${otherApp.id}`);
    check("recruiter cannot view other company's applicant (403)", cross.status === 403);
  }

  console.log("── Admin portal ──────────────────────────────");
  const admin = await client();
  const al = await admin.req("POST", "/api/auth/demo-login", { email: "admin@ethiohire.et", password: "Admin123!" });
  check("admin login", al.status === 200 && al.data.user.role === "ADMIN");

  const analytics = await admin.req("GET", "/api/admin/analytics");
  check("analytics funnel populated", analytics.status === 200 && analytics.data.funnel.applied > 0 && analytics.data.funnel.examPassed > 0);
  check("proctoring events counted", analytics.data.proctoring.some((p: { eventType: string }) => p.eventType === "TAB_SWITCH"));

  const companies = await admin.req("GET", "/api/admin/companies");
  const rift = companies.data.companies.find((c: { companyName: string }) => c.companyName === "Rift Valley Bank");
  check("company queue lists Rift Valley Bank", !!rift);

  const approve = await admin.req("PATCH", "/api/admin/companies", { companyId: rift.id, verificationStatus: "APPROVED" });
  check("admin approves company", approve.status === 200 && approve.data.company.verificationStatus === "APPROVED");

  // approve the e2e test recruiter's company so they can post a job
  const testCompany = companies.data.companies.find((c: { user: { email: string } }) => c.user.email === r2.data.user.email);
  const approve2 = await admin.req("PATCH", "/api/admin/companies", { companyId: testCompany.id, verificationStatus: "APPROVED" });
  check("admin approves e2e test company", approve2.status === 200);

  // now the test recruiter can post a job — exercise all four question types + server normalization
  const newJob2 = await recReg.req("POST", "/api/jobs", { title: "QA Engineer (Test)", description: "Test job for e2e", status: "DRAFT", minGpa: 3.0, minExperienceYears: 1,
    assessmentQuestions: [
      { questionText: "2+2 = ?", questionType: "MCQ", options: ["3", "4", "5"], correctAnswer: "4", timeLimitSeconds: 60 },
      { questionText: "Git rebase rewrites commit history.", questionType: "TRUE_FALSE", correctAnswer: "false" },
      { questionText: "The capital of Ethiopia is ___.", questionType: "FILL_BLANK", correctAnswer: "Addis Ababa" },
      { questionText: "What is HTTP?", questionType: "TEXT", correctAnswer: "protocol" },
    ] });
  check("verified recruiter can now post jobs", newJob2.status === 200, `got ${newJob2.status}: ${JSON.stringify(newJob2.data).slice(0, 150)}`);
  const createdQs = (newJob2.data.job?.assessmentQuestions || []) as { questionType: string; correctAnswer: string; options: string | null }[];
  check("all four question types accepted", ["MCQ", "TRUE_FALSE", "FILL_BLANK", "TEXT"].every((t) => createdQs.some((q) => q.questionType === t)), JSON.stringify(createdQs));
  check("TF answer normalized + MCQ options stored", createdQs.find((q) => q.questionType === "TRUE_FALSE")?.correctAnswer === "FALSE" && (createdQs.find((q) => q.questionType === "MCQ")?.options || "").includes("4"));

  const audit = await admin.req("GET", "/api/admin/audit");
  check("audit log recorded actions", audit.status === 200 && audit.data.logs.length >= 5);

  const settings = await admin.req("GET", "/api/admin/settings");
  check("platform settings readable", settings.status === 200 && settings.data.settings.length > 0);

  const notif = await fc.req("GET", "/api/notifications");
  check("candidate notifications include interview + exam", notif.status === 200 && notif.data.notifications.length >= 2);

  console.log("── Violation termination path ────────────────");
  // Yonas-like fresh apply with maxViolations=2 job (Rift Valley job needs GPA 3.2/exp 3 — use job2 for addis? job2 maxViolations=3)
  // Instead: fresh candidate vs job with maxViolations=3, fire 3 violations
  const vCand = await client();
  await vCand.req("POST", "/api/auth/demo-register", { email: `test.viol.${Date.now()}@t.et`, password: "Testpass1!", name: "Viol Test", role: "CANDIDATE" });
  await vCand.req("PUT", "/api/candidate/profile", { fullName: "Viol Test", universityName: "Hawassa University", degreeLevel: "BACHELORS", graduationYear: 2023, gpa: 3.9, expectedSalary: 30000, experienceYears: 3, skills: "React, TypeScript" });
  const j2 = jobs.find((j) => j.title.includes("Frontend"))!;
  const d2 = (await vCand.req("GET", `/api/jobs/${j2.id}`)).data;
  const ka2: Record<string, string> = {};
  d2.job.knockoutQuestions.forEach((k: { id: string }) => (ka2[k.id] = "YES"));
  const ap2 = await vCand.req("POST", `/api/jobs/${j2.id}/apply`, { knockoutAnswers: ka2 });
  check("second candidate pre-screen passed", ap2.data.screening?.passed === true, JSON.stringify(ap2.data).slice(0, 150));
  const app2 = ap2.data.application.id as string;
  const st2 = await vCand.req("POST", `/api/applications/${app2}/exam`, { action: "start" });
  await vCand.req("POST", `/api/applications/${app2}/exam`, { action: "violation", eventType: "TAB_SWITCH", details: "v1" });
  const v2 = await vCand.req("POST", `/api/applications/${app2}/exam`, { action: "violation", eventType: "TAB_SWITCH", details: "v2" });
  const v3 = await vCand.req("POST", `/api/applications/${app2}/exam`, { action: "violation", eventType: "TAB_SWITCH", details: "v3" });
  check("exam auto-terminates at maxViolations", v2.data.terminated === false && v3.data.terminated === true, `v2=${JSON.stringify(v2.data)} v3=${JSON.stringify(v3.data)}`);
  const app2Detail = (await rec.req("GET", `/api/applications/${app2}`)).data;
  check("terminated exam flagged for recruiter", app2Detail.application.status === "EXAM_TERMINATED" && app2Detail.application.violationCount === 3);

  console.log("──────────────────────────────────────────────");
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
