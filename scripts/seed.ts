/**
 * EthioHire — Database seed script
 * Run: bun scripts/seed.ts
 * Idempotent: skips if an admin user already exists.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const prisma = new PrismaClient();

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: "admin@ethiohire.et" },
  });
  if (existingAdmin) {
    console.log("Database already seeded — skipping.");
    return;
  }

  console.log("Seeding EthioHire demo data...");

  // ---------- Users ----------
  await prisma.user.create({
    data: {
      email: "admin@ethiohire.et",
      passwordHash: hashPassword("Admin123!"),
      name: "Platform Admin",
      role: "ADMIN",
    },
  });

  const recruiterUser = await prisma.user.create({
    data: {
      email: "hr@addistech.et",
      passwordHash: hashPassword("Demo123!"),
      name: "Selam Bekele",
      role: "RECRUITER",
    },
  });

  const recruiter2User = await prisma.user.create({
    data: {
      email: "hr@riftvalleybank.et",
      passwordHash: hashPassword("Demo123!"),
      name: "Dawit Alemu",
      role: "RECRUITER",
    },
  });

  const candidateUser = await prisma.user.create({
    data: {
      email: "candidate@ethiohire.et",
      passwordHash: hashPassword("Demo123!"),
      name: "Meron Tadesse",
      role: "CANDIDATE",
    },
  });

  const c2 = await prisma.user.create({
    data: { email: "abel.gebremariam@gmail.com", passwordHash: hashPassword("Demo123!"), name: "Abel Gebremariam", role: "CANDIDATE" },
  });
  const c3 = await prisma.user.create({
    data: { email: "hana.mekonnen@gmail.com", passwordHash: hashPassword("Demo123!"), name: "Hana Mekonnen", role: "CANDIDATE" },
  });
  const c4 = await prisma.user.create({
    data: { email: "yonas.tesfaye@gmail.com", passwordHash: hashPassword("Demo123!"), name: "Yonas Tesfaye", role: "CANDIDATE" },
  });

  // ---------- Companies ----------
  const addisTech = await prisma.companyProfile.create({
    data: {
      userId: recruiterUser.id,
      companyName: "Addis Tech Group",
      industry: "Software & IT Services",
      website: "https://addistech.et",
      location: "Addis Ababa, Ethiopia",
      description:
        "A leading Ethiopian software company building fintech, logistics and e-government products for the Horn of Africa region.",
      verificationStatus: "APPROVED",
      subscriptionPlan: "PRO",
    },
  });

  const riftValley = await prisma.companyProfile.create({
    data: {
      userId: recruiter2User.id,
      companyName: "Rift Valley Bank",
      industry: "Banking & Finance",
      website: "https://riftvalleybank.et",
      location: "Bahir Dar, Ethiopia",
      description: "Emerging digital-first commercial bank serving the Amhara region and beyond.",
      verificationStatus: "PENDING",
      subscriptionPlan: "FREE",
    },
  });

  // ---------- Candidate profiles ----------
  const meron = await prisma.candidateProfile.create({
    data: {
      userId: candidateUser.id,
      fullName: "Meron Tadesse",
      phone: "+251911234567",
      universityName: "Addis Ababa University",
      degreeLevel: "BACHELORS",
      fieldOfStudy: "Computer Science",
      graduationYear: 2024,
      gpa: 3.62,
      expectedSalary: 35000,
      experienceYears: 2,
      skills: "React, TypeScript, Node.js, PostgreSQL, Tailwind CSS, Git",
      about:
        "Full-stack developer passionate about building reliable web platforms for the Ethiopian market. Led a university capstone project on digital health records.",
    },
  });

  const abel = await prisma.candidateProfile.create({
    data: {
      userId: c2.id,
      fullName: "Abel Gebremariam",
      phone: "+251922334455",
      universityName: "Mekelle University",
      degreeLevel: "BACHELORS",
      fieldOfStudy: "Software Engineering",
      graduationYear: 2023,
      gpa: 3.1,
      expectedSalary: 28000,
      experienceYears: 1,
      skills: "Node.js, Express, MongoDB, Docker",
      about: "Backend developer focused on APIs and integrations.",
    },
  });

  const hana = await prisma.candidateProfile.create({
    data: {
      userId: c3.id,
      fullName: "Hana Mekonnen",
      phone: "+251933445566",
      universityName: "Hawassa University",
      degreeLevel: "MASTERS",
      fieldOfStudy: "Data Science",
      graduationYear: 2022,
      gpa: 3.85,
      expectedSalary: 55000,
      experienceYears: 4,
      skills: "Python, SQL, Machine Learning, Power BI, ETL",
      about: "Data scientist with banking analytics background.",
    },
  });

  const yonas = await prisma.candidateProfile.create({
    data: {
      userId: c4.id,
      fullName: "Yonas Tesfaye",
      phone: "+251944556677",
      universityName: "Jimma University",
      degreeLevel: "DIPLOMA",
      fieldOfStudy: "Information Technology",
      graduationYear: 2021,
      gpa: 2.4,
      expectedSalary: 20000,
      experienceYears: 0,
      skills: "HTML, CSS, Basic JavaScript",
      about: "Junior developer eager to grow.",
    },
  });

  // Documents for main candidate
  await prisma.document.createMany({
    data: [
      { candidateId: meron.id, type: "DEGREE", name: "AAU_Computer_Science_Degree.pdf", fileUrl: "mock://documents/degree-meron.pdf", verified: true },
      { candidateId: meron.id, type: "TRANSCRIPT", name: "AAU_Transcript.pdf", fileUrl: "mock://documents/transcript-meron.pdf" },
      { candidateId: hana.id, type: "CERTIFICATE", name: "AWS_ML_Specialization.pdf", fileUrl: "mock://documents/cert-hana.pdf" },
    ],
  });

  await prisma.referenceContact.createMany({
    data: [
      { candidateId: meron.id, name: "Dr. Tesfaye Girma", title: "Associate Professor", company: "Addis Ababa University", email: "t.girma@aau.edu.et", surveyStatus: "COMPLETED" },
      { candidateId: meron.id, name: "Ruth Alemayehu", title: "Engineering Manager", company: "Safaricom Ethiopia", email: "ruth.alemayehu@safaricom.et", surveyStatus: "SENT" },
    ],
  });

  // ---------- Jobs ----------
  const job1 = await prisma.jobPosting.create({
    data: {
      companyId: addisTech.id,
      title: "Senior Full-Stack Developer (React / Node.js)",
      description:
        "We are looking for a senior full-stack developer to join our fintech platform team in Addis Ababa. You will design, build and ship customer-facing features end-to-end, mentor junior engineers, and own services that process thousands of daily transactions.\n\nRequirements:\n- Strong React + TypeScript experience\n- Solid Node.js API design skills\n- Relational database modelling (PostgreSQL)\n- Comfortable with automated testing and CI/CD",
      category: "Engineering",
      location: "Addis Ababa (Hybrid)",
      jobType: "FULL_TIME",
      minExperienceYears: 2,
      minGpa: 3.0,
      targetGradYearStart: 2020,
      targetGradYearEnd: 2025,
      salaryBudgetMin: 30000,
      salaryBudgetMax: 60000,
      examPassMark: 60,
      maxViolations: 3,
      status: "OPEN",
      knockoutQuestions: {
        create: [
          { questionText: "Do you have at least 2 years of professional software development experience?", requiredAnswer: "YES", order: 1 },
          { questionText: "Are you based in or willing to relocate to Addis Ababa?", requiredAnswer: "YES", order: 2 },
          { questionText: "Are you comfortable attending a proctored online exam and a live video interview?", requiredAnswer: "YES", order: 3 },
        ],
      },
      assessmentQuestions: {
        create: [
          {
            questionText: "In React, which hook is used to perform side effects in function components?",
            questionType: "MCQ",
            options: JSON.stringify(["useEffect", "useState", "useMemo", "useRef"]),
            correctAnswer: "useEffect",
            timeLimitSeconds: 60,
            order: 1,
          },
          {
            questionText: "Which HTTP status code best represents a successful resource creation from a POST request?",
            questionType: "MCQ",
            options: JSON.stringify(["200 OK", "201 Created", "204 No Content", "301 Moved"]),
            correctAnswer: "201 Created",
            timeLimitSeconds: 60,
            order: 2,
          },
          {
            questionText: "In PostgreSQL, which index type is the default when you run CREATE INDEX?",
            questionType: "MCQ",
            options: JSON.stringify(["HASH", "GIN", "B-tree", "BRIN"]),
            correctAnswer: "B-tree",
            timeLimitSeconds: 90,
            order: 3,
          },
          {
            questionText: "What does the 'await' keyword do inside an async function?",
            questionType: "MCQ",
            options: JSON.stringify([
              "Blocks the event loop until the promise settles",
              "Pauses the async function until the promise settles without blocking the event loop",
              "Cancels the promise if it takes too long",
              "Converts the promise into a callback",
            ]),
            correctAnswer: "Pauses the async function until the promise settles without blocking the event loop",
            timeLimitSeconds: 90,
            order: 4,
          },
          {
            questionText: "Explain in 2-3 sentences how you would prevent SQL injection in a Node.js + PostgreSQL API.",
            questionType: "TEXT",
            correctAnswer: "parameterized queries",
            timeLimitSeconds: 120,
            order: 5,
          },
          {
            questionText: "In TypeScript, 'strict: true' in tsconfig.json enables all strict type-checking options.",
            questionType: "TRUE_FALSE",
            correctAnswer: "TRUE",
            timeLimitSeconds: 45,
            order: 6,
          },
          {
            questionText: "The capital city of Ethiopia is ___.",
            questionType: "FILL_BLANK",
            correctAnswer: "Addis Ababa, Addis Abeba",
            timeLimitSeconds: 45,
            order: 7,
          },
        ],
      },
    },
  });

  const job2 = await prisma.jobPosting.create({
    data: {
      companyId: addisTech.id,
      title: "Frontend Developer (React + Tailwind)",
      description:
        "Join the product team building EthioHire-grade customer portals. You will translate Figma designs into accessible, responsive interfaces and work closely with backend engineers.\n\nRequirements:\n- 1+ year building React applications\n- Tailwind CSS proficiency\n- Attention to accessibility and mobile UX",
      category: "Engineering",
      location: "Remote (Ethiopia)",
      jobType: "FULL_TIME",
      minExperienceYears: 1,
      minGpa: 2.8,
      targetGradYearStart: 2021,
      targetGradYearEnd: 2025,
      salaryBudgetMin: 20000,
      salaryBudgetMax: 40000,
      examPassMark: 60,
      maxViolations: 3,
      status: "OPEN",
      knockoutQuestions: {
        create: [
          { questionText: "Do you have at least 1 year of React development experience?", requiredAnswer: "YES", order: 1 },
          { questionText: "Do you have a reliable internet connection for online assessments?", requiredAnswer: "YES", order: 2 },
        ],
      },
      assessmentQuestions: {
        create: [
          {
            questionText: "Which CSS framework utility class stacks flex children vertically in Tailwind CSS?",
            questionType: "MCQ",
            options: JSON.stringify(["flex-row", "flex-col", "flex-wrap", "items-center"]),
            correctAnswer: "flex-col",
            timeLimitSeconds: 45,
            order: 1,
          },
          {
            questionText: "What is the purpose of the 'key' prop when rendering lists in React?",
            questionType: "MCQ",
            options: JSON.stringify([
              "It styles each list item",
              "It helps React identify items across renders for efficient reconciliation",
              "It defines the tab order",
              "It encrypts list data",
            ]),
            correctAnswer: "It helps React identify items across renders for efficient reconciliation",
            timeLimitSeconds: 60,
            order: 2,
          },
          {
            questionText: "Which attribute makes an <input> mandatory in HTML5 form validation?",
            questionType: "MCQ",
            options: JSON.stringify(["validate", "obligatory", "required", "must"]),
            correctAnswer: "required",
            timeLimitSeconds: 45,
            order: 3,
          },
          {
            questionText: "In TypeScript, what does [] as const produce for a tuple of strings?",
            questionType: "MCQ",
            options: JSON.stringify(["string[]", "readonly tuple of literal types", "any[]", "unknown"]),
            correctAnswer: "readonly tuple of literal types",
            timeLimitSeconds: 75,
            order: 4,
          },
        ],
      },
    },
  });

  const job3 = await prisma.jobPosting.create({
    data: {
      companyId: riftValley.id,
      title: "Data Analyst (Credit Risk)",
      description:
        "Rift Valley Bank is hiring a data analyst for its credit risk team. You will build dashboards, monitor portfolio quality and support the digital lending product.\n\nRequirements:\n- Advanced SQL\n- 3+ years of analytics experience\n- Banking or microfinance background preferred",
      category: "Data & Analytics",
      location: "Bahir Dar (On-site)",
      jobType: "FULL_TIME",
      minExperienceYears: 3,
      minGpa: 3.2,
      targetGradYearStart: 2018,
      targetGradYearEnd: 2024,
      salaryBudgetMin: 40000,
      salaryBudgetMax: 65000,
      examPassMark: 65,
      maxViolations: 2,
      status: "OPEN",
      knockoutQuestions: {
        create: [
          { questionText: "Do you have at least 3 years of data analytics experience?", requiredAnswer: "YES", order: 1 },
          { questionText: "Are you willing to work on-site in Bahir Dar?", requiredAnswer: "YES", order: 2 },
        ],
      },
      assessmentQuestions: {
        create: [
          {
            questionText: "Which SQL clause filters rows AFTER aggregation?",
            questionType: "MCQ",
            options: JSON.stringify(["WHERE", "HAVING", "GROUP BY", "ORDER BY"]),
            correctAnswer: "HAVING",
            timeLimitSeconds: 60,
            order: 1,
          },
          {
            questionText: "In credit risk, what does NPL stand for?",
            questionType: "MCQ",
            options: JSON.stringify([
              "Net Profit Line",
              "Non-Performing Loan",
              "New Portfolio Limit",
              "National Processing Ledger",
            ]),
            correctAnswer: "Non-Performing Loan",
            timeLimitSeconds: 45,
            order: 2,
          },
          {
            questionText: "Which measure of central tendency is most robust to extreme outliers?",
            questionType: "MCQ",
            options: JSON.stringify(["Mean", "Median", "Mode", "Range"]),
            correctAnswer: "Median",
            timeLimitSeconds: 45,
            order: 3,
          },
        ],
      },
    },
  });

  // ---------- Applications ----------
  // Meron applied to job1 — passed pre-screen, passed exam, interview scheduled
  await prisma.jobApplication.create({
    data: {
      jobId: job1.id,
      candidateId: meron.id,
      status: "INTERVIEW_SCHEDULED",
      matchScore: 86,
      preScreenPassed: true,
      knockoutAnswers: JSON.stringify([]),
      examStartedAt: new Date(Date.now() - 86400000),
      examCompletedAt: new Date(Date.now() - 86000000),
      examScore: 80,
      examStatus: "PASSED",
      violationCount: 0,
      proctoringLogs: {
        create: [
          { eventType: "SNAPSHOT", details: "Scheduled webcam snapshot — single face detected", createdAt: new Date(Date.now() - 86400000) },
          { eventType: "SNAPSHOT", details: "Scheduled webcam snapshot — single face detected", createdAt: new Date(Date.now() - 86390000) },
        ],
      },
      interviewSchedules: {
        create: {
          scheduledTime: new Date(Date.now() + 172800000),
          format: "VIDEO",
          meetingLink: "https://meet.ethiohire.et/room/atg-meron-2024",
          interviewerName: "Selam Bekele",
          status: "SCHEDULED",
        },
      },
    },
  });

  // Abel applied to job1 — passed pre-screen, exam failed
  const abelApp = await prisma.jobApplication.create({
    data: {
      jobId: job1.id,
      candidateId: abel.id,
      status: "EXAM_FAILED",
      matchScore: 64,
      preScreenPassed: true,
      examStartedAt: new Date(Date.now() - 172800000),
      examCompletedAt: new Date(Date.now() - 172700000),
      examScore: 40,
      examStatus: "FAILED",
      violationCount: 2,
      proctoringLogs: {
        create: [
          { eventType: "TAB_SWITCH", details: "Candidate switched tabs for 4 seconds", createdAt: new Date(Date.now() - 172750000) },
          { eventType: "COPY_PASTE", details: "Paste attempt blocked on question 3", createdAt: new Date(Date.now() - 172740000) },
        ],
      },
    },
  });

  const q1 = await prisma.assessmentQuestion.findFirst({ where: { jobId: job1.id, order: 1 } });
  if (q1) {
    await prisma.examAnswer.create({
      data: { applicationId: abelApp.id, questionId: q1.id, answer: "useEffect", isCorrect: true, timeSpentSeconds: 22 },
    });
  }

  // Hana applied to job3 (Rift Valley) — pre-screen passed, not started exam
  await prisma.jobApplication.create({
    data: {
      jobId: job3.id,
      candidateId: hana.id,
      status: "APPLIED",
      matchScore: 92,
      preScreenPassed: true,
    },
  });

  // Yonas applied to job2 — failed pre-screen (GPA + knockout)
  await prisma.jobApplication.create({
    data: {
      jobId: job2.id,
      candidateId: yonas.id,
      status: "PRE_SCREEN_REJECTED",
      matchScore: 31,
      preScreenPassed: false,
      rejectReason: "GPA 2.40 is below the minimum 2.80; experience (0 years) below required 1 year.",
    },
  });

  // ---------- Notifications / Audit / Settings ----------
  await prisma.notification.createMany({
    data: [
      { userId: candidateUser.id, title: "Interview scheduled — Senior Full-Stack Developer", body: "Your live interview with Addis Tech Group is scheduled. Check the Interviews page for details.", channel: "EMAIL" },
      { userId: candidateUser.id, title: "Exam result published", body: "You scored 80% on the Addis Tech Group assessment. Congratulations!", channel: "IN_APP" },
      { userId: recruiterUser.id, title: "Pre-screening completed", body: "1 candidate passed pre-screening for Senior Full-Stack Developer.", channel: "IN_APP" },
      { userId: recruiter2User.id, title: "Pre-screening completed", body: "1 candidate passed pre-screening for Data Analyst (Credit Risk).", channel: "IN_APP" },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      { actorEmail: "admin@ethiohire.et", action: "COMPANY_APPROVED", entity: "CompanyProfile:Addis Tech Group", details: "Verified business license TIN-0012345678" },
      { actorEmail: "hr@addistech.et", action: "JOB_CREATED", entity: "JobPosting:Senior Full-Stack Developer", details: "Posted with 5 assessment questions" },
      { actorEmail: "system", action: "EXAM_GRADED", entity: "JobApplication", details: "Auto-grader executed for completed exams" },
    ],
  });

  await prisma.platformSetting.createMany({
    data: [
      { key: "platform_fee_percent", value: "5" },
      { key: "default_exam_pass_mark", value: "60" },
      { key: "default_max_violations", value: "3" },
      { key: "pro_subscription_etb", value: "4500" },
      { key: "enterprise_subscription_etb", value: "12500" },
      { key: "sms_gateway", value: "ethio-telecom-bulk" },
    ],
  });

  console.log("Seed complete.");
  console.log("  Admin:     admin@ethiohire.et / Admin123!");
  console.log("  Recruiter: hr@addistech.et / Demo123!");
  console.log("  Recruiter: hr@riftvalleybank.et / Demo123!");
  console.log("  Candidate: candidate@ethiohire.et / Demo123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
