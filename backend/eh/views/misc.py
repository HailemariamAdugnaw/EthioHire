"""EthioHire — misc endpoints: root, health, interviews, notifications,
recruiter company, admin analytics/companies/settings/audit."""
from django.db.models import Count
from django.utils import timezone
from django.utils.dateparse import parse_datetime
import json as _json

from rest_framework import status
from rest_framework.response import Response

from .applications import _apply_meeting_link, _load_application  # shared access-control loader
from ..common import ApiError, audit, js_locale_datetime, jsnum, notify, parse_client_dt, view
from ..ehauth import auth_mode, get_session_user, require_role, require_user
from ..interviewsched import (
    evaluation_is_released,
    mask_interview_for_candidate,
    publish_due_results,
)
from ..livekit import TOKEN_TTL_SECONDS, is_configured as livekit_configured, mint_token, room_name
from ..notifications import (
    report_interview_completed,
    report_interview_evaluated,
    report_interview_invitation,
)
from ..models import (
    AuditLog,
    CandidateProfile,
    CompanyProfile,
    EvalTemplate,
    InterviewEvaluation,
    InterviewSchedule,
    JobApplication,
    JobPosting,
    Notification,
    NotificationLog,
    PlatformSetting,
    ScoringTemplate,
    User,
)
from ..serializers import (
    application_dict,
    audit_log_dict,
    candidate_dict,
    company_dict,
    eval_template_dict,
    interview_dict,
    interview_question_dict,
    job_dict,
    notification_dict,
    platform_setting_dict,
    scoring_template_dict,
    iso_z,
)
from .jobs import effective_bank_questions, effective_eval_template


@view(["GET"])
def api_root(request):
    return Response({"message": "Hello, world!"})


@view(["GET"])
def health(request):
    database = "up"
    try:
        from django.db import connection

        with connection.cursor() as cur:
            cur.execute("SELECT 1")
    except Exception:  # noqa: BLE001
        database = "down"

    from ..livekit import is_configured as livekit_ready
    from ..notifications import email_enabled, sms_config

    return Response({
        "status": "ok",
        "app": "EthioHire",
        "database": database,
        "authMode": auth_mode(),
        "integrations": {
            "email": "resend" if email_enabled() else "not-configured",
            "sms": "webhook" if sms_config()[0] else "not-configured",
            "livekit": "configured" if livekit_ready() else "not-configured",
        },
        "timestamp": iso_z(timezone.now()),
    })


# ---------------------------------------------------------------- Interviews

@view(["GET"])
def interviews_view(request):
    session = require_user(request)

    qs = InterviewSchedule.objects.none()
    if session["role"] == "CANDIDATE":
        profile = CandidateProfile.objects.filter(userId_id=session["id"]).first()
        if profile:
            qs = InterviewSchedule.objects.filter(application__candidate=profile)
    elif session["role"] == "RECRUITER":
        company = CompanyProfile.objects.filter(userId_id=session["id"]).first()
        if company:
            qs = InterviewSchedule.objects.filter(application__job__company=company)
    elif session["role"] == "ADMIN":
        qs = InterviewSchedule.objects.all()

    interviews = qs.select_related(
        "application__job__company", "application__candidate__userId"
    ).order_by("scheduledTime")

    # Candidate-side release enforcement — lazily publish results whose
    # pre-set release schedule has passed BEFORE masking, so a scheduled
    # release becomes visible exactly at the configured moment.
    if session["role"] == "CANDIDATE":
        for job in JobPosting.objects.filter(id__in={i.application.job_id for i in interviews}):
            publish_due_results(job)

    out = []
    for i in interviews:
        data = interview_dict(i)
        app = i.application
        app_data = application_dict(app)
        app_data["job"] = {
            "id": app.job.id,
            "title": app.job.title,
            "company": {"companyName": app.job.company.companyName},
        }
        app_data["candidate"] = {
            "fullName": app.candidate.fullName,
            "user": {"email": app.candidate.userId.email},
        }
        data["application"] = app_data
        if session["role"] == "CANDIDATE":
            data = mask_interview_for_candidate(data, i)
        out.append(data)

    response = {"interviews": out}

    # Recruiter helper — jobs whose interview results are being held by the
    # AFTER_ALL / MANUAL release modes, with held counts, so the UI can offer
    # a one-click "Release interview results" action.
    if session["role"] in ("RECRUITER", "ADMIN"):
        company = CompanyProfile.objects.filter(userId_id=session["id"]).first() if session["role"] == "RECRUITER" else None
        job_q = JobPosting.objects.filter(interviewResultRelease__in=("AFTER_ALL", "MANUAL"))
        if session["role"] == "RECRUITER" and company is not None:
            job_q = job_q.filter(company=company)
        pending = []
        for j in job_q:
            held = InterviewEvaluation.objects.filter(
                interview__application__job=j,
                interview__status="COMPLETED",
                releasedAt__isnull=True,
            ).count()
            if held > 0:
                pending.append({
                    "jobId": j.id,
                    "jobTitle": j.title,
                    "mode": j.interviewResultRelease,
                    "held": held,
                    "releaseAt": iso_z(j.interviewResultsReleaseAt),
                })
        response["pendingReleases"] = pending

    return Response(response)


@view(["GET", "PATCH"])
def interview_detail_view(request, interview_id: str):
    session = require_user(request)

    interview = (
        InterviewSchedule.objects.filter(id=interview_id)
        .select_related("application__job__company__userId", "application__candidate__userId")
        .first()
    )
    if not interview:
        raise ApiError(404, "Interview not found.")

    app = interview.application
    is_candidate = session["role"] == "CANDIDATE" and app.candidate.userId_id == session["id"]
    is_recruiter = session["role"] == "RECRUITER" and app.job.company.userId_id == session["id"]
    if not (is_candidate or is_recruiter or session["role"] == "ADMIN"):
        raise ApiError(403, "Access denied.")

    if request.method == "GET":
        data = interview_dict(interview)
        job = app.job
        # Lazy scheduled-release pass + held-score masking for candidates.
        if session["role"] == "CANDIDATE":
            publish_due_results(job)
            data = mask_interview_for_candidate(data, interview)
        job_data = job_dict(job)
        company = job.company
        job_data["company"] = company_dict(company)
        job_data["company"]["user"] = {"id": company.userId_id, "email": company.userId.email}
        # NOTE: the proctored exam pool (assessmentQuestions) is deliberately
        # NOT part of the interview room payload — the room reads the
        # dedicated live-interview question bank only (interviewQuestions
        # below), never the written-exam question pool.

        # Dedicated interview question bank with candidate visibility control:
        #   SINGLE → candidate receives ids only (the active question's text
        #            arrives over the LiveKit data channel when presented)
        #   ALL    → candidate receives the full list
        #   HIDDEN → candidate receives nothing at all
        # On top of the job-wide mode, each question carries its own
        # visibleToCandidate toggle — individually hidden questions never
        # reach any candidate payload (no ids, no text), in every mode.
        visibility = job.interviewQuestionVisibility or "SINGLE"
        # Effective question set: the linked standalone bank when one is
        # attached, otherwise the legacy job-scoped rows.
        iq_qs = effective_bank_questions(job)
        if session["role"] == "CANDIDATE":
            if visibility == "HIDDEN":
                job_data["interviewQuestions"] = []
                job_data["questionsHidden"] = True
            elif visibility == "SINGLE":
                job_data["interviewQuestions"] = [
                    interview_question_dict(q, include_text=False)
                    for q in iq_qs
                    if q.visibleToCandidate
                ]
                job_data["questionsHidden"] = False
            else:
                job_data["interviewQuestions"] = [
                    interview_question_dict(q) for q in iq_qs if q.visibleToCandidate
                ]
                job_data["questionsHidden"] = False
        else:
            job_data["interviewQuestions"] = [interview_question_dict(q) for q in iq_qs]
            job_data["questionsHidden"] = visibility == "HIDDEN"

        # Effective scoring template — standalone (linked) template first, then
        # the legacy job-scoped row, otherwise the default set
        eff_tpl = effective_eval_template(job)
        if eff_tpl is None:
            job_data["evaluationTemplate"] = scoring_template_dict(None)
        elif isinstance(eff_tpl, EvalTemplate):
            job_data["evaluationTemplate"] = eval_template_dict(eff_tpl, with_name=True)
        else:
            job_data["evaluationTemplate"] = scoring_template_dict(eff_tpl)

        app_data = application_dict(app)
        app_data["job"] = job_data
        candidate_data = candidate_dict(app.candidate)
        candidate_data["user"] = {"id": app.candidate.userId_id, "email": app.candidate.userId.email}
        app_data["candidate"] = candidate_data
        data["application"] = app_data
        return Response({"interview": data})

    # PATCH — scoring / status updates
    body = request.data if isinstance(request.data, dict) else {}

    if "status" in body:
        if body["status"] in ("SCHEDULED", "COMPLETED", "CANCELLED"):
            interview.status = body["status"]
    if "notes" in body:
        interview.notes = str(body["notes"] or "")[:4000]
    if body.get("score") not in (None, ""):
        try:
            interview.score = float(body["score"])
        except (TypeError, ValueError):
            pass
    interview.save()

    response_data = interview_dict(interview)

    if body.get("status") == "COMPLETED":
        app.status = "INTERVIEW_COMPLETED"
        app.save(update_fields=["status", "updatedAt"])
        report_interview_completed(interview, app, by_role="RECRUITER" if is_recruiter else "CANDIDATE")
        audit(session["email"], "INTERVIEW_COMPLETED", f"InterviewSchedule:{interview.id}")

    if body.get("score") not in (None, "") and is_recruiter:
        audit(session["email"], "INTERVIEW_SCORED", f"InterviewSchedule:{interview.id}", f"Score: {body.get('score')}")

    return Response({"interview": response_data})


# --------------------------------------------- LiveKit live interview room

@view(["GET"])
def interview_livekit_view(request, interview_id: str):
    """Mint a LiveKit access token for an authorized interview participant.

    Access follows the same rules as the interview detail view. Interviewers
    (recruiter of the owning company / admins) receive roomAdmin grants;
    candidates receive plain join grants.
    """
    session = require_user(request)
    interview = (
        InterviewSchedule.objects.filter(id=interview_id)
        .select_related("application__job__company__userId", "application__candidate__userId")
        .first()
    )
    if not interview:
        raise ApiError(404, "Interview not found.")
    app = interview.application
    is_candidate = session["role"] == "CANDIDATE" and app.candidate.userId_id == session["id"]
    is_recruiter = session["role"] == "RECRUITER" and app.job.company.userId_id == session["id"]
    if not (is_candidate or is_recruiter or session["role"] == "ADMIN"):
        raise ApiError(403, "Access denied.")

    if not livekit_configured():
        return Response({
            "configured": False,
            "reason": "LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not set — see docs/LIVEKIT_SETUP.md.",
        })

    from ..livekit import config as livekit_config

    room = room_name(interview.id)
    if is_candidate:
        identity = f"candidate-{session['id']}"
        name = app.candidate.fullName or "Candidate"
        role = "CANDIDATE"
    else:
        identity = f"interviewer-{session['id']}"
        name = session.get("name") or interview.interviewerName or "Interviewer"
        role = "INTERVIEWER"
    token = mint_token(room, identity, name, admin=(role == "INTERVIEWER"))
    return Response({
        "configured": True,
        "url": livekit_config()["url"],
        "token": token,
        "room": room,
        "identity": identity,
        "name": name,
        "role": role,
        "expiresIn": TOKEN_TTL_SECONDS,
    })


# ------------------------------------------------ Interview evaluation API

def _evaluation_dict(ev: InterviewEvaluation | None) -> dict:
    import json as _json

    if ev is None:
        return None

    def _parse(raw):
        try:
            return _json.loads(raw) if raw else []
        except Exception:  # noqa: BLE001
            return []

    return {
        "id": ev.id,
        "interviewId": ev.interview_id,
        "overallScore": jsnum(ev.overallScore),
        "competencyScores": _parse(ev.competencyScores),
        "questionRatings": _parse(ev.questionRatings),
        "comments": ev.comments,
        "submittedBy": ev.submittedBy,
        "releasedAt": iso_z(ev.releasedAt),
        "createdAt": iso_z(ev.createdAt),
    }


@view(["GET", "POST"])
def interview_evaluation_view(request, interview_id: str):
    """Scoring-template evaluation for a completed live interview.

    GET  — both parties read the evaluation. Held results (release mode
           AFTER_ALL / MANUAL, not yet published) mask the score for the
           candidate and report resultWithheld.
    POST — recruiter/admin submits {overallScore, competencyScores[],
           questionRatings[], comments}; the interview is marked COMPLETED
           and the candidate receives the interview-completion email:
             IMMEDIATE → evaluation summary with the overall score
             AFTER_ALL → completion notice; result publishes when every
                         interview for the job is evaluated
             MANUAL    → completion notice; result publishes on explicit
                         release (POST /api/jobs/:id/interview-results/release)
    """
    session = require_user(request)
    interview = (
        InterviewSchedule.objects.filter(id=interview_id)
        .select_related("application__job__company__userId", "application__candidate__userId")
        .first()
    )
    if not interview:
        raise ApiError(404, "Interview not found.")
    app = interview.application
    job = app.job
    is_candidate = session["role"] == "CANDIDATE" and app.candidate.userId_id == session["id"]
    is_recruiter = session["role"] == "RECRUITER" and job.company.userId_id == session["id"]
    if not (is_candidate or is_recruiter or session["role"] == "ADMIN"):
        raise ApiError(403, "Access denied.")

    if request.method == "GET":
        # Lazy scheduled-release pass — a pre-set release time that has passed
        # publishes held results before the candidate reads them.
        if is_candidate:
            publish_due_results(job)
        ev = InterviewEvaluation.objects.filter(interview=interview).first()
        payload = _evaluation_dict(ev) if ev else None
        if payload and is_candidate and not evaluation_is_released(ev, job):
            # Held result — nothing about the performance reaches the
            # candidate: score, competency breakdown, question ratings and
            # the interviewer's notes all stay private until release.
            payload["overallScore"] = None
            payload["competencyScores"] = []
            payload["questionRatings"] = []
            payload["comments"] = None
            payload["resultWithheld"] = True
            payload["resultReleaseAt"] = iso_z(job.interviewResultsReleaseAt)
        return Response({"evaluation": payload})

    if not (is_recruiter or session["role"] == "ADMIN"):
        raise ApiError(403, "Only the employer can submit an interview evaluation.")

    body = request.data if isinstance(request.data, dict) else {}

    eff_tpl = effective_eval_template(job)
    if eff_tpl is None:
        template = scoring_template_dict(None)
    elif isinstance(eff_tpl, EvalTemplate):
        template = eval_template_dict(eff_tpl, with_name=False)
    else:
        template = scoring_template_dict(eff_tpl)
    scale_max = template["scaleMax"]
    # Per-competency weights (weighted scoring): default 1 keeps the classic
    # flat average for templates without custom weights.
    weight_by_key = {c["key"]: max(1, int(c.get("weight") or 1)) for c in template["competencies"]}

    competencies = body.get("competencyScores") if isinstance(body.get("competencyScores"), list) else []
    ratings = body.get("questionRatings") if isinstance(body.get("questionRatings"), list) else []
    clean_competencies = [
        {
            "key": str(c.get("key") or "")[:60],
            "label": str(c.get("label") or "")[:120],
            "score": max(0, min(scale_max, int(c.get("score") or 0))),
        }
        for c in competencies if isinstance(c, dict)
    ]
    clean_ratings = [
        {
            "questionId": str(r.get("questionId") or "")[:64],
            "score": max(0, min(scale_max, int(r.get("score") or 0))),
            "note": str(r.get("note") or "")[:500],
        }
        for r in ratings if isinstance(r, dict)
    ]

    # Overall score — auto-summed from the competency ratings when the client
    # does not send one. WEIGHTED: each competency contributes
    # score × weight; the total is normalized by Σ(scale × weight) so core
    # competencies (e.g. technical depth, weight 3) count more than soft
    # skills (weight 1). An explicit overallScore still wins so recruiter
    # overrides remain possible.
    if body.get("overallScore") not in (None, ""):
        try:
            overall = float(body.get("overallScore"))
        except (TypeError, ValueError):
            raise ApiError(400, "overallScore must be a number (0-100).")
    elif clean_competencies and any(c["score"] for c in clean_competencies):
        earned = sum(c["score"] * weight_by_key.get(c["key"], 1) for c in clean_competencies)
        possible = sum(scale_max * weight_by_key.get(c["key"], 1) for c in clean_competencies)
        overall = round(earned / possible * 100) if possible > 0 else 0
    else:
        raise ApiError(400, "overallScore is required (0-100) — or rate the competencies and it is summed automatically.")
    overall = max(0.0, min(overall, 100.0))
    comments = str(body.get("comments") or "")[:4000]

    release_mode = (job.interviewResultRelease or "IMMEDIATE").upper()
    ev, _ = InterviewEvaluation.objects.update_or_create(
        interview=interview,
        defaults={
            "overallScore": overall,
            "competencyScores": _json.dumps(clean_competencies),
            "questionRatings": _json.dumps(clean_ratings),
            "comments": comments or None,
            "submittedBy": session["email"],
        },
    )

    interview.score = overall
    interview.status = "COMPLETED"
    interview.notes = comments or interview.notes
    interview.save()
    app.status = "INTERVIEW_COMPLETED"
    app.save(update_fields=["status", "updatedAt"])

    # ------------------------------------------------ result release decision
    release_now = release_mode == "IMMEDIATE"
    auto_publish_pending = False
    if release_mode == "AFTER_ALL":
        pending = InterviewSchedule.objects.filter(
            application__job=job, status="SCHEDULED"
        ).exclude(id=interview.id).count()
        if pending == 0:
            release_now = True
            auto_publish_pending = True

    if release_now:
        if ev.releasedAt is None:
            ev.releasedAt = timezone.now()
            ev.save(update_fields=["releasedAt", "updatedAt"])
        report_interview_evaluated(interview, app, {"overallScore": overall}, released=True)
        if auto_publish_pending:
            _publish_all_pending_interview_results(job)
    else:
        report_interview_evaluated(interview, app, {"overallScore": overall}, released=False)

    audit(
        session["email"], "INTERVIEW_EVALUATED", f"InterviewSchedule:{interview.id}",
        f"Overall {overall}/100, {len(clean_competencies)} competency score(s), {len(clean_ratings)} question rating(s), release {release_mode.lower()}",
    )
    return Response({
        "evaluation": _evaluation_dict(ev),
        "interview": interview_dict(interview),
        "resultReleased": release_now,
        "releaseMode": release_mode,
    })


def _publish_all_pending_interview_results(job: JobPosting) -> int:
    """Publish every still-held evaluation for a job (AFTER_ALL completion)."""
    from ..notifications import report_interview_results_released

    held = list(
        InterviewEvaluation.objects.filter(
            interview__application__job=job,
            releasedAt__isnull=True,
            interview__status="COMPLETED",
        ).select_related("interview__application__candidate", "interview__application__job")
    )
    now = timezone.now()
    for ev in held:
        ev.releasedAt = now
        ev.save(update_fields=["releasedAt", "updatedAt"])
        report_interview_results_released(ev.interview, ev.interview.application, {"overallScore": ev.overallScore})
    return len(held)


# ------------------------------------------- Live-session recruiter control

CONTROL_ACTIONS = ("PAUSE", "RESUME", "REQUEST_MUTE", "REQUEST_UNMUTE", "DISCONNECT", "EXTEND")


@view(["POST"])
def interview_control_view(request, interview_id: str):
    """Recruiter live-interview Control Panel — server-side session commands.

    PAUSE / RESUME persist InterviewSchedule.sessionState (ACTIVE/PAUSED) so a
    rejoining client restores the hold; every action is audited. The live
    effects (hold overlay, mute request, disconnect) propagate over the
    LiveKit data channel from the recruiter's client; this endpoint is the
    audited source of truth. Question visibility is NOT a live control: the
    display follows the configured job mode (SINGLE/ALL/HIDDEN) strictly."""
    session = require_user(request)
    interview = (
        InterviewSchedule.objects.filter(id=interview_id)
        .select_related("application__job__company__userId", "application__candidate__userId")
        .first()
    )
    if not interview:
        raise ApiError(404, "Interview not found.")
    app = interview.application
    is_recruiter = session["role"] == "RECRUITER" and app.job.company.userId_id == session["id"]
    if not (is_recruiter or session["role"] == "ADMIN"):
        raise ApiError(403, "Only the employer can control the live session.")

    body = request.data if isinstance(request.data, dict) else {}
    action = str(body.get("action") or "").upper()
    if action not in CONTROL_ACTIONS:
        raise ApiError(400, "Unknown control action.")

    if action == "PAUSE":
        interview.sessionState = "PAUSED"
        interview.save(update_fields=["sessionState", "updatedAt"])
    elif action == "RESUME":
        interview.sessionState = "ACTIVE"
        interview.save(update_fields=["sessionState", "updatedAt"])

    detail = str(body.get("detail") or "")[:500]
    audit(
        session["email"], f"INTERVIEW_CONTROL_{action}",
        f"InterviewSchedule:{interview.id}",
        detail or f"session state {interview.sessionState}",
    )
    return Response({
        "ok": True,
        "action": action,
        "sessionState": interview.sessionState or "ACTIVE",
        "interview": interview_dict(interview),
    })


# ------------------------------------------- Admin: delivery audit trail

@view(["GET"])
def admin_notification_logs(request):
    """Reporting & Decisioning delivery log — every outbound EMAIL/SMS attempt."""
    require_role(request, "ADMIN")
    try:
        take = int(request.query_params.get("take") or 100)
    except (TypeError, ValueError):
        take = 100
    take = min(take or 100, 500)

    logs = NotificationLog.objects.select_related("user").order_by("-createdAt")[:take]
    from ..notifications import email_enabled, sms_config

    return Response({
        "logs": [
            {
                "id": lg.id,
                "decisionPoint": lg.decisionPoint,
                "channel": lg.channel,
                "recipient": lg.recipient,
                "subject": lg.subject,
                "status": lg.status,
                "providerId": lg.providerId,
                "error": lg.error,
                "user": {"email": lg.user.email} if lg.user else None,
                "createdAt": iso_z(lg.createdAt),
            }
            for lg in logs
        ],
        "providers": {
            "email": "resend" if email_enabled() else "not-configured",
            "sms": "webhook" if sms_config()[0] else "not-configured",
            "livekit": "configured" if livekit_configured() else "not-configured",
        },
    })


# ------------------------------------------------- Auto interview slotting

@view(["POST"])
def interview_slots_view(request, job_id: str):
    """Feature: Automated Live Interview Time-Slotting — generate sequential,
    non-overlapping slots for every candidate who passed the text exam.

    Each slot books the interview AND sends the Resend invitation; the response
    reports per-recipient delivery outcomes (SENT / FAILED / SKIPPED + reason)
    so the recruiter immediately sees whether notifications actually went out."""
    import datetime as _dt

    from ..models import InterviewSchedule
    from ..serializers import iso_z

    session = require_role(request, "RECRUITER", "ADMIN")
    job = JobPosting.objects.filter(id=job_id).select_related("company").first()
    if not job:
        raise ApiError(404, "Job not found.")
    if session["role"] == "RECRUITER" and job.company.userId_id != session["id"]:
        raise ApiError(403, "Access denied.")

    body = request.data if isinstance(request.data, dict) else {}
    start = parse_client_dt(body.get("startAt"))
    if start is None:
        raise ApiError(400, "Interview start date & time is required.")
    if start <= timezone.now():
        raise ApiError(400, "Interview start must be in the future.")
    try:
        duration = int(str(body.get("slotDurationMinutes") or 30))
    except (TypeError, ValueError):
        duration = 30
    duration = max(5, min(duration, 240))
    fmt = body.get("format") if body.get("format") in ("VIDEO", "VOICE", "ONSITE") else "VIDEO"

    # ---- Result release configuration step (right after the recruiter clicks
    # ---- "Generate Slots & Notify Candidates") — applies the chosen mode to
    # ---- the job BEFORE any evaluation can come in.
    release_applied = None
    if "interviewResultRelease" in body:
        val = str(body.get("interviewResultRelease") or "IMMEDIATE").upper()
        if val not in ("IMMEDIATE", "AFTER_ALL", "MANUAL"):
            raise ApiError(400, "Release mode must be IMMEDIATE, AFTER_ALL or MANUAL.")
        job.interviewResultRelease = val
        release_applied = {"mode": val}
        if val == "MANUAL" and body.get("interviewResultsReleaseAt") not in (None, ""):
            release_at = parse_client_dt(body.get("interviewResultsReleaseAt"))
            if release_at is None:
                raise ApiError(400, "The scheduled release time is invalid.")
            if release_at <= timezone.now():
                raise ApiError(400, "The scheduled release time must be in the future.")
            job.interviewResultsReleaseAt = release_at
            release_applied["releaseAt"] = iso_z(release_at)
        elif val == "MANUAL":
            # Scheduled time optional — empty keeps the job's existing one.
            pass
        else:
            job.interviewResultsReleaseAt = None
            release_applied["releaseAt"] = None
        job.save(update_fields=["interviewResultRelease", "interviewResultsReleaseAt", "updatedAt"])
        audit(
            session["email"], "INTERVIEW_RELEASE_CONFIGURED", f"JobPosting:{job.title}",
            f"mode {val.lower()}"
            + (f", auto-publish at {release_applied['releaseAt']}" if release_applied.get("releaseAt") else ""),
        )

    qualified = (
        JobApplication.objects.filter(job=job, examStatus="PASSED")
        .exclude(status="REJECTED")
        .select_related("candidate")
        .order_by("-examScore", "createdAt")
    )
    if not qualified.exists():
        raise ApiError(400, "No candidates have passed the text exam for this job yet.")

    slots = []
    notification_outcomes = []
    for i, app in enumerate(qualified):
        slot_start = start + _dt.timedelta(minutes=duration * i)
        slot_end = slot_start + _dt.timedelta(minutes=duration)
        schedule, _ = InterviewSchedule.objects.update_or_create(
            application=app,
            defaults={
                "scheduledTime": slot_start,
                "slotDurationMinutes": duration,
                "format": fmt,
                "meetingLink": None,
                "interviewerName": session["name"],
                "status": "SCHEDULED",
            },
        )
        _apply_meeting_link(schedule, body.get("meetingLink"))
        app.status = "INTERVIEW_SCHEDULED"
        app.save(update_fields=["status", "updatedAt"])
        try:
            outcomes = report_interview_invitation(schedule, app)
        except Exception as exc:  # noqa: BLE001 — fail-safe per slot
            outcomes = [{"recipient": "", "role": "CANDIDATE", "status": "FAILED", "error": str(exc)[:400]}]
        notification_outcomes.append({
            "applicationId": app.id,
            "candidateName": app.candidate.fullName,
            "slot": iso_z(slot_start),
            "notifications": outcomes,
        })
        slots.append({
            "applicationId": app.id,
            "candidateName": app.candidate.fullName,
            "interviewId": schedule.id,
            "startTime": iso_z(slot_start),
            "endTime": iso_z(slot_end),
            "status": "SCHEDULED",
            "candidateNotified": next(
                (o["status"] for o in outcomes if o["role"] == "CANDIDATE"), "SKIPPED"
            ),
            "notifyError": next(
                (o.get("error") for o in outcomes if o["role"] == "CANDIDATE" and o["status"] != "SENT"), None
            ),
        })

    from ..notifications import email_enabled

    sent = sum(1 for s in slots if s["candidateNotified"] == "SENT")
    skipped = sum(1 for s in slots if s["candidateNotified"] == "SKIPPED")
    failed = sum(1 for s in slots if s["candidateNotified"] == "FAILED")

    audit(
        session["email"], "INTERVIEW_SLOTS_GENERATED", f"JobPosting:{job.title}",
        f"{len(slots)} sequential slots of {duration} min from {start.isoformat()}; emails sent/skipped/failed {sent}/{skipped}/{failed}",
    )
    return Response({
        "created": len(slots),
        "slotDurationMinutes": duration,
        "startAt": iso_z(start),
        "releaseApplied": release_applied,
        "slots": slots,
        "notificationSummary": {
            "sent": sent,
            "skipped": skipped,
            "failed": failed,
            "emailConfigured": email_enabled(),
        },
        "notificationOutcomes": notification_outcomes,
    })


# ------------------------------------------------------------- Notifications

@view(["GET", "PATCH"])
def notifications_view(request):
    session = require_user(request)

    if request.method == "PATCH":
        body = request.data if isinstance(request.data, dict) else {}
        if body.get("id"):
            Notification.objects.filter(id=body["id"], user_id=session["id"]).update(read=True)
        else:
            Notification.objects.filter(user_id=session["id"]).update(read=True)
        return Response({"ok": True})

    latest = Notification.objects.filter(user_id=session["id"]).order_by("-createdAt")[:50]
    data = [notification_dict(n) for n in latest]
    unread = sum(1 for n in latest if not n.read)
    return Response({"notifications": data, "unread": unread})


# --------------------------------------------------------- Recruiter company

@view(["GET", "PUT"])
def recruiter_company_view(request):
    session = require_role(request, "RECRUITER")

    company = CompanyProfile.objects.filter(userId_id=session["id"]).first()

    if request.method == "GET":
        if not company:
            company = CompanyProfile.objects.create(
                userId_id=session["id"], companyName=f"{session['name']}'s Company"
            )
        return Response({"company": company_dict(company)})

    body = request.data if isinstance(request.data, dict) else {}
    if not company:
        company = CompanyProfile.objects.create(
            userId_id=session["id"], companyName=f"{session['name']}'s Company"
        )
    company.companyName = str(body.get("companyName") or f"{session['name']}'s Company").strip()
    company.industry = body.get("industry")
    company.website = body.get("website")
    company.location = body.get("location")
    company.description = body.get("description")
    company.save()
    audit(session["email"], "COMPANY_PROFILE_UPDATED", f"CompanyProfile:{company.companyName}")
    return Response({"company": company_dict(company)})


# --------------------------------------------------------------------- Admin

@view(["GET"])
def admin_analytics(request):
    require_role(request, "ADMIN")

    users_by_role = dict(User.objects.values_list("role").annotate(c=Count("id")))
    totals = {
        "users": User.objects.count(),
        "candidates": users_by_role.get("CANDIDATE", 0),
        "recruiters": users_by_role.get("RECRUITER", 0),
        "jobs": JobPosting.objects.count(),
        "openJobs": JobPosting.objects.filter(status="OPEN").count(),
        "applications": JobApplication.objects.count(),
        "approvedCompanies": CompanyProfile.objects.filter(verificationStatus="APPROVED").count(),
        "proPlans": CompanyProfile.objects.exclude(subscriptionPlan="FREE").count(),
    }
    funnel = {
        "applied": JobApplication.objects.count(),
        "preScreenPassed": JobApplication.objects.filter(preScreenPassed=True).count(),
        "examPassed": JobApplication.objects.filter(examStatus="PASSED").count(),
        "interviews": InterviewSchedule.objects.count(),
        "hired": JobApplication.objects.filter(status="HIRED").count(),
    }
    status_counts = list(JobApplication.objects.values("status").annotate(count=Count("id")))
    from ..models import ProctoringLog

    proctoring_counts = list(ProctoringLog.objects.values("eventType").annotate(count=Count("id")))
    recent_audit = [audit_log_dict(a) for a in AuditLog.objects.order_by("-createdAt")[:10]]

    return Response({
        "totals": totals,
        "funnel": funnel,
        "statusCounts": status_counts,
        "proctoring": proctoring_counts,
        "recentAudit": recent_audit,
    })


@view(["GET", "PATCH"])
def admin_companies(request):
    session = require_role(request, "ADMIN")

    if request.method == "GET":
        companies = CompanyProfile.objects.select_related("userId").order_by("-createdAt")
        out = []
        for c in companies:
            data = company_dict(c)
            data["user"] = {
                "email": c.userId.email,
                "name": c.userId.name,
                "createdAt": iso_z(c.userId.createdAt),
            }
            data["_count"] = {"jobs": c.jobs.count()}
            out.append(data)
        return Response({"companies": out})

    body = request.data if isinstance(request.data, dict) else {}
    company = CompanyProfile.objects.filter(id=body.get("companyId")).first()
    if not company:
        raise ApiError(404, "Company not found.")

    if body.get("verificationStatus") in ("PENDING", "APPROVED", "SUSPENDED"):
        company.verificationStatus = body["verificationStatus"]
        company.save(update_fields=["verificationStatus", "updatedAt"])
        vs = company.verificationStatus
        body_text = {
            "APPROVED": "Your company is verified. You can now post jobs and configure pre-screening.",
            "SUSPENDED": "Your company account has been suspended. Contact platform support.",
        }.get(vs, "Your company verification is pending review.")
        from ..common import notify

        notify(company.userId_id, f"Company {vs.lower()} \u2014 EthioHire", body_text, "EMAIL")
        audit(session["email"], f"COMPANY_{vs}", f"CompanyProfile:{company.companyName}")

    if body.get("subscriptionPlan") in ("FREE", "PRO", "ENTERPRISE"):
        company.subscriptionPlan = body["subscriptionPlan"]
        company.save(update_fields=["subscriptionPlan", "updatedAt"])
        audit(
            session["email"], "SUBSCRIPTION_CHANGED",
            f"CompanyProfile:{company.companyName}", f"\u2192 {company.subscriptionPlan}",
        )

    return Response({"company": company_dict(company)})


@view(["GET", "PATCH"])
def admin_settings(request):
    session = require_role(request, "ADMIN")

    if request.method == "GET":
        settings_rows = PlatformSetting.objects.all().order_by("key")
        plans = list(
            CompanyProfile.objects.values("subscriptionPlan").annotate(count=Count("id"))
        )
        plans = [{"plan": p.pop("subscriptionPlan"), "count": p["count"]} for p in plans]
        return Response({
            "settings": [platform_setting_dict(s) for s in settings_rows],
            "plans": plans,
        })

    body = request.data if isinstance(request.data, dict) else {}
    if not body.get("key") or body.get("value") is None:
        raise ApiError(400, "key and value are required.")
    setting, _ = PlatformSetting.objects.update_or_create(
        key=body["key"], defaults={"value": str(body["value"])}
    )
    audit(
        session["email"], "SETTING_UPDATED",
        f"PlatformSetting:{setting.key}", f"\u2192 {body.get('value')}",
    )
    return Response({"setting": platform_setting_dict(setting)})


@view(["GET"])
def admin_audit(request):
    require_role(request, "ADMIN")
    try:
        take = int(request.query_params.get("take") or 100)
    except (TypeError, ValueError):
        take = 100
    take = min(take or 100, 500)
    logs = AuditLog.objects.order_by("-createdAt")[:take]
    return Response({"logs": [audit_log_dict(a) for a in logs]})
