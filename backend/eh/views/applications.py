"""EthioHire — application endpoints incl. the Stage-2 proctored exam engine
(port of src/app/api/applications/*) with the scheduled group-exam model."""
import json as _json
import math

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.response import Response

from ..common import ApiError, audit, js_locale_datetime, notify, parse_client_dt, view
from ..ehauth import get_session_user, require_role, require_user
from ..examsched import is_released, is_scheduled, release_if_due, scheduling_notice, window_end
from ..livekit import is_configured as livekit_configured
from ..notifications import (
    report_exam_evaluated,
    report_interview_invitation,
    report_status_change,
)
from ..questions import grade_answer, grade_text_answer, norm_answer
from ..models import (
    AssessmentQuestion,
    CandidateProfile,
    CompanyProfile,
    ExamAnswer,
    ExamSession,
    InterviewSchedule,
    JobApplication,
    JobPosting,
    ProctoringLog,
)
from ..serializers import (
    application_dict,
    assessment_question_dict,
    document_dict,
    exam_answer_dict,
    interview_dict,
    job_dict,
    mask_application_for_candidate,
    proctoring_log_dict,
    session_window_end,
)


def _load_application(application_id: str, session: dict) -> JobApplication:
    app = (
        JobApplication.objects.filter(id=application_id)
        .select_related("job__company__userId", "candidate__userId")
        .first()
    )
    if not app:
        raise ApiError(404, "Application not found.")
    if session["role"] == "CANDIDATE" and app.candidate.userId_id != session["id"]:
        raise ApiError(403, "Access denied.")
    if session["role"] == "RECRUITER" and app.job.company.userId_id != session["id"]:
        raise ApiError(403, "Access denied.")
    return app


@view(["GET"])
def applications_view(request):
    session = require_user(request)
    status_filter = request.query_params.get("status")

    qs = JobApplication.objects.none()
    if session["role"] == "CANDIDATE":
        profile = CandidateProfile.objects.filter(userId_id=session["id"]).first()
        if profile:
            qs = JobApplication.objects.filter(candidate=profile)
    elif session["role"] == "RECRUITER":
        company = CompanyProfile.objects.filter(userId_id=session["id"]).first()
        if company:
            qs = JobApplication.objects.filter(job__company=company)
    elif session["role"] == "ADMIN":
        qs = JobApplication.objects.all()

    if status_filter:
        qs = qs.filter(status=status_filter)

    apps = qs.select_related("job__company", "candidate__userId").order_by("-createdAt")

    # preload exam sessions for the jobs involved (single query)
    job_ids = {a.job_id for a in apps}
    sessions = {s.job_id: s for s in ExamSession.objects.filter(job_id__in=job_ids)}

    out = []
    for a in apps:
        data = application_dict(a, session=sessions.get(a.job_id))
        if session["role"] == "CANDIDATE":
            data = mask_application_for_candidate(data, a, session=sessions.get(a.job_id))
        data["job"] = {
            "id": a.job.id,
            "title": a.job.title,
            "category": a.job.category,
            "examPassMark": a.job.examPassMark,
            "company": {
                "companyName": a.job.company.companyName,
                "userId": a.job.company.userId_id,
            },
        }
        data["candidate"] = {
            "fullName": a.candidate.fullName,
            "universityName": a.candidate.universityName,
            "degreeLevel": a.candidate.degreeLevel,
            "gpa": a.candidate.gpa,
            "graduationYear": a.candidate.graduationYear,
            "expectedSalary": a.candidate.expectedSalary,
            "experienceYears": a.candidate.experienceYears,
            "skills": a.candidate.skills,
            "user": {"email": a.candidate.userId.email},
        }
        latest = list(InterviewSchedule.objects.filter(application=a).order_by("-createdAt")[:1])
        data["interviewSchedules"] = [interview_dict(i) for i in latest]
        out.append(data)
    return Response({"applications": out})


@view(["GET", "PATCH"])
def application_detail_view(request, application_id: str):
    if request.method == "PATCH":
        return _patch_application(request, application_id)

    session = require_user(request)
    app = _load_application(application_id, session)

    job = app.job
    company = job.company
    job_data = job_dict(job)
    company_data = {
        "id": company.id,
        "userId": company.userId_id,
        "companyName": company.companyName,
        "industry": company.industry,
        "website": company.website,
        "location": company.location,
        "description": company.description,
        "verificationStatus": company.verificationStatus,
        "subscriptionPlan": company.subscriptionPlan,
        "createdAt": _iso(company.createdAt),
        "updatedAt": _iso(company.updatedAt),
        "user": {"id": company.userId_id, "email": company.userId.email},
    }
    job_data["company"] = company_data

    candidate = app.candidate
    candidate_data = {
        "id": candidate.id,
        "userId": candidate.userId_id,
        "fullName": candidate.fullName,
        "phone": candidate.phone,
        "universityName": candidate.universityName,
        "degreeLevel": candidate.degreeLevel,
        "fieldOfStudy": candidate.fieldOfStudy,
        "graduationYear": candidate.graduationYear,
        "gpa": candidate.gpa,
        "expectedSalary": candidate.expectedSalary,
        "experienceYears": candidate.experienceYears,
        "skills": candidate.skills,
        "about": candidate.about,
        "cvUrl": candidate.cvUrl,
        "user": {"id": candidate.userId_id, "email": candidate.userId.email},
        "documents": [document_dict(d) for d in candidate.documents.all()],
    }

    exam_session = ExamSession.objects.filter(job_id=app.job_id).first()
    data = application_dict(app, session=exam_session)
    if session["role"] == "CANDIDATE":
        data = mask_application_for_candidate(data, app, session=exam_session)
    data["job"] = job_data
    data["candidate"] = candidate_data
    data["proctoringLogs"] = [
        proctoring_log_dict(p) for p in app.proctoringLogs.all().order_by("createdAt")
    ]
    data["interviewSchedules"] = [
        interview_dict(i) for i in InterviewSchedule.objects.filter(application=app).order_by("-createdAt")
    ]

    sanitized_answers = []
    for a in app.examAnswers.all().select_related("question"):
        ea = exam_answer_dict(a)
        is_correct = a.isCorrect
        if session["role"] == "CANDIDATE" and app.status == "EXAM_IN_PROGRESS":
            is_correct = None  # anti-leak while the exam is running
        ea["isCorrect"] = is_correct
        qd = assessment_question_dict(a.question)
        if session["role"] == "CANDIDATE":
            qd["correctAnswer"] = None  # never leak correct answers to candidates
        ea["question"] = qd
        sanitized_answers.append(ea)
    data["examAnswers"] = sanitized_answers

    return Response({"application": data})


def _patch_application(request, application_id: str):
    session = require_role(request, "RECRUITER", "ADMIN")
    app = _load_application(application_id, session)
    body = request.data if isinstance(request.data, dict) else {}
    action = body.get("action")

    if action == "SHORTLIST":
        app.status = "SHORTLISTED"
        app.save(update_fields=["status", "updatedAt"])
        report_status_change(app, "SHORTLISTED", decision_point="APPLICATION_SHORTLISTED")
        audit(session["email"], "APPLICATION_SHORTLISTED", f"JobApplication:{app.id}")
        return Response({"application": application_dict(app)})

    if action == "REJECT":
        app.status = "REJECTED"
        app.rejectReason = body.get("reason") or "Application rejected during review."
        app.save(update_fields=["status", "rejectReason", "updatedAt"])
        report_status_change(app, "REJECTED", reason=app.rejectReason, decision_point="APPLICATION_REJECTED")
        audit(session["email"], "APPLICATION_REJECTED", f"JobApplication:{app.id}", body.get("reason"))
        return Response({"application": application_dict(app)})

    if action == "SCHEDULE_INTERVIEW":
        # parse_client_dt normalizes 'Z' suffixes and naive strings the same way
        # as the exam-session and slotting endpoints — a bare parse_datetime()
        # here used to reject/misread some client payloads.
        when = parse_client_dt(body.get("scheduledTime"))
        if when is None:
            raise ApiError(400, "scheduledTime is required.")
        if when <= timezone.now():
            raise ApiError(400, "Interview time must be in the future.")
        fmt = body.get("format") if body.get("format") in ("VIDEO", "VOICE", "ONSITE") else "VIDEO"
        interviewer = body.get("interviewerName") or session["name"]

        schedule, _ = InterviewSchedule.objects.update_or_create(
            application=app,
            defaults={
                "scheduledTime": when,
                "format": fmt,
                "meetingLink": None,
                "interviewerName": interviewer,
                "status": "SCHEDULED",
            },
        )
        _apply_meeting_link(schedule, body.get("meetingLink"))
        app.status = "INTERVIEW_SCHEDULED"
        app.save(update_fields=["status", "updatedAt"])

        report_interview_invitation(schedule, app)
        audit(session["email"], "INTERVIEW_SCHEDULED", f"JobApplication:{app.id}", f"at {body['scheduledTime']}")
        return Response({"application": application_dict(app), "schedule": interview_dict(schedule)})

    if action == "MARK_HIRED":
        app.status = "HIRED"
        app.save(update_fields=["status", "updatedAt"])
        report_status_change(app, "HIRED", decision_point="APPLICATION_HIRED")
        audit(session["email"], "APPLICATION_HIRED", f"JobApplication:{app.id}")
        return Response({"application": application_dict(app)})

    raise ApiError(400, f"Unknown action: {action}")


def _iso(dt):
    from ..serializers import iso_z

    return iso_z(dt)


def _apply_meeting_link(schedule, explicit_link=None) -> None:
    """Persist the join link for a scheduled interview.

    Priority: explicit link from the recruiter > LiveKit room URL (when the
    LiveKit integration is configured and the format is VIDEO/VOICE) > the
    EthioHire in-app room URL (works via the signaling fallback service)."""
    from ..notifications import app_url

    if explicit_link:
        schedule.meetingLink = str(explicit_link)[:500]
    elif livekit_configured() and schedule.format in ("VIDEO", "VOICE"):
        schedule.meetingLink = f"{app_url()}/#/interview-room/{schedule.id}?lk=1"
    else:
        schedule.meetingLink = f"{app_url()}/#/interview-room/{schedule.id}"
    schedule.save(update_fields=["meetingLink", "updatedAt"])


# ---------------------------------------------------------------------------
# Stage 2 — Proctored Online Assessment engine
# ---------------------------------------------------------------------------

def _grade_exam(application_id: str, questions, pass_mark: int) -> dict:
    answers = ExamAnswer.objects.filter(application_id=application_id)
    total = len(questions) or 1
    correct = answers.filter(isCorrect=True).count()
    score = int(math.floor((correct / total) * 100 + 0.5))  # Math.round
    return {"examScore": score, "passed": score >= pass_mark}


@view(["GET", "POST"])
def exam_view(request, application_id: str):
    session = require_role(request, "CANDIDATE")
    body = request.data if isinstance(request.data, dict) else {}
    action = body.get("action") if request.method == "POST" else "status"

    app = (
        JobApplication.objects.filter(id=application_id)
        .select_related("job__company__userId", "candidate")
        .first()
    )
    if not app:
        raise ApiError(404, "Application not found.")
    if app.candidate.userId_id != session["id"]:
        raise ApiError(403, "Access denied.")

    questions = list(app.job.assessmentQuestions.all().order_by("order"))
    exam_session = ExamSession.objects.filter(job_id=app.job_id).first()
    now = timezone.now()
    w_end = window_end(exam_session)  # None while the provisioned session is unscheduled
    scheduled = is_scheduled(exam_session)

    def session_payload():
        # Not scheduled (no session, or the provisioned-but-unscheduled
        # record) → the candidate payload carries no session at all, exactly
        # like the legacy "no session" shape.
        if not scheduled:
            return None
        return {
            "scheduledAt": _iso(exam_session.scheduledAt),
            "endsAt": _iso(w_end),
            "durationMinutes": exam_session.durationMinutes,
            "releaseMode": exam_session.releaseMode,
        }

    # ------------------------------------------------------------- STATUS (GET)
    if action == "status":
        completed = (app.examStatus or "") in ("PASSED", "FAILED", "TERMINATED")
        in_progress = app.examStatus == "IN_PROGRESS"
        withheld = bool(
            exam_session is not None
            and exam_session.releaseMode == "MANUAL"
            and not is_released(exam_session)
        )
        if scheduled:
            if completed:
                can_start = False
            elif in_progress:
                can_start = True
            else:
                can_start = now >= exam_session.scheduledAt and now < w_end
            window_over = now >= w_end
            locked = (not completed and not in_progress and now < exam_session.scheduledAt)
        else:
            # No session, or a provisioned-but-unscheduled session — the exam
            # is open immediately (recruiter schedules in the Exams module).
            can_start = not completed
            window_over = False
            locked = False

        saved = []
        if in_progress:
            saved = [{"questionId": a.question_id, "answer": a.answer} for a in ExamAnswer.objects.filter(application_id=app.id)]

        return Response({
            "exam": {
                "applicationId": app.id,
                "jobTitle": app.job.title,
                "passMark": app.job.examPassMark,
                "maxViolations": app.job.maxViolations,
                "violationCount": app.violationCount,
                "examStatus": None if (completed and withheld) else app.examStatus,
                "resultsWithheld": bool(completed and withheld),
                "preScreenPassed": app.preScreenPassed,
                "canStart": can_start,
                "locked": locked,
                "windowOver": window_over,
                "session": session_payload(),
                "savedAnswers": saved,
                "questions": [],
            }
        })

    # ------------------------------------------------------------- START
    if action == "start":
        if not app.preScreenPassed:
            raise ApiError(403, "You must pass pre-screening before taking the assessment.")
        if (app.examStatus or "") in ("PASSED", "FAILED", "TERMINATED"):
            raise ApiError(409, "This assessment has already been completed. Exams can only be taken once per job.")

        # Scheduled group exam — the exam unlocks at the same timestamp for all
        # qualified applicants and runs on an identical countdown window.
        # Provisioned-but-unscheduled sessions never block the exam.
        if scheduled and app.examStatus != "IN_PROGRESS":
            if now < exam_session.scheduledAt:
                raise ApiError(
                    403,
                    f"This assessment is scheduled for {js_locale_datetime(exam_session.scheduledAt)}. "
                    "The exam unlocks at the exact same moment for every candidate.",
                )
            if now >= w_end:
                raise ApiError(403, "The scheduled exam window has already closed. Contact the recruiter.")

        if not app.examStartedAt:
            app.examStartedAt = now
            app.examStatus = "IN_PROGRESS"
            app.status = "EXAM_IN_PROGRESS"
            app.save(update_fields=["examStartedAt", "examStatus", "status", "updatedAt"])
            audit(session["email"], "EXAM_STARTED", f"JobApplication:{app.id}", f"Job: {app.job.title}")

        exam_questions = []
        for q in questions:
            qd = assessment_question_dict(q, parse_options=True)
            exam_questions.append({
                "id": qd["id"],
                "questionText": qd["questionText"],
                "questionType": qd["questionType"],
                "options": qd["options"],
                "timeLimitSeconds": qd["timeLimitSeconds"],
                "order": qd["order"],
                # correctAnswer intentionally omitted — graded server-side
            })

        existing = ExamAnswer.objects.filter(application_id=app.id)
        return Response({
            "exam": {
                "applicationId": app.id,
                "jobTitle": app.job.title,
                "passMark": app.job.examPassMark,
                "maxViolations": app.job.maxViolations,
                "violationCount": app.violationCount,
                "questions": exam_questions,
                "savedAnswers": [{"questionId": a.question_id, "answer": a.answer} for a in existing],
                "startedAt": _iso(app.examStartedAt),
                "session": session_payload(),
            }
        })

    # ------------------------------------------------------------- ANSWER
    if action == "answer":
        if app.examStatus == "TERMINATED":
            raise ApiError(409, "Exam was terminated due to proctoring violations.")
        question_id = body.get("questionId")
        question = next((q for q in questions if q.id == question_id), None)
        if not question:
            raise ApiError(404, "Question not found.")

        answer = body.get("answer")
        is_correct = grade_answer(question.questionType, question.correctAnswer, answer)
        if is_correct is None:
            # TEXT — keyword heuristic for auto-feedback; reviewed by recruiters
            is_correct = grade_text_answer(question.correctAnswer, answer)

        try:
            time_spent = int(str(body.get("timeSpentSeconds") if body.get("timeSpentSeconds") is not None else 0))
        except (TypeError, ValueError):
            time_spent = 0
        time_spent = max(0, time_spent)

        ExamAnswer.objects.update_or_create(
            application=app,
            question=question,
            defaults={
                "answer": str(answer or "")[:5000],
                "isCorrect": is_correct,
                "timeSpentSeconds": time_spent,
            },
        )
        return Response({"ok": True})

    # ----------------------------------------------------------- VIOLATION
    if action == "violation":
        event_type = body.get("eventType")
        valid_events = ["TAB_SWITCH", "WINDOW_BLUR", "FULLSCREEN_EXIT", "COPY_PASTE", "RIGHT_CLICK", "FACE_MISSING", "MULTI_FACE"]
        if event_type not in valid_events:
            return Response({"error": "Invalid event type."}, status=400)
        if app.examStatus == "TERMINATED":
            return Response({"terminated": True, "violationCount": app.violationCount})

        is_serious = event_type in ("TAB_SWITCH", "FULLSCREEN_EXIT")
        new_count = app.violationCount + (1 if is_serious else 0)

        ProctoringLog.objects.create(
            application=app,
            eventType=event_type,
            details=str(body.get("details") or "")[:500],
            snapshotUrl=str(body.get("snapshotUrl"))[:4_000_000] if body.get("snapshotUrl") else None,
        )

        if new_count >= app.job.maxViolations:
            graded = _grade_exam(app.id, questions, app.job.examPassMark)

            app.violationCount = new_count
            app.examStatus = "TERMINATED"
            app.status = "EXAM_TERMINATED"
            app.examCompletedAt = timezone.now()
            app.examScore = graded["examScore"]
            app.save(update_fields=["violationCount", "examStatus", "status", "examCompletedAt", "examScore", "updatedAt"])
            # Reporting & Decisioning — full evaluation summary + proctoring
            # audit log to the recruiter, termination notice to the candidate.
            report_exam_evaluated(app, graded, withheld=False)
            release_if_due(exam_session)
            audit(session["email"], "EXAM_TERMINATED", f"JobApplication:{app.id}", f"Violations: {new_count}, last: {event_type}")
            return Response({"terminated": True, "violationCount": new_count})

        app.violationCount = new_count
        app.save(update_fields=["violationCount", "updatedAt"])
        return Response({"terminated": False, "violationCount": new_count})

    # ------------------------------------------------------------ SNAPSHOT
    if action == "snapshot":
        ProctoringLog.objects.create(
            application=app,
            eventType="SNAPSHOT",
            details=str(body.get("details") or "Scheduled webcam snapshot"),
            snapshotUrl=str(body.get("snapshotUrl"))[:4_000_000] if body.get("snapshotUrl") else None,
        )
        return Response({"ok": True})

    # ------------------------------------------------------------ COMPLETE
    if action == "complete":
        if (app.examStatus or "") in ("PASSED", "FAILED", "TERMINATED"):
            withheld = (
                exam_session is not None
                and exam_session.releaseMode == "MANUAL"
                and not is_released(exam_session)
            )
            if withheld:
                return Response({"alreadyCompleted": True, "resultsWithheld": True, "examStatus": "SUBMITTED"})
            return Response({
                "alreadyCompleted": True,
                "examStatus": app.examStatus,
                "score": app.examScore,
                "passed": (app.examStatus or "") == "PASSED",
            })
        graded = _grade_exam(app.id, questions, app.job.examPassMark)
        exam_status = "PASSED" if graded["passed"] else "FAILED"
        status_val = "EXAM_PASSED" if graded["passed"] else "EXAM_FAILED"

        app.examCompletedAt = timezone.now()
        app.examStatus = exam_status
        app.status = status_val
        app.examScore = graded["examScore"]
        app.save(update_fields=["examCompletedAt", "examStatus", "status", "examScore", "updatedAt"])

        # Configurable result visibility (Feature 3): MANUAL sessions hold the
        # score until the recruiter releases results, the release schedule
        # passes, or every qualified applicant has completed.
        withheld = bool(
            exam_session is not None
            and exam_session.releaseMode == "MANUAL"
            and not is_released(exam_session)
        )

        # Reporting & Decisioning — evaluation summary (match score, exam
        # score, full proctoring audit log) to the recruiter + result notice
        # (or withheld-submission confirmation) to the candidate.
        report_exam_evaluated(app, graded, withheld=withheld)
        audit(session["email"], "EXAM_COMPLETED", f"JobApplication:{app.id}", f"Score {graded['examScore']}% \u2192 {exam_status}")

        # auto-release when this submission was the last pending one
        release_if_due(exam_session)

        if withheld:
            return Response({"resultsWithheld": True, "examStatus": "SUBMITTED"})
        return Response({"examStatus": exam_status, "score": graded["examScore"], "passed": graded["passed"]})

    raise ApiError(400, f"Unknown action: {action}")
