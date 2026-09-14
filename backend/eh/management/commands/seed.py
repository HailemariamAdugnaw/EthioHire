"""
EthioHire — Django management command: seed the PostgreSQL database with the
demo dataset (port of scripts/seed.ts). Idempotent: skips if the admin user
already exists. Run: python manage.py seed
"""
import datetime as dt

from django.core.management.base import BaseCommand
from django.utils import timezone

from eh.models import (
    AssessmentQuestion,
    AuditLog,
    CandidateProfile,
    CompanyProfile,
    Document,
    ExamAnswer,
    ExamSession,
    InterviewSchedule,
    JobApplication,
    JobPosting,
    KnockoutQuestion,
    Notification,
    PlatformSetting,
    ProctoringLog,
    ReferenceContact,
    User,
)
from eh.ehauth import scrypt_hash


class Command(BaseCommand):
    help = "Seed EthioHire demo data (users, companies, jobs with 4 question types, applications)"

    def handle(self, *args, **options):
        if User.objects.filter(email="admin@ethiohire.et").exists():
            self.stdout.write("Database already seeded — skipping.")
            return

        self.stdout.write("Seeding EthioHire demo data...")

        # ---------- Users ----------
        User.objects.create(
            email="admin@ethiohire.et", passwordHash=scrypt_hash("Admin123!"),
            name="Platform Admin", role="ADMIN",
        )
        recruiter_user = User.objects.create(
            email="hr@addistech.et", passwordHash=scrypt_hash("Demo123!"),
            name="Selam Bekele", role="RECRUITER",
        )
        recruiter2_user = User.objects.create(
            email="hr@riftvalleybank.et", passwordHash=scrypt_hash("Demo123!"),
            name="Dawit Alemu", role="RECRUITER",
        )
        candidate_user = User.objects.create(
            email="candidate@ethiohire.et", passwordHash=scrypt_hash("Demo123!"),
            name="Meron Tadesse", role="CANDIDATE",
        )
        c2 = User.objects.create(
            email="abel.gebremariam@gmail.com", passwordHash=scrypt_hash("Demo123!"),
            name="Abel Gebremariam", role="CANDIDATE",
        )
        c3 = User.objects.create(
            email="hana.mekonnen@gmail.com", passwordHash=scrypt_hash("Demo123!"),
            name="Hana Mekonnen", role="CANDIDATE",
        )
        c4 = User.objects.create(
            email="yonas.tesfaye@gmail.com", passwordHash=scrypt_hash("Demo123!"),
            name="Yonas Tesfaye", role="CANDIDATE",
        )

        # ---------- Companies ----------
        addis_tech = CompanyProfile.objects.create(
            userId=recruiter_user,
            companyName="Addis Tech Group",
            industry="Software & IT Services",
            website="https://addistech.et",
            location="Addis Ababa, Ethiopia",
            description="A leading Ethiopian software company building fintech, logistics and e-government products for the Horn of Africa region.",
            verificationStatus="APPROVED",
            subscriptionPlan="PRO",
        )
        rift_valley = CompanyProfile.objects.create(
            userId=recruiter2_user,
            companyName="Rift Valley Bank",
            industry="Banking & Finance",
            website="https://riftvalleybank.et",
            location="Bahir Dar, Ethiopia",
            description="Emerging digital-first commercial bank serving the Amhara region and beyond.",
            verificationStatus="PENDING",
            subscriptionPlan="FREE",
        )

        # ---------- Candidate profiles ----------
        meron = CandidateProfile.objects.create(
            userId=candidate_user, fullName="Meron Tadesse", phone="+251911234567",
            universityName="Addis Ababa University", degreeLevel="BACHELORS",
            fieldOfStudy="Computer Science", graduationYear=2024, gpa=3.62,
            expectedSalary=35000, experienceYears=2,
            skills="React, TypeScript, Node.js, PostgreSQL, Tailwind CSS, Git",
            about="Full-stack developer passionate about building reliable web platforms for the Ethiopian market. Led a university capstone project on digital health records.",
        )
        abel = CandidateProfile.objects.create(
            userId=c2, fullName="Abel Gebremariam", phone="+251922334455",
            universityName="Mekelle University", degreeLevel="BACHELORS",
            fieldOfStudy="Software Engineering", graduationYear=2023, gpa=3.1,
            expectedSalary=28000, experienceYears=1,
            skills="Node.js, Express, MongoDB, Docker",
            about="Backend developer focused on APIs and integrations.",
        )
        hana = CandidateProfile.objects.create(
            userId=c3, fullName="Hana Mekonnen", phone="+251933445566",
            universityName="Hawassa University", degreeLevel="MASTERS",
            fieldOfStudy="Data Science", graduationYear=2022, gpa=3.85,
            expectedSalary=55000, experienceYears=4,
            skills="Python, SQL, Machine Learning, Power BI, ETL",
            about="Data scientist with banking analytics background.",
        )
        yonas = CandidateProfile.objects.create(
            userId=c4, fullName="Yonas Tesfaye", phone="+251944556677",
            universityName="Jimma University", degreeLevel="DIPLOMA",
            fieldOfStudy="Information Technology", graduationYear=2021, gpa=2.4,
            expectedSalary=20000, experienceYears=0,
            skills="HTML, CSS, Basic JavaScript",
            about="Junior developer eager to grow.",
        )

        # Documents + references
        Document.objects.create(
            candidate=meron, type="DEGREE", name="AAU_Computer_Science_Degree.pdf",
            fileUrl="mock://documents/degree-meron.pdf", verified=True,
        )
        Document.objects.create(
            candidate=meron, type="TRANSCRIPT", name="AAU_Transcript.pdf",
            fileUrl="mock://documents/transcript-meron.pdf",
        )
        Document.objects.create(
            candidate=hana, type="CERTIFICATE", name="AWS_ML_Specialization.pdf",
            fileUrl="mock://documents/cert-hana.pdf",
        )
        ReferenceContact.objects.create(
            candidate=meron, name="Dr. Tesfaye Girma", title="Associate Professor",
            company="Addis Ababa University", email="t.girma@aau.edu.et", surveyStatus="COMPLETED",
        )
        ReferenceContact.objects.create(
            candidate=meron, name="Ruth Alemayehu", title="Engineering Manager",
            company="Safaricom Ethiopia", email="ruth.alemayehu@safaricom.et", surveyStatus="SENT",
        )

        # ---------- Jobs ----------
        now = timezone.now()
        job1 = JobPosting.objects.create(
            company=addis_tech,
            title="Senior Full-Stack Developer (React / Node.js)",
            description=(
                "We are looking for a senior full-stack developer to join our fintech platform team in Addis Ababa. "
                "You will design, build and ship customer-facing features end-to-end, mentor junior engineers, and own "
                "services that process thousands of daily transactions.\n\nRequirements:\n- Strong React + TypeScript "
                "experience\n- Solid Node.js API design skills\n- Relational database modelling (PostgreSQL)\n- Comfortable "
                "with automated testing and CI/CD"
            ),
            category="Engineering", location="Addis Ababa (Hybrid)", jobType="FULL_TIME",
            minExperienceYears=2, minGpa=3.0, targetGradYearStart=2020, targetGradYearEnd=2025,
            salaryBudgetMin=30000, salaryBudgetMax=60000, examPassMark=60, maxViolations=3, status="OPEN",
            postingStartDate=now - dt.timedelta(days=5), applicationDeadline=now + dt.timedelta(days=25),
        )
        for text in (
            "Do you have at least 2 years of professional software development experience?",
            "Are you based in or willing to relocate to Addis Ababa?",
            "Are you comfortable attending a proctored online exam and a live video interview?",
        ):
            KnockoutQuestion.objects.create(
                job=job1, questionText=text, requiredAnswer="YES",
                order=KnockoutQuestion.objects.filter(job=job1).count() + 1,
            )
        for aq in (
            {"questionText": "In React, which hook is used to perform side effects in function components?",
             "questionType": "MCQ", "options": '["useEffect", "useState", "useMemo", "useRef"]',
             "correctAnswer": "useEffect", "timeLimitSeconds": 60, "order": 1},
            {"questionText": "Which HTTP status code best represents a successful resource creation from a POST request?",
             "questionType": "MCQ", "options": '["200 OK", "201 Created", "204 No Content", "301 Moved"]',
             "correctAnswer": "201 Created", "timeLimitSeconds": 60, "order": 2},
            {"questionText": "In PostgreSQL, which index type is the default when you run CREATE INDEX?",
             "questionType": "MCQ", "options": '["HASH", "GIN", "B-tree", "BRIN"]',
             "correctAnswer": "B-tree", "timeLimitSeconds": 90, "order": 3},
            {"questionText": "What does the 'await' keyword do inside an async function?",
             "questionType": "MCQ",
             "options": '["Blocks the event loop until the promise settles", "Pauses the async function until the promise settles without blocking the event loop", "Cancels the promise if it takes too long", "Converts the promise into a callback"]',
             "correctAnswer": "Pauses the async function until the promise settles without blocking the event loop",
             "timeLimitSeconds": 90, "order": 4},
            {"questionText": "Explain in 2-3 sentences how you would prevent SQL injection in a Node.js + PostgreSQL API.",
             "questionType": "TEXT", "options": None, "correctAnswer": "parameterized queries",
             "timeLimitSeconds": 120, "order": 5},
            {"questionText": "In TypeScript, 'strict: true' in tsconfig.json enables all strict type-checking options.",
             "questionType": "TRUE_FALSE", "options": None, "correctAnswer": "TRUE",
             "timeLimitSeconds": 45, "order": 6},
            {"questionText": "The capital city of Ethiopia is ___.",
             "questionType": "FILL_BLANK", "options": None, "correctAnswer": "Addis Ababa, Addis Abeba",
             "timeLimitSeconds": 45, "order": 7},
        ):
            AssessmentQuestion.objects.create(job=job1, **aq)

        job2 = JobPosting.objects.create(
            company=addis_tech,
            title="Frontend Developer (React + Tailwind)",
            description=(
                "Join the product team building EthioHire-grade customer portals. You will translate Figma designs into "
                "accessible, responsive interfaces and work closely with backend engineers.\n\nRequirements:\n- 1+ year "
                "building React applications\n- Tailwind CSS proficiency\n- Attention to accessibility and mobile UX"
            ),
            category="Engineering", location="Remote (Ethiopia)", jobType="FULL_TIME",
            minExperienceYears=1, minGpa=2.8, targetGradYearStart=2021, targetGradYearEnd=2025,
            salaryBudgetMin=20000, salaryBudgetMax=40000, examPassMark=60, maxViolations=3, status="OPEN",
            postingStartDate=now - dt.timedelta(days=10), applicationDeadline=now + dt.timedelta(days=4),
        )
        for text in (
            "Do you have at least 1 year of React development experience?",
            "Do you have a reliable internet connection for online assessments?",
        ):
            KnockoutQuestion.objects.create(
                job=job2, questionText=text, requiredAnswer="YES",
                order=KnockoutQuestion.objects.filter(job=job2).count() + 1,
            )
        for aq in (
            {"questionText": "Which CSS framework utility class stacks flex children vertically in Tailwind CSS?",
             "questionType": "MCQ", "options": '["flex-row", "flex-col", "flex-wrap", "items-center"]',
             "correctAnswer": "flex-col", "timeLimitSeconds": 45, "order": 1},
            {"questionText": "What is the purpose of the 'key' prop when rendering lists in React?",
             "questionType": "MCQ",
             "options": '["It styles each list item", "It helps React identify items across renders for efficient reconciliation", "It defines the tab order", "It encrypts list data"]',
             "correctAnswer": "It helps React identify items across renders for efficient reconciliation",
             "timeLimitSeconds": 60, "order": 2},
            {"questionText": "Which attribute makes an <input> mandatory in HTML5 form validation?",
             "questionType": "MCQ", "options": '["validate", "obligatory", "required", "must"]',
             "correctAnswer": "required", "timeLimitSeconds": 45, "order": 3},
            {"questionText": "In TypeScript, what does [] as const produce for a tuple of strings?",
             "questionType": "MCQ", "options": '["string[]", "readonly tuple of literal types", "any[]", "unknown"]',
             "correctAnswer": "readonly tuple of literal types", "timeLimitSeconds": 75, "order": 4},
        ):
            AssessmentQuestion.objects.create(job=job2, **aq)

        job3 = JobPosting.objects.create(
            company=rift_valley,
            title="Data Analyst (Credit Risk)",
            description=(
                "Rift Valley Bank is hiring a data analyst for its credit risk team. You will build dashboards, monitor "
                "portfolio quality and support the digital lending product.\n\nRequirements:\n- Advanced SQL\n- 3+ years "
                "of analytics experience\n- Banking or microfinance background preferred"
            ),
            category="Technology", location="Bahir Dar (On-site)", jobType="FULL_TIME",
            minExperienceYears=3, minGpa=3.2, targetGradYearStart=2018, targetGradYearEnd=2024,
            salaryBudgetMin=40000, salaryBudgetMax=65000, examPassMark=65, maxViolations=2, status="OPEN",
            postingStartDate=now - dt.timedelta(days=2), applicationDeadline=now + dt.timedelta(days=12),
        )
        for text in (
            "Do you have at least 3 years of data analytics experience?",
            "Are you willing to work on-site in Bahir Dar?",
        ):
            KnockoutQuestion.objects.create(
                job=job3, questionText=text, requiredAnswer="YES",
                order=KnockoutQuestion.objects.filter(job=job3).count() + 1,
            )
        for aq in (
            {"questionText": "Which SQL clause filters rows AFTER aggregation?",
             "questionType": "MCQ", "options": '["WHERE", "HAVING", "GROUP BY", "ORDER BY"]',
             "correctAnswer": "HAVING", "timeLimitSeconds": 60, "order": 1},
            {"questionText": "In credit risk, what does NPL stand for?",
             "questionType": "MCQ",
             "options": '["Net Profit Line", "Non-Performing Loan", "New Portfolio Limit", "National Processing Ledger"]',
             "correctAnswer": "Non-Performing Loan", "timeLimitSeconds": 45, "order": 2},
            {"questionText": "Which measure of central tendency is most robust to extreme outliers?",
             "questionType": "MCQ", "options": '["Mean", "Median", "Mode", "Range"]',
             "correctAnswer": "Median", "timeLimitSeconds": 45, "order": 3},
        ):
            AssessmentQuestion.objects.create(job=job3, **aq)

        # ---------- Scheduled exam sessions (pooled group exams) ----------
        # job1 — session already ran (immediate release): explains the seeded
        # PASSED/FAILED attempts for Meron and Abel.
        ExamSession.objects.create(
            job=job1,
            scheduledAt=now - dt.timedelta(days=3),
            durationMinutes=90,
            releaseMode="IMMEDIATE",
            resultsReleasedAt=now - dt.timedelta(days=3) + dt.timedelta(minutes=90),
        )
        # job3 — upcoming pooled session with manual result release: candidates
        # see a countdown and their score stays hidden until the recruiter
        # publishes results.
        ExamSession.objects.create(
            job=job3,
            scheduledAt=now + dt.timedelta(days=5),
            durationMinutes=60,
            releaseMode="MANUAL",
        )

        # ---------- Applications ----------
        now = timezone.now()
        meron_app = JobApplication.objects.create(
            job=job1, candidate=meron, status="INTERVIEW_SCHEDULED",
            matchScore=86, preScreenPassed=True, knockoutAnswers="[]",
            examStartedAt=now - dt.timedelta(seconds=86400),
            examCompletedAt=now - dt.timedelta(seconds=86000),
            examScore=80, examStatus="PASSED", violationCount=0,
        )
        ProctoringLog.objects.create(
            application=meron_app, eventType="SNAPSHOT",
            details="Scheduled webcam snapshot — single face detected",
            createdAt=now - dt.timedelta(seconds=86400),
        )
        ProctoringLog.objects.create(
            application=meron_app, eventType="SNAPSHOT",
            details="Scheduled webcam snapshot — single face detected",
            createdAt=now - dt.timedelta(seconds=86390),
        )
        InterviewSchedule.objects.create(
            application=meron_app, scheduledTime=now + dt.timedelta(seconds=172800),
            format="VIDEO", meetingLink="https://meet.ethiohire.et/room/atg-meron-2024",
            interviewerName="Selam Bekele", status="SCHEDULED",
        )

        abel_app = JobApplication.objects.create(
            job=job1, candidate=abel, status="EXAM_FAILED",
            matchScore=64, preScreenPassed=True,
            examStartedAt=now - dt.timedelta(seconds=172800),
            examCompletedAt=now - dt.timedelta(seconds=172700),
            examScore=40, examStatus="FAILED", violationCount=2,
        )
        ProctoringLog.objects.create(
            application=abel_app, eventType="TAB_SWITCH",
            details="Candidate switched tabs for 4 seconds",
            createdAt=now - dt.timedelta(seconds=172750),
        )
        ProctoringLog.objects.create(
            application=abel_app, eventType="COPY_PASTE",
            details="Paste attempt blocked on question 3",
            createdAt=now - dt.timedelta(seconds=172740),
        )
        q1 = AssessmentQuestion.objects.filter(job=job1, order=1).first()
        if q1:
            ExamAnswer.objects.create(
                application=abel_app, question=q1, answer="useEffect",
                isCorrect=True, timeSpentSeconds=22,
            )

        JobApplication.objects.create(
            job=job3, candidate=hana, status="APPLIED",
            matchScore=92, preScreenPassed=True,
        )
        JobApplication.objects.create(
            job=job2, candidate=yonas, status="PRE_SCREEN_REJECTED",
            matchScore=31, preScreenPassed=False,
            rejectReason="GPA 2.40 is below the minimum 2.80; experience (0 years) below required 1 year.",
        )

        # ---------- Notifications / Audit / Settings ----------
        Notification.objects.create(
            user=candidate_user, title="Interview scheduled — Senior Full-Stack Developer",
            body="Your live interview with Addis Tech Group is scheduled. Check the Interviews page for details.",
            channel="EMAIL",
        )
        Notification.objects.create(
            user=candidate_user, title="Exam result published",
            body="You scored 80% on the Addis Tech Group assessment. Congratulations!", channel="IN_APP",
        )
        Notification.objects.create(
            user=c3, title="Assessment scheduled — Data Analyst (Credit Risk)",
            body=("You qualified for the proctored text exam. All qualified candidates start simultaneously "
                  "with an identical 60-minute countdown window — results are published together afterwards."),
            channel="IN_APP",
        )
        Notification.objects.create(
            user=recruiter_user, title="Pre-screening completed",
            body="1 candidate passed pre-screening for Senior Full-Stack Developer.", channel="IN_APP",
        )
        Notification.objects.create(
            user=recruiter2_user, title="Pre-screening completed",
            body="1 candidate passed pre-screening for Data Analyst (Credit Risk).", channel="IN_APP",
        )

        AuditLog.objects.create(
            actorEmail="admin@ethiohire.et", action="COMPANY_APPROVED",
            entity="CompanyProfile:Addis Tech Group", details="Verified business license TIN-0012345678",
        )
        AuditLog.objects.create(
            actorEmail="hr@addistech.et", action="JOB_CREATED",
            entity="JobPosting:Senior Full-Stack Developer", details="Posted with 5 assessment questions",
        )
        AuditLog.objects.create(
            actorEmail="system", action="EXAM_GRADED", entity="JobApplication",
            details="Auto-grader executed for completed exams",
        )

        for key, value in (
            ("platform_fee_percent", "5"),
            ("default_exam_pass_mark", "60"),
            ("default_max_violations", "3"),
            ("pro_subscription_etb", "4500"),
            ("enterprise_subscription_etb", "12500"),
            ("sms_gateway", "ethio-telecom-bulk"),
        ):
            PlatformSetting.objects.create(key=key, value=value)

        self.stdout.write("Seed complete.")
        self.stdout.write("  Admin:     admin@ethiohire.et / Admin123!")
        self.stdout.write("  Recruiter: hr@addistech.et / Demo123!")
        self.stdout.write("  Recruiter: hr@riftvalleybank.et / Demo123!")
        self.stdout.write("  Candidate: candidate@ethiohire.et / Demo123!")
