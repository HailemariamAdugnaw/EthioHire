"""EthioHire — job posting endpoints (port of src/app/api/jobs/*) + the
scheduled exam-session endpoints (Feature: Scheduled Text Exam Engine)."""
import json as _json

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.response import Response

from ..common import ApiError, audit, js_locale_datetime, notify, parse_client_dt, view
from ..categories import validate_category
from ..ehauth import get_session_user, require_role
from ..examsched import do_release, is_released, release_if_due, scheduling_notice, window_end
from ..matching import pre_screen
from ..notifications import report_application_received
from ..sanitize import clean_html
from ..models import (
    AssessmentQuestion,
    CandidateProfile,
    CompanyProfile,
    EvalTemplate,
    ExamSession,
    InterviewBank,
    InterviewBankQuestion,
    InterviewEvaluation,
    InterviewQuestion,
    InterviewSchedule,
    JobApplication,
    JobPosting,
    KnockoutQuestion,
    ScoringTemplate,
)
from ..questions import normalize_assessment_question
from ..serializers import (
    DEFAULT_INTERVIEW_COMPETENCIES,
    application_dict,
    assessment_question_dict,
    eval_template_dict,
    exam_session_dict,
    interview_bank_dict,
    interview_question_dict,
    iso_z,
    job_dict,
    knockout_dict,
    scoring_template_dict,
)


def _company_of(session_id: str):
    return CompanyProfile.objects.filter(userId_id=session_id).first()


DEFAULT_COMPETENCY_WEIGHT = 1


def _competencies_from_body(raw, with_weights: bool = True) -> list[dict]:
    """Normalize a client-supplied competency list. Weights (1-10) are part of
    the weighted-scoring schema — a competency weighting core technical depth
    above soft skills, for example."""
    comps = []
    for i, c in enumerate(raw or []):
        if not isinstance(c, dict):
            continue
        label = str(c.get("label") or "").strip()
        if not label:
            continue
        comp = {"key": str(c.get("key") or f"c{i + 1}")[:60], "label": label[:120]}
        if with_weights:
            try:
                comp["weight"] = max(1, min(10, int(c.get("weight") or DEFAULT_COMPETENCY_WEIGHT)))
            except (TypeError, ValueError):
                comp["weight"] = DEFAULT_COMPETENCY_WEIGHT
        comps.append(comp)
    return comps


def _save_interview_config(job: JobPosting, body: dict, company_defaults: bool = True) -> None:
    """Create/update the job's live-interview configuration.

    Standalone resources first: `bankId` / `templateId` link a reusable
    company-owned InterviewBank / EvalTemplate to the job (managed in the
    Interview Setup module, independent of the job editor).

    Inline fallback: `interviewQuestions` / `scoringTemplate` bodies are
    promoted into a job-linked bank/template — the pre-existing API shape so
    older clients and tests keep working, now materialized as standalone
    resources owned by the job's company.

    Job-level settings (candidate question visibility, result release mode
    and the optional release schedule) always live on the job itself."""
    dirty = []
    if "interviewQuestionVisibility" in body:
        val = str(body.get("interviewQuestionVisibility") or "SINGLE").upper()
        job.interviewQuestionVisibility = val if val in ("SINGLE", "ALL", "HIDDEN") else "SINGLE"
        dirty.append("interviewQuestionVisibility")
    if "interviewResultRelease" in body:
        val = str(body.get("interviewResultRelease") or "IMMEDIATE").upper()
        job.interviewResultRelease = val if val in ("IMMEDIATE", "AFTER_ALL", "MANUAL") else "IMMEDIATE"
        dirty.append("interviewResultRelease")
    if "interviewResultsReleaseAt" in body:
        # Scheduled manual release — the recruiter sets date & time once and
        # every held result publishes automatically at that moment (lazy
        # server-side check on read, see eh/interviewsched.py).
        job.interviewResultsReleaseAt = parse_client_dt(body.get("interviewResultsReleaseAt"))
        if body.get("interviewResultsReleaseAt") in (None, ""):
            job.interviewResultsReleaseAt = None
        dirty.append("interviewResultsReleaseAt")
    if dirty:
        job.save(update_fields=dirty + ["updatedAt"])

    company = job.company

    # --- link standalone resources (validated ownership) ---------------------
    if "bankId" in body:
        bank_id = body.get("bankId")
        if bank_id in (None, ""):
            job.bank = None
            job.save(update_fields=["bank", "updatedAt"])
        else:
            bank = InterviewBank.objects.filter(id=bank_id, company=company).first()
            if not bank:
                raise ApiError(400, "The selected question bank does not exist in your company's library.")
            job.bank = bank
            job.save(update_fields=["bank", "updatedAt"])
    if "templateId" in body:
        tpl_id = body.get("templateId")
        if tpl_id in (None, ""):
            job.evalTemplate = None
            job.save(update_fields=["evalTemplate", "updatedAt"])
        else:
            tpl = EvalTemplate.objects.filter(id=tpl_id, company=company).first()
            if not tpl:
                raise ApiError(400, "The selected evaluation template does not exist in your company's library.")
            job.evalTemplate = tpl
            job.save(update_fields=["evalTemplate", "updatedAt"])

    # --- inline questions → standalone bank (promoted + linked) --------------
    if "interviewQuestions" in body and body.get("bankId") in (None, ""):
        questions = [q for q in (body.get("interviewQuestions") or []) if isinstance(q, dict) and str(q.get("questionText") or "").strip()]
        if questions:
            bank = job.bank
            if bank is None or bank.company_id != company.id:
                bank = InterviewBank.objects.create(company=company, name=f"{job.title} — question bank")
                job.bank = bank
                job.save(update_fields=["bank", "updatedAt"])
            bank.questions.all().delete()
            for i, q in enumerate(questions):
                InterviewBankQuestion.objects.create(
                    bank=bank,
                    questionText=str(q.get("questionText") or "").strip()[:5000],
                    guidance=(str(q.get("guidance") or "").strip()[:2000] or None),
                    # Granular per-question visibility — recruiters toggle each
                    # question (or bulk-toggle all) independently of the job-wide
                    # SINGLE/ALL/HIDDEN mode. Missing key keeps the question visible.
                    visibleToCandidate=bool(q.get("visibleToCandidate", True)),
                    order=i + 1,
                )
        # Also mirror into the legacy job-scoped table so the room payload
        # stays identical for jobs without a linked bank.
        job.interviewQuestions.all().delete()
        for i, q in enumerate(questions):
            InterviewQuestion.objects.create(
                job=job,
                questionText=str(q.get("questionText") or "").strip()[:5000],
                guidance=(str(q.get("guidance") or "").strip()[:2000] or None),
                visibleToCandidate=bool(q.get("visibleToCandidate", True)),
                order=i + 1,
            )

    # --- inline scoring template → standalone EvalTemplate (promoted) --------
    if "scoringTemplate" in body and body.get("templateId") in (None, ""):
        st_body = body.get("scoringTemplate")
        if isinstance(st_body, dict) and st_body.get("competencies") is not None:
            import json as _json

            comps = _competencies_from_body(st_body.get("competencies"), with_weights=True)
            try:
                scale = max(1, min(10, int(st_body.get("scaleMax") or 5)))
            except (TypeError, ValueError):
                scale = 5
            if comps:
                tpl = job.evalTemplate
                if tpl is None or tpl.company_id != company.id:
                    tpl = EvalTemplate.objects.create(company=company, name=f"{job.title} — evaluation template")
                    job.evalTemplate = tpl
                    job.save(update_fields=["evalTemplate", "updatedAt"])
                tpl.competencies = _json.dumps(comps)
                tpl.scaleMax = scale
                tpl.rateQuestions = bool(st_body.get("rateQuestions", True))
                tpl.instructions = str(st_body.get("instructions") or "").strip()[:2000] or None
                tpl.save()
            # Mirror into the legacy job-scoped row for identical legacy reads.
            ScoringTemplate.objects.update_or_create(
                job=job,
                defaults={
                    "competencies": _json.dumps(comps),
                    "scaleMax": scale,
                    "rateQuestions": bool(st_body.get("rateQuestions", True)),
                    "instructions": str(st_body.get("instructions") or "").strip()[:2000] or None,
                },
            )


def effective_bank_questions(job: JobPosting):
    """The question set interviewers ask for this job: the linked standalone
    bank when one is attached, otherwise the legacy job-scoped rows."""
    if job.bank_id:
        return list(
            job.bank.questions.all().order_by("order")
        )
    return list(job.interviewQuestions.all().order_by("order"))


def effective_eval_template(job: JobPosting):
    """The scoring template for this job: linked standalone template first,
    then the legacy job-scoped row, otherwise None (API synthesizes defaults)."""
    if job.evalTemplate_id:
        return job.evalTemplate
    return ScoringTemplate.objects.filter(job=job).first()


def ensure_module_records(job: JobPosting, actor_email: str = "system") -> None:
    """Symmetric module provisioning on job creation — every new job instantly
    owns BOTH module records so their links are generated and accessible
    without any extra setup step:

      1. Exams record — an ExamSession in the "not scheduled yet" state
         (scheduledAt=None; candidates see no difference, scheduling happens
         in the Exams module).
      2. Interview Setup record — a default company-owned question bank and
         evaluation template linked to the job (skipped when the create
         request already linked/promoted resources).

    Called by POST /api/jobs right after _save_interview_config."""
    company = job.company

    # --- 1. exam record (unscheduled pool) -----------------------------------
    session, es_created = ExamSession.objects.get_or_create(
        job=job,
        defaults={"scheduledAt": None, "durationMinutes": 60, "releaseMode": "IMMEDIATE"},
    )

    # --- 2. default interview resources -------------------------------------
    bank_created = tpl_created = False
    if job.bank_id is None:
        job.bank = InterviewBank.objects.create(
            company=company,
            name=f"{job.title} — question bank",
            description=f"Default interview question bank provisioned with the job “{job.title}”. Add questions here or link another library bank.",
        )
        job.save(update_fields=["bank", "updatedAt"])
        bank_created = True
    if job.evalTemplate_id is None:
        job.evalTemplate = EvalTemplate.objects.create(
            company=company,
            name=f"{job.title} — evaluation template",
            competencies=_json.dumps([dict(c) for c in DEFAULT_INTERVIEW_COMPETENCIES]),
            scaleMax=5,
            rateQuestions=True,
            instructions=None,
        )
        job.save(update_fields=["evalTemplate", "updatedAt"])
        tpl_created = True

    if es_created or bank_created or tpl_created:
        audit(
            actor_email,
            "JOB_MODULES_PROVISIONED",
            f"JobPosting:{job.title}",
            "exam record + default interview bank/template provisioned",
        )


def _job_detail_payload(job: JobPosting, session: dict | None) -> dict:
    """Job detail JSON — recruiters/admins additionally receive the interview
    configuration (linked bank/template + effective question rows + effective
    scoring template) for the job editor."""
    data = job_dict(job)
    data["company"] = {
        "companyName": job.company.companyName,
        "verificationStatus": job.company.verificationStatus,
        "industry": job.company.industry,
        "location": job.company.location,
    }
    data["knockoutQuestions"] = [
        knockout_dict(k) for k in job.knockoutQuestions.all().order_by("order")
    ]
    data["_count"] = {"applications": job.applications.count()}
    if session and session.get("role") in ("RECRUITER", "ADMIN"):
        data["interviewQuestions"] = [
            interview_question_dict(q) for q in effective_bank_questions(job)
        ]
        eff_tpl = effective_eval_template(job)
        if eff_tpl is None:
            data["scoringTemplate"] = scoring_template_dict(None)
        elif isinstance(eff_tpl, EvalTemplate):
            data["scoringTemplate"] = eval_template_dict(eff_tpl, with_name=True)
        else:
            data["scoringTemplate"] = scoring_template_dict(eff_tpl)
        # Library summaries for the job-editor pickers (standalone resources).
        if job.bank:
            data["linkedBank"] = {
                "id": job.bank.id,
                "name": job.bank.name,
                "questionCount": job.bank.questions.count(),
            }
        if job.evalTemplate:
            data["linkedTemplate"] = {
                "id": job.evalTemplate.id,
                "name": job.evalTemplate.name,
            }
    return data


def _require_window(body: dict, partial: bool = False):
    """Validate the mandatory posting window dates (Feature: date range controls).
    Returns (postingStartDate, applicationDeadline) as aware datetimes.
    In partial mode (PUT) missing keys mean 'leave unchanged' (None, None)."""
    start = parse_client_dt(body.get("postingStartDate"))
    deadline = parse_client_dt(body.get("applicationDeadline"))
    if not partial:
        if start is None:
            raise ApiError(400, "Posting start date is required.")
        if deadline is None:
            raise ApiError(400, "Application deadline date is required.")
    elif "postingStartDate" in body and start is None and body.get("postingStartDate") not in (None, ""):
        raise ApiError(400, "Posting start date is invalid.")
    elif "applicationDeadline" in body and deadline is None and body.get("applicationDeadline") not in (None, ""):
        raise ApiError(400, "Application deadline date is invalid.")
    if start and deadline and deadline <= start:
        raise ApiError(400, "Application deadline must be after the posting start date.")
    return start, deadline


@view(["GET", "POST"])
def jobs_view(request):
    if request.method == "GET":
        session = get_session_user(request)
        qp = request.query_params
        q = (qp.get("q") or "").strip()
        category = qp.get("category")
        location = qp.get("location")
        job_type = qp.get("jobType")
        mine = qp.get("mine")

        qs = JobPosting.objects.all()
        if mine == "1" and session and session["role"] == "RECRUITER":
            company = _company_of(session["id"])
            if company is not None:
                qs = qs.filter(company=company)
        else:
            qs = qs.filter(status="OPEN")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q))
        if category:
            qs = qs.filter(category=category)
        if location:
            qs = qs.filter(location__icontains=location)
        if job_type:
            qs = qs.filter(jobType=job_type)

        jobs = qs.order_by("-createdAt").select_related("company").annotate(
            _apps=Count("applications")
        )

        my_application_map = {}
        if session and session["role"] == "CANDIDATE":
            profile = CandidateProfile.objects.filter(userId_id=session["id"]).first()
            if profile:
                for app in JobApplication.objects.filter(candidate=profile):
                    my_application_map[app.job_id] = app.id

        out = []
        for j in jobs:
            data = job_dict(j)
            data["company"] = {
                "companyName": j.company.companyName,
                "verificationStatus": j.company.verificationStatus,
                "industry": j.company.industry,
            }
            data["_count"] = {"applications": j._apps}
            data["myApplicationId"] = my_application_map.get(j.id)
            out.append(data)
        return Response({"jobs": out})

    # POST — create (RECRUITER)
    session = require_role(request, "RECRUITER")
    body = request.data if isinstance(request.data, dict) else {}
    company = _company_of(session["id"])
    if not company:
        raise ApiError(400, "Company profile missing.")
    if company.verificationStatus != "APPROVED":
        raise ApiError(403, "Your company account must be verified by the platform admin before posting jobs.")
    if not body.get("title") or not body.get("description"):
        raise ApiError(400, "Job title and description are required.")

    def int_or(v, default):
        try:
            n = int(str(v))
            return n
        except (TypeError, ValueError):
            return default

    def float_or_null(v):
        if v is None or v == "":
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    status_val = body.get("status") if body.get("status") in ("DRAFT", "OPEN", "CLOSED") else "OPEN"
    start, deadline = _require_window(body, partial=False)
    # Standardized category dropdown — every write is validated against the
    # exact 42-category list (free text caused inconsistent naming).
    category = validate_category(body.get("category"))
    job = JobPosting.objects.create(
        company=company,
        title=body.get("title"),
        # Rich-text fields (WYSIWYG HTML) — sanitized server-side with a
        # strict allowlist before anything is stored.
        description=clean_html(body.get("description")) or "",
        roleDescription=clean_html(body.get("roleDescription")),
        educationRequirement=clean_html(body.get("educationRequirement")),
        category=category,
        location=body.get("location"),
        jobType=body.get("jobType") or "FULL_TIME",
        minExperienceYears=int_or(body.get("minExperienceYears"), 0) or 0,
        minGpa=float_or_null(body.get("minGpa")),
        targetGradYearStart=int_or(body.get("targetGradYearStart"), 0) or None,
        targetGradYearEnd=int_or(body.get("targetGradYearEnd"), 0) or None,
        salaryBudgetMin=float_or_null(body.get("salaryBudgetMin")),
        salaryBudgetMax=float_or_null(body.get("salaryBudgetMax")),
        examPassMark=int_or(body.get("examPassMark"), 60) or 60,
        maxViolations=int_or(body.get("maxViolations"), 3) or 3,
        postingStartDate=start,
        applicationDeadline=deadline,
        status=status_val,
    )

    knockouts = body.get("knockoutQuestions") or []
    for i, k in enumerate(knockouts):
        text = str(k.get("questionText") or "").strip()
        if not text:
            continue
        KnockoutQuestion.objects.create(
            job=job,
            questionText=text,
            requiredAnswer=(str(k.get("requiredAnswer") or "YES")).upper(),
            order=i + 1,
        )

    assessments = body.get("assessmentQuestions") or []
    for i, aq in enumerate(assessments):
        norm = normalize_assessment_question(aq, i + 1)
        AssessmentQuestion.objects.create(job=job, **norm)

    _save_interview_config(job, body)
    # Symmetric module provisioning — the Exams record (unscheduled pool) and
    # the default Interview Setup record (bank + evaluation template) exist
    # the moment the job is created, so both module links are instantly
    # generated and accessible.
    ensure_module_records(job, actor_email=session["email"])

    audit(
        session["email"], "JOB_CREATED", f"JobPosting:{job.title}",
        f"{len(assessments)} assessment questions",
    )

    data = job_dict(job)
    data["knockoutQuestions"] = [knockout_dict(k) for k in job.knockoutQuestions.all().order_by("order")]
    data["assessmentQuestions"] = [
        assessment_question_dict(q) for q in job.assessmentQuestions.all().order_by("order")
    ]
    data["interviewQuestions"] = [
        interview_question_dict(q) for q in effective_bank_questions(job)
    ]
    eff_tpl = effective_eval_template(job)
    if eff_tpl is None:
        data["scoringTemplate"] = scoring_template_dict(None)
    elif isinstance(eff_tpl, EvalTemplate):
        data["scoringTemplate"] = eval_template_dict(eff_tpl)
    else:
        data["scoringTemplate"] = scoring_template_dict(eff_tpl)
    return Response({"job": data})


@view(["GET", "PUT", "DELETE"])
def job_detail_view(request, job_id: str):
    job = JobPosting.objects.filter(id=job_id).first()

    if request.method == "GET":
        session = get_session_user(request)
        if not job:
            raise ApiError(404, "Job not found.")
        data = _job_detail_payload(job, session)

        my_application = None
        questions = None
        if session and session["role"] == "CANDIDATE":
            profile = CandidateProfile.objects.filter(userId_id=session["id"]).first()
            if profile:
                app = JobApplication.objects.filter(job=job, candidate=profile).first()
                if app:
                    my_application = application_dict(app)
        elif session and session["role"] in ("RECRUITER", "ADMIN"):
            questions = [
                assessment_question_dict(q) for q in job.assessmentQuestions.all().order_by("order")
            ]

        return Response({"job": data, "myApplication": my_application, "questions": questions})

    if request.method == "PUT":
        session = require_role(request, "RECRUITER")
        body = request.data if isinstance(request.data, dict) else {}
        company = _company_of(session["id"])
        if not company:
            raise ApiError(400, "Company profile missing.")
        if not job or job.company_id != company.id:
            raise ApiError(404, "Job not found.")

        def int_or(v, default):
            try:
                return int(str(v))
            except (TypeError, ValueError):
                return default

        def float_or_null(v):
            if v is None or v == "":
                return None
            try:
                return float(v)
            except (TypeError, ValueError):
                return None

        if "title" in body:
            job.title = body["title"]
        if "description" in body:
            job.description = clean_html(body.get("description")) or ""
        if "roleDescription" in body:
            job.roleDescription = clean_html(body.get("roleDescription"))
        if "educationRequirement" in body:
            job.educationRequirement = clean_html(body.get("educationRequirement"))
        if "category" in body:
            job.category = validate_category(body.get("category"))
        if "location" in body:
            job.location = body["location"]
        if "jobType" in body:
            job.jobType = body["jobType"]
        if "status" in body:
            job.status = body["status"]
        start, deadline = _require_window(body, partial=True)
        if "postingStartDate" in body:
            job.postingStartDate = start
        if "applicationDeadline" in body:
            job.applicationDeadline = deadline
        job.minExperienceYears = int_or(body.get("minExperienceYears"), 0) or 0
        job.minGpa = float_or_null(body.get("minGpa"))
        job.targetGradYearStart = int_or(body.get("targetGradYearStart"), 0) or None
        job.targetGradYearEnd = int_or(body.get("targetGradYearEnd"), 0) or None
        job.salaryBudgetMin = float_or_null(body.get("salaryBudgetMin"))
        job.salaryBudgetMax = float_or_null(body.get("salaryBudgetMax"))
        # Exam rules are owned by the Exams module — only overwrite them when
        # the request explicitly carries them (job-editor saves no longer do).
        if "examPassMark" in body:
            job.examPassMark = int_or(body.get("examPassMark"), 60) or 60
        if "maxViolations" in body:
            job.maxViolations = int_or(body.get("maxViolations"), 3) or 3
        job.save()

        if "knockoutQuestions" in body:
            job.knockoutQuestions.all().delete()
            for i, k in enumerate(body["knockoutQuestions"] or []):
                text = str(k.get("questionText") or "").strip()
                if not text:
                    continue
                KnockoutQuestion.objects.create(
                    job=job,
                    questionText=text,
                    requiredAnswer=(str(k.get("requiredAnswer") or "YES")).upper(),
                    order=i + 1,
                )
        if "assessmentQuestions" in body:
            job.assessmentQuestions.all().delete()
            for i, aq in enumerate(body["assessmentQuestions"] or []):
                norm = normalize_assessment_question(aq, i + 1)
                AssessmentQuestion.objects.create(job=job, **norm)

        _save_interview_config(job, body)

        audit(session["email"], "JOB_UPDATED", f"JobPosting:{job.title}")
        return Response({"job": job_dict(job)})

    # DELETE
    session = require_role(request, "RECRUITER")
    company = _company_of(session["id"])
    if not company:
        raise ApiError(400, "Company profile missing.")
    if not job or job.company_id != company.id:
        raise ApiError(404, "Job not found.")
    title = job.title
    job.delete()
    audit(session["email"], "JOB_DELETED", f"JobPosting:{title}")
    return Response({"ok": True})


@view(["POST"])
def job_apply_view(request, job_id: str):
    """Stage 1 — Application & Pre-Screening."""
    from ..common import notify

    session = require_role(request, "CANDIDATE")
    body = request.data if isinstance(request.data, dict) else {}

    job = JobPosting.objects.filter(id=job_id).select_related("company").first()
    if not job:
        raise ApiError(404, "Job not found.")
    if job.status != "OPEN":
        raise ApiError(400, "This job is no longer accepting applications.")

    # Automated expiration — reject submissions outside the posting window
    now = timezone.now()
    if job.postingStartDate and now < job.postingStartDate:
        raise ApiError(
            400,
            f"Applications are not open yet for this position \u2014 posting starts on "
            f"{js_locale_datetime(job.postingStartDate)}.",
        )
    if job.applicationDeadline and now >= job.applicationDeadline:
        raise ApiError(
            400,
            "The application deadline for this position has passed \u2014 new applications are no longer accepted.",
        )

    profile = CandidateProfile.objects.filter(userId_id=session["id"]).first()
    if not profile:
        raise ApiError(400, "Please complete your candidate profile first.")

    existing = JobApplication.objects.filter(job=job, candidate=profile).first()
    if existing:
        resp = Response(
            {"error": "You have already applied to this position.", "applicationId": existing.id},
            status=409,
        )
        return resp

    answers = body.get("knockoutAnswers") or {}
    knockout_eval = []
    for k in job.knockoutQuestions.all().order_by("order"):
        knockout_eval.append({
            "questionId": k.id,
            "answer": str(answers[k.id]).upper() if answers.get(k.id) else None,
            "requiredAnswer": k.requiredAnswer,
        })

    result = pre_screen(
        {
            "minGpa": job.minGpa,
            "targetGradYearStart": job.targetGradYearStart,
            "targetGradYearEnd": job.targetGradYearEnd,
            "minExperienceYears": job.minExperienceYears,
            "salaryBudgetMin": job.salaryBudgetMin,
            "salaryBudgetMax": job.salaryBudgetMax,
        },
        {
            "gpa": profile.gpa,
            "graduationYear": profile.graduationYear,
            "degreeLevel": profile.degreeLevel,
            "experienceYears": profile.experienceYears,
            "expectedSalary": profile.expectedSalary,
            "skills": profile.skills,
        },
        knockout_eval,
    )

    application = JobApplication.objects.create(
        job=job,
        candidate=profile,
        status="APPLIED" if result["passed"] else "PRE_SCREEN_REJECTED",
        preScreenPassed=result["passed"],
        matchScore=result["matchScore"],
        rejectReason=None if result["passed"] else " ".join(result["rejectReasons"]),
        knockoutAnswers=_json.dumps([
            {
                "questionId": k["questionId"],
                "answer": k["answer"],
                "passed": (k["answer"] or "").upper() == k["requiredAnswer"].upper(),
            }
            for k in knockout_eval
        ]),
    )

    company = job.company
    report_application_received(application, result)

    audit(
        session["email"],
        "APPLICATION_PRE_SCREEN_PASSED" if result["passed"] else "APPLICATION_PRE_SCREEN_REJECTED",
        f"JobApplication:{application.id}",
        f"Match score {result['matchScore']}",
    )

    return Response({
        "application": application_dict(application),
        "screening": {
            "passed": result["passed"],
            "matchScore": result["matchScore"],
            "rejectReasons": result["rejectReasons"],
            "checks": result["checks"],
        },
    })


@view(["GET"])
def job_questions_view(request, job_id: str):
    session = require_role(request, "RECRUITER", "ADMIN")
    job = JobPosting.objects.filter(id=job_id).select_related("company").first()
    if not job:
        raise ApiError(404, "Job not found.")
    if session["role"] == "RECRUITER" and job.company.userId_id != session["id"]:
        raise ApiError(403, "Access denied.")

    return Response({
        "job": {
            "id": job.id,
            "title": job.title,
            "status": job.status,
            "examPassMark": job.examPassMark,
            "maxViolations": job.maxViolations,
        },
        "questions": [
            assessment_question_dict(q) for q in job.assessmentQuestions.all().order_by("order")
        ],
        "knockout": [knockout_dict(k) for k in job.knockoutQuestions.all().order_by("order")],
    })


# ---------------------------------------------------------------------------
# Scheduled Text Exam Engine — session settings + result release (recruiter)
# ---------------------------------------------------------------------------

def _owned_job(request, job_id: str):
    session = require_role(request, "RECRUITER", "ADMIN")
    job = JobPosting.objects.filter(id=job_id).select_related("company").first()
    if not job:
        raise ApiError(404, "Job not found.")
    if session["role"] == "RECRUITER" and job.company.userId_id != session["id"]:
        raise ApiError(403, "Access denied.")
    return session, job


@view(["GET", "PUT"])
def exam_session_view(request, job_id: str):
    """GET: current scheduled-exam settings. PUT: create/update the pooled
    session (schedule, identical countdown window, result visibility)."""
    session, job = _owned_job(request, job_id)
    es = ExamSession.objects.filter(job=job).first()

    if request.method == "GET":
        qualified = JobApplication.objects.filter(job=job, preScreenPassed=True)
        return Response({
            "session": exam_session_dict(es) if es else None,
            "stats": {
                "qualified": qualified.count(),
                "completed": qualified.filter(examCompletedAt__isnull=False).count(),
                "released": bool(is_released(es)) if es else False,
            },
        })

    body = request.data if isinstance(request.data, dict) else {}
    scheduled_at = parse_client_dt(body.get("scheduledAt"))
    if scheduled_at is None:
        raise ApiError(400, "Exam date & time is required.")
    try:
        duration = int(str(body.get("durationMinutes") or 60))
    except (TypeError, ValueError):
        duration = 60
    duration = max(10, min(duration, 300))
    release_mode = body.get("releaseMode") if body.get("releaseMode") in ("IMMEDIATE", "MANUAL") else "IMMEDIATE"
    release_at = parse_client_dt(body.get("releaseAt"))
    if release_mode == "MANUAL" and release_at is not None and release_at <= timezone.now():
        raise ApiError(400, "The scheduled release time must be in the future.")

    es, _created = ExamSession.objects.update_or_create(
        job=job,
        defaults={
            "scheduledAt": scheduled_at,
            "durationMinutes": duration,
            "releaseMode": release_mode,
            "releaseAt": release_at if release_mode == "MANUAL" else None,
        },
    )
    audit(
        session["email"], "EXAM_SESSION_SCHEDULED", f"JobPosting:{job.title}",
        f"opens {scheduled_at.isoformat()} \u00b7 {duration} min \u00b7 results {release_mode.lower()}",
    )

    qualified = JobApplication.objects.filter(job=job, preScreenPassed=True).select_related("candidate")
    for app in qualified:
        notify(
            app.candidate.userId_id,
            f"Assessment scheduled \u2014 {job.title}",
            scheduling_notice(es),
            "EMAIL",
        )
    return Response({"session": exam_session_dict(es), "notified": qualified.count()})


@view(["POST"])
def exam_session_release_view(request, job_id: str):
    """Manual result release (Option B) — publish held scores to candidates."""
    session, job = _owned_job(request, job_id)
    es = ExamSession.objects.filter(job=job).first()
    if not es:
        raise ApiError(404, "No exam session is configured for this job.")
    if es.releaseMode != "MANUAL":
        raise ApiError(400, "This session uses immediate release \u2014 results are already visible.")
    count = do_release(es, actor_email=session["email"])
    return Response({"session": exam_session_dict(es), "released": count})


@view(["GET", "POST"])
def interview_results_release_view(request, job_id: str):
    """Interview result release for the job's AFTER_ALL / MANUAL modes.

    GET  — release status: how many evaluated interviews are held vs
           published, plus the scheduled release time (if set).
    POST — body {releaseAt: ISO} schedules an automatic release at that
           moment (recommended: set it once, every held result publishes
           without per-candidate clicks); body {} publishes every held
           interview evaluation immediately: releasedAt is stamped and each
           candidate receives their result (INTERVIEW_RESULTS_RELEASED)."""
    session, job = _owned_job(request, job_id)

    def held_evaluations():
        return InterviewEvaluation.objects.filter(
            interview__application__job=job,
            releasedAt__isnull=True,
            interview__status="COMPLETED",
        ).select_related("interview__application__candidate", "interview__application__job")

    if request.method == "GET":
        # A release schedule that has already passed publishes on read.
        from ..interviewsched import publish_due_results

        publish_due_results(job, actor_email=session["email"])
        published = InterviewEvaluation.objects.filter(
            interview__application__job=job,
            releasedAt__isnull=False,
            interview__status="COMPLETED",
        ).count()
        return Response({
            "mode": job.interviewResultRelease,
            "held": held_evaluations().count(),
            "published": published,
            "releaseAt": iso_z(job.interviewResultsReleaseAt),
            "scheduled": job.interviewResultsReleaseAt is not None
            and job.interviewResultsReleaseAt > timezone.now(),
        })

    body = request.data if isinstance(request.data, dict) else {}
    if "releaseAt" in body and body.get("releaseAt") not in (None, ""):
        # Schedule the release — date & time picker value from the recruiter.
        release_at = parse_client_dt(body.get("releaseAt"))
        if release_at is None:
            raise ApiError(400, "The scheduled release time is invalid.")
        if release_at <= timezone.now():
            raise ApiError(400, "The scheduled release time must be in the future.")
        job.interviewResultsReleaseAt = release_at
        job.save(update_fields=["interviewResultsReleaseAt", "updatedAt"])
        audit(
            session["email"], "INTERVIEW_RESULTS_SCHEDULED", f"JobPosting:{job.title}",
            f"results publish automatically at {release_at.isoformat()}",
        )
        return Response({
            "scheduled": True,
            "releaseAt": iso_z(job.interviewResultsReleaseAt),
            "held": held_evaluations().count(),
            "mode": job.interviewResultRelease,
        })

    from ..notifications import report_interview_results_released

    held = list(held_evaluations())
    now = timezone.now()
    for ev in held:
        ev.releasedAt = now
        ev.save(update_fields=["releasedAt", "updatedAt"])
        report_interview_results_released(ev.interview, ev.interview.application, {"overallScore": ev.overallScore})
    audit(
        session["email"], "INTERVIEW_RESULTS_RELEASED", f"JobPosting:{job.title}",
        f"{len(held)} interview result(s) published",
    )
    return Response({"released": len(held), "mode": job.interviewResultRelease})


# ---------------------------------------------------------------------------
# Exam management module — standalone exam configuration decoupled from the
# job editor (scheduled sessions, result visibility and the proctored
# question bank are managed here WITHOUT re-saving core job details).
# ---------------------------------------------------------------------------

@view(["GET"])
def exams_overview_view(request):
    """GET /api/exams — the recruiter's exam-management overview: one row per
    owned job with question count, rules, session state and candidate stats."""
    session = require_role(request, "RECRUITER", "ADMIN")
    qs = JobPosting.objects.all()
    if session["role"] == "RECRUITER":
        company = _company_of(session["id"])
        if company is None:
            return Response({"exams": []})
        qs = qs.filter(company=company)

    out = []
    for job in qs.select_related("company").order_by("-createdAt"):
        es = ExamSession.objects.filter(job=job).first()
        qualified = JobApplication.objects.filter(job=job, preScreenPassed=True)
        out.append({
            "jobId": job.id,
            "title": job.title,
            "category": job.category,
            "status": job.status,
            "questionCount": job.assessmentQuestions.count(),
            "examPassMark": job.examPassMark,
            "maxViolations": job.maxViolations,
            "session": exam_session_dict(es) if es else None,
            "released": bool(is_released(es)) if es else False,
            "stats": {
                "qualified": qualified.count(),
                "completed": qualified.filter(examCompletedAt__isnull=False).count(),
                "passed": qualified.filter(examStatus="PASSED").count(),
                "failed": qualified.filter(examStatus="FAILED").count(),
            },
        })
    return Response({"exams": out})


@view(["PUT"])
def exam_questions_view(request, job_id: str):
    """PUT /api/jobs/:jobId/exam-questions — replace the proctored exam
    question bank standalone (never touches core job details)."""
    session, job = _owned_job(request, job_id)
    body = request.data if isinstance(request.data, dict) else {}
    questions = body.get("questions") if isinstance(body.get("questions"), list) else []
    job.assessmentQuestions.all().delete()
    for i, aq in enumerate(questions):
        norm = normalize_assessment_question(aq, i + 1)
        AssessmentQuestion.objects.create(job=job, **norm)
    audit(
        session["email"], "EXAM_QUESTIONS_UPDATED", f"JobPosting:{job.title}",
        f"{len(questions)} question(s) via the exam module",
    )
    return Response({
        "questions": [
            assessment_question_dict(q) for q in job.assessmentQuestions.all().order_by("order")
        ]
    })


@view(["PATCH"])
def exam_rules_view(request, job_id: str):
    """PATCH /api/jobs/:jobId/exam-rules — pass mark + proctoring tolerance
    from the exam module (job core details untouched)."""
    session, job = _owned_job(request, job_id)
    body = request.data if isinstance(request.data, dict) else {}
    dirty = []
    if "examPassMark" in body:
        try:
            job.examPassMark = max(0, min(100, int(body.get("examPassMark"))))
        except (TypeError, ValueError):
            raise ApiError(400, "Pass mark must be a number between 0 and 100.")
        dirty.append("examPassMark")
    if "maxViolations" in body:
        try:
            job.maxViolations = max(1, min(10, int(body.get("maxViolations"))))
        except (TypeError, ValueError):
            raise ApiError(400, "Max violations must be a number between 1 and 10.")
        dirty.append("maxViolations")
    if dirty:
        job.save(update_fields=dirty + ["updatedAt"])
        audit(
            session["email"], "EXAM_RULES_UPDATED", f"JobPosting:{job.title}",
            f"pass mark {job.examPassMark}% · max violations {job.maxViolations}",
        )
    return Response({"examPassMark": job.examPassMark, "maxViolations": job.maxViolations})
