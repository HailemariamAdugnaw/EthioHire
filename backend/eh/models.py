"""
EthioHire — data model (port of prisma/schema.prisma to Django ORM).

Field names intentionally mirror the Prisma schema so the JSON serializers
produce byte-compatible API responses for the existing React frontend.
"""
import secrets
import time

from django.db import models


def gen_id() -> str:
    """cuid-like opaque id: 'c' + ms-timestamp base36 + random suffix."""
    ts = format(int(time.time() * 1000), "x")
    return f"c{ts}{secrets.token_hex(8)}"


class User(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    email = models.CharField(max_length=320, unique=True)
    passwordHash = models.TextField(null=True, blank=True)  # demo-mode auth only
    firebaseUid = models.CharField(max_length=128, unique=True, null=True, blank=True)
    name = models.CharField(max_length=200)
    role = models.CharField(max_length=20)  # ADMIN | RECRUITER | CANDIDATE
    phone = models.CharField(max_length=40, null=True, blank=True)
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eh_user"


class CompanyProfile(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    userId = models.OneToOneField(User, related_name="companyProfile", on_delete=models.CASCADE, db_column="userId")
    companyName = models.CharField(max_length=200)
    industry = models.CharField(max_length=120, null=True, blank=True)
    website = models.CharField(max_length=300, null=True, blank=True)
    location = models.CharField(max_length=200, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    verificationStatus = models.CharField(max_length=20, default="PENDING")  # PENDING | APPROVED | SUSPENDED
    subscriptionPlan = models.CharField(max_length=20, default="FREE")  # FREE | PRO | ENTERPRISE
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eh_company_profile"


class CandidateProfile(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    userId = models.OneToOneField(User, related_name="candidateProfile", on_delete=models.CASCADE, db_column="userId")
    fullName = models.CharField(max_length=200)
    phone = models.CharField(max_length=40, null=True, blank=True)
    universityName = models.CharField(max_length=200, null=True, blank=True)
    degreeLevel = models.CharField(max_length=20, null=True, blank=True)  # HIGH_SCHOOL | DIPLOMA | BACHELORS | MASTERS | PHD
    fieldOfStudy = models.CharField(max_length=200, null=True, blank=True)
    graduationYear = models.IntegerField(null=True, blank=True)
    gpa = models.FloatField(null=True, blank=True)
    expectedSalary = models.FloatField(null=True, blank=True)  # monthly gross, ETB
    experienceYears = models.IntegerField(null=True, blank=True)
    skills = models.TextField(null=True, blank=True)  # comma separated
    about = models.TextField(null=True, blank=True)
    cvUrl = models.CharField(max_length=500, null=True, blank=True)

    class Meta:
        db_table = "eh_candidate_profile"


class Document(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    candidate = models.ForeignKey(CandidateProfile, related_name="documents", on_delete=models.CASCADE, db_column="candidateId")
    type = models.CharField(max_length=20)  # DEGREE | TRANSCRIPT | CERTIFICATE | CV | OTHER
    name = models.CharField(max_length=200)
    fileUrl = models.TextField()  # data URL in sandbox; object-storage URL in production
    verified = models.BooleanField(default=False)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "eh_document"


class ReferenceContact(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    candidate = models.ForeignKey(CandidateProfile, related_name="references", on_delete=models.CASCADE, db_column="candidateId")
    name = models.CharField(max_length=200)
    title = models.CharField(max_length=200, null=True, blank=True)
    company = models.CharField(max_length=200, null=True, blank=True)
    email = models.CharField(max_length=320, null=True, blank=True)
    phone = models.CharField(max_length=40, null=True, blank=True)
    surveyStatus = models.CharField(max_length=20, default="PENDING")  # PENDING | SENT | COMPLETED
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "eh_reference_contact"


class JobPosting(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    company = models.ForeignKey(CompanyProfile, related_name="jobs", on_delete=models.CASCADE, db_column="companyId")
    title = models.CharField(max_length=250)
    description = models.TextField()
    # Text-based sections requested by recruiters: what the employee will do
    # (role description) and the education background the job requires.
    roleDescription = models.TextField(null=True, blank=True)
    educationRequirement = models.TextField(null=True, blank=True)
    category = models.CharField(max_length=120, null=True, blank=True)
    location = models.CharField(max_length=200, null=True, blank=True)
    jobType = models.CharField(max_length=20, null=True, blank=True)  # FULL_TIME | PART_TIME | CONTRACT | INTERNSHIP
    minExperienceYears = models.IntegerField(default=0)
    minGpa = models.FloatField(null=True, blank=True)
    targetGradYearStart = models.IntegerField(null=True, blank=True)
    targetGradYearEnd = models.IntegerField(null=True, blank=True)
    salaryBudgetMin = models.FloatField(null=True, blank=True)
    salaryBudgetMax = models.FloatField(null=True, blank=True)
    examPassMark = models.IntegerField(default=60)   # % required to pass the proctored exam
    maxViolations = models.IntegerField(default=3)   # proctoring tolerance before termination
    postingStartDate = models.DateTimeField(null=True, blank=True)   # applications open from
    applicationDeadline = models.DateTimeField(null=True, blank=True)  # hard apply cutoff
    # Live-interview configuration
    # Standalone reusable resources — recruiters manage question banks and
    # evaluation templates independently (Interview Setup module) and link
    # them to jobs here. When both are null the job-level inline data
    # (interviewQuestions / scoringTemplate rows) is used — that keeps jobs
    # created before the standalone resources working unchanged.
    bank = models.ForeignKey("InterviewBank", related_name="jobs", null=True, blank=True, on_delete=models.SET_NULL, db_column="bankId")
    evalTemplate = models.ForeignKey("EvalTemplate", related_name="jobs", null=True, blank=True, on_delete=models.SET_NULL, db_column="evalTemplateId")
    interviewQuestionVisibility = models.CharField(max_length=10, default="SINGLE")
    # SINGLE = candidate sees one question at a time (interviewer-driven)
    # ALL    = candidate sees the full question list during the session
    # HIDDEN = candidate sees no questions
    interviewResultRelease = models.CharField(max_length=12, default="IMMEDIATE")
    # IMMEDIATE = evaluation result emails go out right after "submit evaluation & complete"
    # AFTER_ALL = hold until every interview for this job is completed, then publish together
    # MANUAL    = hold until the recruiter publishes them — either by clicking
    #             "Release results" on the Interviews page or automatically at
    #             interviewResultsReleaseAt (the pre-set release schedule).
    interviewResultsReleaseAt = models.DateTimeField(null=True, blank=True)  # scheduled auto-release
    status = models.CharField(max_length=10, default="OPEN")  # DRAFT | OPEN | CLOSED
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eh_job_posting"


class KnockoutQuestion(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    job = models.ForeignKey(JobPosting, related_name="knockoutQuestions", on_delete=models.CASCADE, db_column="jobId")
    questionText = models.TextField()
    requiredAnswer = models.CharField(max_length=10)  # YES | NO
    order = models.IntegerField(default=0)

    class Meta:
        db_table = "eh_knockout_question"


class AssessmentQuestion(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    job = models.ForeignKey(JobPosting, related_name="assessmentQuestions", on_delete=models.CASCADE, db_column="jobId")
    questionText = models.TextField()
    questionType = models.CharField(max_length=20, default="MCQ")  # MCQ | TRUE_FALSE | FILL_BLANK | TEXT
    options = models.TextField(null=True, blank=True)  # JSON array of strings for MCQ
    correctAnswer = models.TextField()
    timeLimitSeconds = models.IntegerField(default=90)
    order = models.IntegerField(default=0)

    class Meta:
        db_table = "eh_assessment_question"


class InterviewQuestion(models.Model):
    """Dedicated live-interview question bank — deliberately separate from the
    proctored text-exam bank (AssessmentQuestion). Recruiters define the exact
    questions interviewers ask per job; candidate visibility is controlled by
    JobPosting.interviewQuestionVisibility (SINGLE/ALL/HIDDEN) AND by the
    per-question visibleToCandidate toggle (granular overrides on top of the
    job-wide mode)."""
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    job = models.ForeignKey(JobPosting, related_name="interviewQuestions", on_delete=models.CASCADE, db_column="jobId")
    questionText = models.TextField()
    guidance = models.TextField(null=True, blank=True)  # interviewer-only note: what a good answer covers
    visibleToCandidate = models.BooleanField(default=True)  # False = interviewer-only, even in ALL mode
    order = models.IntegerField(default=0)

    class Meta:
        db_table = "eh_interview_question"


class InterviewBank(models.Model):
    """Standalone, reusable live-interview question bank owned by a company.

    Deliberately independent of both the proctored text-exam pool
    (AssessmentQuestion) and of any single job: recruiters build banks in the
    Interview Setup module and link one to a job when needed. Linking copies
    nothing — the job always asks the bank's live questions, so a bank edit
    updates every interview that uses it."""
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    company = models.ForeignKey(CompanyProfile, related_name="interviewBanks", on_delete=models.CASCADE, db_column="companyId")
    name = models.CharField(max_length=200)
    description = models.TextField(null=True, blank=True)
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eh_interview_bank"


class InterviewBankQuestion(models.Model):
    """Question inside a standalone InterviewBank (mirrors InterviewQuestion
    plus the candidate-visibility toggle and interviewer guidance)."""
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    bank = models.ForeignKey(InterviewBank, related_name="questions", on_delete=models.CASCADE, db_column="bankId")
    questionText = models.TextField()
    guidance = models.TextField(null=True, blank=True)  # interviewer-only note
    visibleToCandidate = models.BooleanField(default=True)
    order = models.IntegerField(default=0)

    class Meta:
        db_table = "eh_interview_bank_question"


class EvalTemplate(models.Model):
    """Standalone, reusable interview evaluation template owned by a company.

    Recruiters define competencies (with custom weights — e.g. core technical
    counts more than soft skills), the rating scale, per-question ratings and
    room instructions; templates are linked to jobs from the job editor."""
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    company = models.ForeignKey(CompanyProfile, related_name="evalTemplates", on_delete=models.CASCADE, db_column="companyId")
    name = models.CharField(max_length=200)
    competencies = models.TextField(default="[]")  # JSON [{key, label, weight(1-10)}]
    scaleMax = models.IntegerField(default=5)       # competency/question rating ceiling (1..N)
    rateQuestions = models.BooleanField(default=True)  # per-question 1..scaleMax ratings enabled
    instructions = models.TextField(null=True, blank=True)  # optional guidance shown in the room
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eh_eval_template"


class ScoringTemplate(models.Model):
    """Legacy job-scoring template (per job) — superseded by the standalone
    EvalTemplate library (migration 0007 copies every row over). Jobs linked
    to an EvalTemplate ignore this row; when both are absent the API
    synthesizes the historical default so existing rooms keep working."""
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    job = models.OneToOneField(JobPosting, related_name="scoringTemplate", on_delete=models.CASCADE, db_column="jobId")
    competencies = models.TextField(default="[]")  # JSON [{key, label}]
    scaleMax = models.IntegerField(default=5)       # competency/question rating ceiling (1..N)
    rateQuestions = models.BooleanField(default=True)  # per-question 1..scaleMax ratings enabled
    instructions = models.TextField(null=True, blank=True)  # optional guidance shown in the room
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eh_scoring_template"


class JobApplication(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    job = models.ForeignKey(JobPosting, related_name="applications", on_delete=models.CASCADE, db_column="jobId")
    candidate = models.ForeignKey(CandidateProfile, related_name="applications", on_delete=models.CASCADE, db_column="candidateId")
    status = models.CharField(max_length=30, default="APPLIED")
    # APPLIED | PRE_SCREEN_REJECTED | EXAM_IN_PROGRESS | EXAM_PASSED | EXAM_FAILED
    # EXAM_TERMINATED | INTERVIEW_SCHEDULED | INTERVIEW_COMPLETED | SHORTLISTED | HIRED | REJECTED
    matchScore = models.IntegerField(default=0)
    preScreenPassed = models.BooleanField(default=False)
    rejectReason = models.TextField(null=True, blank=True)
    knockoutAnswers = models.TextField(null=True, blank=True)  # JSON [{questionId, answer, passed}]
    examStartedAt = models.DateTimeField(null=True, blank=True)
    examCompletedAt = models.DateTimeField(null=True, blank=True)
    examScore = models.FloatField(null=True, blank=True)
    examStatus = models.CharField(max_length=20, null=True, blank=True)  # NOT_STARTED | IN_PROGRESS | PASSED | FAILED | TERMINATED
    violationCount = models.IntegerField(default=0)
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eh_job_application"
        unique_together = [("job", "candidate")]


class ProctoringLog(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    application = models.ForeignKey(JobApplication, related_name="proctoringLogs", on_delete=models.CASCADE, db_column="applicationId")
    eventType = models.CharField(max_length=30)  # TAB_SWITCH | WINDOW_BLUR | FULLSCREEN_EXIT | COPY_PASTE | RIGHT_CLICK | FACE_MISSING | MULTI_FACE | SNAPSHOT
    details = models.TextField(null=True, blank=True)
    snapshotUrl = models.TextField(null=True, blank=True)  # base64 data URL
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "eh_proctoring_log"


class ExamAnswer(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    application = models.ForeignKey(JobApplication, related_name="examAnswers", on_delete=models.CASCADE, db_column="applicationId")
    question = models.ForeignKey(AssessmentQuestion, related_name="examAnswers", on_delete=models.CASCADE, db_column="questionId")
    answer = models.TextField(null=True, blank=True)
    isCorrect = models.BooleanField(null=True, blank=True)
    timeSpentSeconds = models.IntegerField(default=0)

    class Meta:
        db_table = "eh_exam_answer"
        unique_together = [("application", "question")]


class ExamSession(models.Model):
    """Scheduled group text exam for one job — every pre-screened candidate is
    pooled into the same session and the exam unlocks at `scheduledAt` for all
    of them, running on identical countdown windows (durationMinutes).

    The record is provisioned automatically when the job is created (symmetric
    with the Interview Setup record) with `scheduledAt=None` meaning "not
    scheduled yet": candidates may take the exam immediately, exactly like a
    job with no session at all. Scheduling happens in the Exams module."""
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    job = models.OneToOneField(JobPosting, related_name="examSession", on_delete=models.CASCADE, db_column="jobId")
    scheduledAt = models.DateTimeField(null=True, blank=True)  # None → exam not scheduled yet
    durationMinutes = models.IntegerField(default=60)             # identical window per candidate
    releaseMode = models.CharField(max_length=10, default="IMMEDIATE")  # IMMEDIATE | MANUAL
    releaseAt = models.DateTimeField(null=True, blank=True)       # designated release schedule (MANUAL)
    resultsReleasedAt = models.DateTimeField(null=True, blank=True)  # set when scores became visible
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eh_exam_session"


class InterviewSchedule(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    application = models.OneToOneField(JobApplication, related_name="interviewSchedules", on_delete=models.CASCADE, db_column="applicationId")
    scheduledTime = models.DateTimeField()
    slotDurationMinutes = models.IntegerField(null=True, blank=True)  # auto-generated slot length
    format = models.CharField(max_length=10, default="VIDEO")  # VOICE | VIDEO | ONSITE
    meetingLink = models.CharField(max_length=500, null=True, blank=True)
    interviewerName = models.CharField(max_length=200, null=True, blank=True)
    status = models.CharField(max_length=20, default="SCHEDULED")  # SCHEDULED | COMPLETED | CANCELLED
    # Recruiter live-session control (Control Panel): ACTIVE = running,
    # PAUSED = interviewer paused the session (candidate sees a hold overlay),
    # ENDED = interviewer ended the session from the panel.
    sessionState = models.CharField(max_length=10, default="ACTIVE")
    score = models.FloatField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eh_interview_schedule"


class Notification(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    user = models.ForeignKey(User, related_name="notifications", on_delete=models.CASCADE, db_column="userId")
    title = models.CharField(max_length=300)
    body = models.TextField(null=True, blank=True)
    channel = models.CharField(max_length=10, default="IN_APP")  # IN_APP | EMAIL | SMS
    read = models.BooleanField(default=False)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "eh_notification"


class NotificationLog(models.Model):
    """Outbound delivery audit trail (Resend email / SMS adapter).

    One row per decision-point notification attempt — SENT, FAILED or SKIPPED
    (skipped when the provider is not configured, e.g. RESEND_API_KEY empty).
    Gives admins a full "who was notified about what, when, how" record.
    """
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    user = models.ForeignKey(User, related_name="notificationLogs", on_delete=models.SET_NULL, null=True, blank=True, db_column="userId")
    decisionPoint = models.CharField(max_length=60)  # APPLICATION_RECEIVED | EXAM_EVALUATED | INTERVIEW_SCHEDULED | ...
    channel = models.CharField(max_length=10, default="EMAIL")  # EMAIL | SMS
    recipient = models.CharField(max_length=320)     # email address or phone number
    subject = models.CharField(max_length=300, null=True, blank=True)
    status = models.CharField(max_length=10)         # SENT | FAILED | SKIPPED
    providerId = models.CharField(max_length=160, null=True, blank=True)  # e.g. Resend email id
    error = models.TextField(null=True, blank=True)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "eh_notification_log"


class InterviewEvaluation(models.Model):
    """Structured scoring-template evaluation captured by the interviewer
    inside the live interview room and submitted at the end of the session."""
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    interview = models.OneToOneField(InterviewSchedule, related_name="evaluation", on_delete=models.CASCADE, db_column="interviewId")
    overallScore = models.FloatField(default=0)                  # 0-100
    competencyScores = models.TextField(null=True, blank=True)   # JSON [{key, label, score(1-5)}]
    questionRatings = models.TextField(null=True, blank=True)    # JSON [{questionId, score(1-5), note}]
    comments = models.TextField(null=True, blank=True)
    submittedBy = models.CharField(max_length=320, null=True, blank=True)
    releasedAt = models.DateTimeField(null=True, blank=True)     # when the result became visible to the candidate
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eh_interview_evaluation"


class AuditLog(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    actorEmail = models.CharField(max_length=320, null=True, blank=True)
    action = models.CharField(max_length=80)
    entity = models.CharField(max_length=300, null=True, blank=True)
    details = models.TextField(null=True, blank=True)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "eh_audit_log"


class PlatformSetting(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=gen_id, editable=False)
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField()
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eh_platform_setting"
