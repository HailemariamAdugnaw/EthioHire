"""
EthioHire — JSON serializers producing the exact shapes the original
Prisma-backed API returned (camelCase scalars, ISO-8601 UTC datetimes with
milliseconds, floats rendered as JS numbers).
"""
from .models import (
    AssessmentQuestion,
    AuditLog,
    CandidateProfile,
    CompanyProfile,
    Document,
    EvalTemplate,
    ExamAnswer,
    ExamSession,
    InterviewBank,
    InterviewBankQuestion,
    InterviewQuestion,
    InterviewSchedule,
    JobApplication,
    JobPosting,
    KnockoutQuestion,
    Notification,
    PlatformSetting,
    ProctoringLog,
    ReferenceContact,
    ScoringTemplate,
    User,
)
from .common import jsnum

_UNSET = object()

DEFAULT_INTERVIEW_COMPETENCIES = [
    {"key": "communication", "label": "Communication"},
    {"key": "technical", "label": "Technical depth"},
    {"key": "problem_solving", "label": "Problem solving"},
    {"key": "culture", "label": "Culture fit"},
]


def iso_z(dt) -> str | None:
    """Prisma-style ISO string: 2024-05-01T12:34:56.789Z"""
    if dt is None:
        return None
    import datetime as _dt

    if dt.tzinfo is not None:
        dt = dt.astimezone(_dt.timezone.utc).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "passwordHash": u.passwordHash,
        "firebaseUid": u.firebaseUid,
        "name": u.name,
        "role": u.role,
        "phone": u.phone,
        "createdAt": iso_z(u.createdAt),
        "updatedAt": iso_z(u.updatedAt),
    }


def user_public_dict(u: User) -> dict:
    """The { id, email, name, role } shape used by auth responses."""
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role}


def company_dict(c: CompanyProfile) -> dict:
    return {
        "id": c.id,
        "userId": c.userId_id,
        "companyName": c.companyName,
        "industry": c.industry,
        "website": c.website,
        "location": c.location,
        "description": c.description,
        "verificationStatus": c.verificationStatus,
        "subscriptionPlan": c.subscriptionPlan,
        "createdAt": iso_z(c.createdAt),
        "updatedAt": iso_z(c.updatedAt),
    }


def candidate_dict(p: CandidateProfile) -> dict:
    return {
        "id": p.id,
        "userId": p.userId_id,
        "fullName": p.fullName,
        "phone": p.phone,
        "universityName": p.universityName,
        "degreeLevel": p.degreeLevel,
        "fieldOfStudy": p.fieldOfStudy,
        "graduationYear": p.graduationYear,
        "gpa": jsnum(p.gpa),
        "expectedSalary": jsnum(p.expectedSalary),
        "experienceYears": p.experienceYears,
        "skills": p.skills,
        "about": p.about,
        "cvUrl": p.cvUrl,
    }


def document_dict(d: Document) -> dict:
    return {
        "id": d.id,
        "candidateId": d.candidate_id,
        "type": d.type,
        "name": d.name,
        "fileUrl": d.fileUrl,
        "verified": d.verified,
        "createdAt": iso_z(d.createdAt),
    }


def reference_dict(r: ReferenceContact) -> dict:
    return {
        "id": r.id,
        "candidateId": r.candidate_id,
        "name": r.name,
        "title": r.title,
        "company": r.company,
        "email": r.email,
        "phone": r.phone,
        "surveyStatus": r.surveyStatus,
        "createdAt": iso_z(r.createdAt),
    }


def job_lifecycle(j: JobPosting) -> dict:
    """Real-time application-window indicators (Feature: days tracker)."""
    import math

    from django.utils import timezone

    now = timezone.now()
    posted = j.postingStartDate or j.createdAt
    days_posted = max(0, int((now - posted).total_seconds() // 86400)) if posted and posted <= now else 0
    open_now = True
    days_remaining = None
    if j.postingStartDate and now < j.postingStartDate:
        open_now = False
    if j.applicationDeadline:
        left = (j.applicationDeadline - now).total_seconds()
        days_remaining = max(0, int(math.ceil(left / 86400)))
        if left <= 0:
            open_now = False
    return {
        "postingStartDate": iso_z(j.postingStartDate),
        "applicationDeadline": iso_z(j.applicationDeadline),
        "daysPosted": days_posted,
        "daysRemaining": days_remaining,
        "applicationOpen": open_now and j.status == "OPEN",
    }


def job_dict(j: JobPosting) -> dict:
    return {
        "id": j.id,
        "companyId": j.company_id,
        "title": j.title,
        "description": j.description,
        "roleDescription": j.roleDescription,
        "educationRequirement": j.educationRequirement,
        "category": j.category,
        "location": j.location,
        "jobType": j.jobType,
        "minExperienceYears": j.minExperienceYears,
        "minGpa": jsnum(j.minGpa),
        "targetGradYearStart": j.targetGradYearStart,
        "targetGradYearEnd": j.targetGradYearEnd,
        "salaryBudgetMin": jsnum(j.salaryBudgetMin),
        "salaryBudgetMax": jsnum(j.salaryBudgetMax),
        "examPassMark": j.examPassMark,
        "maxViolations": j.maxViolations,
        "interviewQuestionVisibility": j.interviewQuestionVisibility,
        "interviewResultRelease": j.interviewResultRelease,
        "interviewResultsReleaseAt": iso_z(j.interviewResultsReleaseAt),
        "bankId": j.bank_id,
        "evalTemplateId": j.evalTemplate_id,
        "status": j.status,
        "createdAt": iso_z(j.createdAt),
        "updatedAt": iso_z(j.updatedAt),
        **job_lifecycle(j),
    }


def interview_question_dict(q: InterviewQuestion | InterviewBankQuestion, include_text: bool = True) -> dict:
    """Live-interview question — works for both the job-scoped legacy rows
    (jobId) and the standalone bank questions (bankId). Candidate payloads may
    mask the text (visibility SINGLE) — ids and count stay so the room can
    stay in sync. visibleToCandidate drives the granular per-question toggle
    on top of the job-wide SINGLE/ALL/HIDDEN mode."""
    data = {
        "id": q.id,
        "questionText": q.questionText if include_text else None,
        "guidance": q.guidance,
        "visibleToCandidate": bool(q.visibleToCandidate),
        "order": q.order,
    }
    if getattr(q, "job_id", None):
        data["jobId"] = q.job_id
    if getattr(q, "bank_id", None):
        data["bankId"] = q.bank_id
    return data


def scoring_template_dict(t: ScoringTemplate | None) -> dict:
    """Effective interview scoring template. None → historical defaults so
    the room renders the same competencies as before this feature.
    Competencies carry a `weight` (1-10, default 1) used by the weighted
    overall-score auto-sum."""
    import json as _json

    def _weighted(c: dict, i: int) -> dict:
        try:
            w = max(1, min(10, int(c.get("weight") or 1)))
        except (TypeError, ValueError):
            w = 1
        return {
            "key": str(c.get("key") or f"c{i + 1}"),
            "label": str(c.get("label") or f"Competency {i + 1}"),
            "weight": w,
        }

    if t is None:
        return {
            "configured": False,
            "competencies": [_weighted(c, i) for i, c in enumerate(DEFAULT_INTERVIEW_COMPETENCIES)],
            "scaleMax": 5,
            "rateQuestions": True,
            "instructions": None,
        }
    try:
        comps = _json.loads(t.competencies) if t.competencies else []
    except Exception:  # noqa: BLE001
        comps = []
    if not isinstance(comps, list) or not comps:
        comps = [dict(c) for c in DEFAULT_INTERVIEW_COMPETENCIES]
    return {
        "configured": True,
        "competencies": [
            _weighted(c, i)
            for i, c in enumerate(comps)
            if isinstance(c, dict)
        ] or [_weighted(c, i) for i, c in enumerate(DEFAULT_INTERVIEW_COMPETENCIES)],
        "scaleMax": max(1, min(10, t.scaleMax or 5)),
        "rateQuestions": bool(t.rateQuestions),
        "instructions": t.instructions,
    }


def eval_template_dict(t: EvalTemplate, with_name: bool = True) -> dict:
    """Standalone evaluation template (company-owned reusable resource).
    Shape matches scoring_template_dict plus id/name so the job editor and
    the Interview Setup module share one rendering path."""
    import json as _json

    try:
        comps = _json.loads(t.competencies) if t.competencies else []
    except Exception:  # noqa: BLE001
        comps = []
    if not isinstance(comps, list):
        comps = []
    out = scoring_template_dict(None)  # defaults as the base shape
    out.update({
        "configured": True,
        "competencies": [
            {
                "key": str(c.get("key") or f"c{i + 1}"),
                "label": str(c.get("label") or f"Competency {i + 1}"),
                "weight": max(1, min(10, int(c.get("weight") or 1))) if str(c.get("weight") or "1").isdigit() else 1,
            }
            for i, c in enumerate(comps)
            if isinstance(c, dict)
        ],
        "scaleMax": max(1, min(10, t.scaleMax or 5)),
        "rateQuestions": bool(t.rateQuestions),
        "instructions": t.instructions,
    })
    if with_name:
        out["id"] = t.id
        out["name"] = t.name
    return out


def interview_bank_dict(b: InterviewBank, detail: bool = False) -> dict:
    """Standalone interview question bank. `detail` adds the question rows."""
    data = {
        "id": b.id,
        "name": b.name,
        "description": b.description,
        "questionCount": b.questions.count(),
        "linkedJobs": [
            {"id": j.id, "title": j.title, "status": j.status} for j in b.jobs.all()
        ],
        "createdAt": iso_z(b.createdAt),
        "updatedAt": iso_z(b.updatedAt),
    }
    if detail:
        data["questions"] = [
            {
                "id": q.id,
                "questionText": q.questionText,
                "guidance": q.guidance,
                "visibleToCandidate": bool(q.visibleToCandidate),
                "order": q.order,
            }
            for q in b.questions.all().order_by("order")
        ]
    return data


def knockout_dict(k: KnockoutQuestion) -> dict:
    return {
        "id": k.id,
        "jobId": k.job_id,
        "questionText": k.questionText,
        "requiredAnswer": k.requiredAnswer,
        "order": k.order,
    }


def assessment_question_dict(q: AssessmentQuestion, parse_options: bool = False):
    options = q.options
    if parse_options and options:
        import json as _json

        try:
            options = _json.loads(options)
        except Exception:  # noqa: BLE001
            options = None
    return {
        "id": q.id,
        "jobId": q.job_id,
        "questionText": q.questionText,
        "questionType": q.questionType,
        "options": options,
        "correctAnswer": q.correctAnswer,
        "timeLimitSeconds": q.timeLimitSeconds,
        "order": q.order,
    }


def exam_session_dict(s: ExamSession, for_recruiter: bool = True) -> dict:
    """Scheduled group-exam settings. Candidates get a reduced shape."""
    data = {
        "id": s.id,
        "jobId": s.job_id,
        "scheduledAt": iso_z(s.scheduledAt),
        "durationMinutes": s.durationMinutes,
        "releaseMode": s.releaseMode,
    }
    if for_recruiter:
        data["releaseAt"] = iso_z(s.releaseAt)
        data["resultsReleasedAt"] = iso_z(s.resultsReleasedAt)
        data["createdAt"] = iso_z(s.createdAt)
        data["updatedAt"] = iso_z(s.updatedAt)
    return data


def session_window_end(s: ExamSession):
    import datetime as _dt

    if s.scheduledAt is None:
        return None
    return s.scheduledAt + _dt.timedelta(minutes=s.durationMinutes)


def application_dict(a: JobApplication, session: ExamSession | None = _UNSET) -> dict:
    """Application JSON. `session` is the job's ExamSession when preloaded;
    pass None to skip the lookup. Pre-screened candidates of a scheduled-exam
    job are presented as EXAM_SCHEDULED (single pooled session) until they start."""
    if session is _UNSET:
        session = ExamSession.objects.filter(job_id=a.job_id).first()

    status_val = a.status
    if (
        session is not None
        and session.scheduledAt is not None  # provisioned-but-unscheduled ≠ scheduled
        and a.preScreenPassed
        and (a.examStatus or "NOT_STARTED") in ("", "NOT_STARTED")
        and a.status not in ("REJECTED", "PRE_SCREEN_REJECTED")
    ):
        status_val = "EXAM_SCHEDULED"

    data = {
        "id": a.id,
        "jobId": a.job_id,
        "candidateId": a.candidate_id,
        "status": status_val,
        "matchScore": a.matchScore,
        "preScreenPassed": a.preScreenPassed,
        "rejectReason": a.rejectReason,
        "knockoutAnswers": a.knockoutAnswers,
        "examStartedAt": iso_z(a.examStartedAt),
        "examCompletedAt": iso_z(a.examCompletedAt),
        "examScore": jsnum(a.examScore),
        "examStatus": a.examStatus,
        "violationCount": a.violationCount,
        "createdAt": iso_z(a.createdAt),
        "updatedAt": iso_z(a.updatedAt),
    }
    if session is not None:
        data["examSession"] = exam_session_dict(session)
    else:
        data["examSession"] = None
    return data


def mask_application_for_candidate(data: dict, a: JobApplication, session: ExamSession | None = None) -> dict:
    """Configurable result visibility: in MANUAL release mode the candidate
    cannot see score/pass-fail until the recruiter (or the release schedule)
    publishes results."""
    from .examsched import is_released

    if session is None:
        session = ExamSession.objects.filter(job_id=a.job_id).first()
    if (
        session is not None
        and session.releaseMode == "MANUAL"
        and not is_released(session)
        and (a.examStatus or "") in ("PASSED", "FAILED", "TERMINATED")
    ):
        data = dict(data)
        data["status"] = "EXAM_SUBMITTED"
        data["examStatus"] = None
        data["examScore"] = None
    return data


def proctoring_log_dict(p: ProctoringLog) -> dict:
    return {
        "id": p.id,
        "applicationId": p.application_id,
        "eventType": p.eventType,
        "details": p.details,
        "snapshotUrl": p.snapshotUrl,
        "createdAt": iso_z(p.createdAt),
    }


def exam_answer_dict(e: ExamAnswer) -> dict:
    return {
        "id": e.id,
        "applicationId": e.application_id,
        "questionId": e.question_id,
        "answer": e.answer,
        "isCorrect": e.isCorrect,
        "timeSpentSeconds": e.timeSpentSeconds,
    }


def interview_dict(i: InterviewSchedule) -> dict:
    import datetime as _dt

    end_iso = None
    if i.slotDurationMinutes:
        end_iso = iso_z(i.scheduledTime + _dt.timedelta(minutes=i.slotDurationMinutes))
    return {
        "id": i.id,
        "applicationId": i.application_id,
        "scheduledTime": iso_z(i.scheduledTime),
        "slotDurationMinutes": i.slotDurationMinutes,
        "endTime": end_iso,
        "format": i.format,
        "meetingLink": i.meetingLink,
        "interviewerName": i.interviewerName,
        "status": i.status,
        "sessionState": i.sessionState or "ACTIVE",
        "score": jsnum(i.score),
        "notes": i.notes,
        "createdAt": iso_z(i.createdAt),
        "updatedAt": iso_z(i.updatedAt),
    }


def notification_dict(n: Notification) -> dict:
    return {
        "id": n.id,
        "userId": n.user_id,
        "title": n.title,
        "body": n.body,
        "channel": n.channel,
        "read": n.read,
        "createdAt": iso_z(n.createdAt),
    }


def audit_log_dict(a: AuditLog) -> dict:
    return {
        "id": a.id,
        "actorEmail": a.actorEmail,
        "action": a.action,
        "entity": a.entity,
        "details": a.details,
        "createdAt": iso_z(a.createdAt),
    }


def platform_setting_dict(s: PlatformSetting) -> dict:
    return {
        "id": s.id,
        "key": s.key,
        "value": s.value,
        "updatedAt": iso_z(s.updatedAt),
    }
