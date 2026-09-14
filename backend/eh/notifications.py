"""EthioHire — Reporting & Decisioning notifications (Resend).

Every decision point in the funnel emits an outbound notification:

    decision point              recipients            content
    --------------------------  --------------------  ------------------------------
    APPLICATION_RECEIVED        candidate + company   pre-screen outcome, match score
    EXAM_EVALUATED              company (report)      evaluation summary, match score,
                                                      exam score, FULL proctoring
                                                      audit log table
    EXAM_EVALUATED              candidate             score / withheld notice
    EXAM_RESULTS_RELEASED       candidate             published result
    INTERVIEW_SCHEDULED         candidate + company   time, format, join link
    INTERVIEW_COMPLETED         both parties          follow-up notice
    INTERVIEW_EVALUATED         candidate             overall interview score
    APPLICATION_SHORTLISTED     candidate             status change
    APPLICATION_REJECTED        candidate             status change + reason
    APPLICATION_HIRED           candidate             offer notice
    COMPANY_VERIFICATION        company               account change

Transport:
  - EMAIL -> Resend (https://api.resend.com/emails) when RESEND_API_KEY is set.
  - SMS   -> generic HTTP webhook adapter (SMS_HTTP_URL) because Resend is an
    email API; point the webhook at Twilio / Africa's Talking / etc.
  - Every attempt (SENT / FAILED / SKIPPED) is recorded in NotificationLog so
    admins get a delivery audit trail next to the funnel audit log.

All functions are fail-safe: a provider outage or misconfiguration must never
break the API request that triggered the notification.
"""
import html
import json
import os

import requests

from .models import CandidateProfile, Notification, NotificationLog

_RESEND_ENDPOINT = "https://api.resend.com/emails"
_TIMEOUT = 10  # seconds

BRAND = "EthioHire"
BRAND_COLOR = "#4f46e5"
BRAND_DARK = "#1e1b4b"


# ---------------------------------------------------------------- config

def email_config() -> tuple[str, str]:
    """(api_key, from_addr) — both may be empty strings."""
    api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    from_addr = (os.environ.get("EMAIL_FROM") or "").strip() or "EthioHire <onboarding@resend.dev>"
    return api_key, from_addr


def email_enabled() -> bool:
    return bool(email_config()[0])


def sms_config() -> tuple[str, str]:
    """(webhook_url, bearer_token) for the generic SMS adapter."""
    return (os.environ.get("SMS_HTTP_URL") or "").strip(), (os.environ.get("SMS_HTTP_TOKEN") or "").strip()


def app_url() -> str:
    return (os.environ.get("PUBLIC_APP_URL") or "http://localhost:3000").rstrip("/")


# ------------------------------------------------------------- provider

def _deliver_email(to: str, subject: str, html_body: str, decision_point: str, user_id=None) -> NotificationLog:
    """Send via Resend + persist the delivery attempt. Never raises."""
    api_key, from_addr = email_config()
    status, provider_id, error = "SKIPPED", None, None
    if not api_key:
        error = "RESEND_API_KEY is not set — email skipped (see docs/RESEND_SETUP.md)."
    elif not to:
        error = "Recipient has no email address on file."
    else:
        try:
            resp = requests.post(
                _RESEND_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": from_addr,
                    "to": [to],
                    "subject": subject,
                    "html": html_body,
                },
                timeout=_TIMEOUT,
            )
            data = _safe_json(resp)
            if 200 <= resp.status_code < 300:
                status = "SENT"
                provider_id = data.get("id") if isinstance(data, dict) else None
            else:
                status = "FAILED"
                error = f"Resend HTTP {resp.status_code}: {json.dumps(data)[:400]}"
        except Exception as exc:  # noqa: BLE001
            status = "FAILED"
            error = f"{type(exc).__name__}: {exc}"

    return NotificationLog.objects.create(
        user_id=user_id,
        decisionPoint=decision_point,
        channel="EMAIL",
        recipient=to or "(no address)",
        subject=subject[:300],
        status=status,
        providerId=provider_id,
        error=error,
    )


def _safe_json(resp) -> dict:
    try:
        return resp.json() or {}
    except Exception:  # noqa: BLE001
        return {"raw": resp.text[:400]}


def deliver_sms(to: str, text: str, decision_point: str, user_id=None) -> NotificationLog:
    """Generic SMS webhook adapter (Resend is email-only).

    SMS_HTTP_URL receives {"to": ..., "text": ...}; when SMS_HTTP_TOKEN is set
    an `Authorization: Bearer` header is attached. Point it at any gateway.
    """
    url, token = sms_config()
    status, provider_id, error = "SKIPPED", None, None
    if not url:
        error = "SMS_HTTP_URL is not set — SMS skipped (Resend is email-only; see docs/RESEND_SETUP.md)."
    elif not to:
        error = "Recipient has no phone number on file."
    else:
        try:
            headers = {"Content-Type": "application/json"}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            resp = requests.post(url, json={"to": to, "text": text[:1500]}, headers=headers, timeout=_TIMEOUT)
            if 200 <= resp.status_code < 300:
                status = "SENT"
            else:
                status = "FAILED"
                error = f"SMS gateway HTTP {resp.status_code}: {resp.text[:400]}"
        except Exception as exc:  # noqa: BLE001
            status = "FAILED"
            error = f"{type(exc).__name__}: {exc}"

    return NotificationLog.objects.create(
        user_id=user_id,
        decisionPoint=decision_point,
        channel="SMS",
        recipient=to or "(no phone)",
        subject=None,
        status=status,
        providerId=provider_id,
        error=error,
    )


# ------------------------------------------------------- resolution utils

def user_email(user_id) -> str:
    from .models import User

    u = User.objects.filter(id=user_id).first()
    return (u.email if u else "") or ""


def user_phone(user_id) -> str:
    from .models import User

    u = User.objects.filter(id=user_id).first()
    if u and u.phone:
        return u.phone
    cp = CandidateProfile.objects.filter(userId_id=user_id).first()
    return (cp.phone if cp else "") or ""


# ------------------------------------------------------------ in-app row

def _in_app(user_id, title, body) -> None:
    try:
        Notification.objects.create(user_id=user_id, title=title, body=body)
    except Exception as exc:  # noqa: BLE001
        print("[EthioHire] in-app notification failed:", exc)


def push(user_id, title, body=None, channel="IN_APP", decision_point="GENERAL", html_body=None, sms_text=None):
    """Create the in-app Notification row and, when the channel asks for it,
    also deliver EMAIL (Resend) / SMS (adapter) with a delivery log row.

    Returns the delivery log (or None for IN_APP / total failure) so callers
    can surface SENT / FAILED / SKIPPED states to the recruiter."""
    _in_app(user_id, title, body)
    try:
        if channel == "EMAIL":
            return _deliver_email(
                to=user_email(user_id),
                subject=title,
                html_body=html_body or simple_email(title, body or ""),
                decision_point=decision_point,
                user_id=user_id,
            )
        if channel == "SMS":
            return deliver_sms(to=user_phone(user_id), text=sms_text or body or title, decision_point=decision_point, user_id=user_id)
    except Exception as exc:  # noqa: BLE001
        print(f"[EthioHire] {channel} delivery failed ({decision_point}):", exc)
    return None


# ------------------------------------------------------------ HTML parts

def _esc(v) -> str:
    return html.escape(str(v if v is not None else ""))


def simple_email(title: str, body: str, cta_url: str = None, cta_label: str = None) -> str:
    """Plain branded email for short, single-message notifications."""
    rows = "".join(f"<p style='margin:0 0 12px'>{_esc(body).replace(chr(10), '<br/>')}</p>")
    return _shell(title, rows, cta_url, cta_label)


def _shell(title: str, content_html: str, cta_url: str = None, cta_label: str = None) -> str:
    cta = ""
    if cta_url:
        cta = (
            f"<a href='{_esc(cta_url)}' style='display:inline-block;background:{BRAND_COLOR};color:#ffffff;"
            f"text-decoration:none;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:600;"
            f"padding:11px 22px;border-radius:8px;margin:18px 0 6px'>{_esc(cta_label or 'Open EthioHire')}</a>"
        )
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:{BRAND_DARK};border-radius:12px 12px 0 0;padding:22px 28px">
    <span style="font-family:Segoe UI,Arial,sans-serif;font-size:19px;font-weight:800;color:#ffffff;letter-spacing:.3px">{BRAND}</span>
    <span style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#a5b4fc;padding-left:10px">Hire the best. Skip the noise.</span>
  </td></tr>
  <tr><td style="background:#ffffff;border-radius:0 0 12px 12px;padding:26px 28px;border:1px solid #e4e4ef;border-top:0">
    <h2 style="margin:0 0 16px;font-family:Segoe UI,Arial,sans-serif;font-size:17px;color:{BRAND_DARK}">{_esc(title)}</h2>
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.55;color:#33334d">{content_html}</div>
    {cta}
  </td></tr>
  <tr><td style="padding:14px 28px;font-family:Segoe UI,Arial,sans-serif;font-size:11px;color:#8a8aa8">
    Sent by {BRAND} — automated recruitment, pre-screening and interviews.
    This message is part of the platform's Reporting &amp; Decisioning audit trail.
  </td></tr>
</table>
</td></tr></table></body></html>"""


def _kv_row(label: str, value, color: str = "#33334d") -> str:
    return (
        f"<tr><td style='padding:7px 10px;border:1px solid #e4e4ef;font-family:Segoe UI,Arial,sans-serif;"
        f"font-size:13px;color:#8a8aa8;background:#fafafd;width:190px'>{_esc(label)}</td>"
        f"<td style='padding:7px 10px;border:1px solid #e4e4ef;font-family:Segoe UI,Arial,sans-serif;"
        f"font-size:13px;color:{color};font-weight:600'>{_esc(value)}</td></tr>"
    )


def _table(rows_html: str) -> str:
    return f"<table cellpadding='0' cellspacing='0' style='border-collapse:collapse;margin:6px 0 14px;width:100%'>{rows_html}</table>"


def _badge(text: str, ok: bool) -> str:
    color = "#0c7a43" if ok else "#b42318"
    bg = "#e7f6ee" if ok else "#fdeceb"
    return (f"<span style='display:inline-block;background:{bg};color:{color};font-family:Segoe UI,Arial,sans-serif;"
            f"font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px'>{_esc(text)}</span>")


# ------------------------------------------------- decision-point reports

def report_application_received(app, screening: dict) -> None:
    """APPLICATION_RECEIVED — candidate confirmation + company alert."""
    job = app.job
    passed = bool(screening.get("passed"))
    score = screening.get("matchScore", app.matchScore)
    reasons = screening.get("rejectReasons") or []

    candidate_rows = _table(
        _kv_row("Position", job.title)
        + _kv_row("Company", job.company.companyName)
        + _kv_row("Match score", f"{score}/100")
        + _kv_row("Pre-screening", "Passed — you qualified for the proctored assessment" if passed else "Not passed")
    )
    if passed:
        from .examsched import is_scheduled, scheduling_notice
        from .models import ExamSession

        session = ExamSession.objects.filter(job_id=job.id).first()
        # provisioned-but-unscheduled sessions behave like no session at all
        extra = scheduling_notice(session) if is_scheduled(session) else "You can now start the proctored online assessment."
        candidate_rows += (
            f"<p style='margin:0 0 12px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#33334d'>{_esc(extra)}</p>"
        )
    elif reasons:
        candidate_rows += (
            f"<p style='margin:0 0 12px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#33334d'>"
            f"Reason: {_esc('; '.join(reasons))}</p>"
        )
    push(
        app.candidate.userId_id,
        f"Application {'qualified' if passed else 'not successful'} — {job.title}",
        "You passed pre-screening and qualified for the proctored assessment."
        if passed
        else "Unfortunately your application did not pass pre-screening.",
        "EMAIL",
        decision_point="APPLICATION_RECEIVED",
        html_body=_shell(
            f"Application update — {job.title}",
            candidate_rows,
            cta_url=f"{app_url()}/#/candidate/applications",
            cta_label="Open my applications",
        ),
    )

    company_rows = _table(
        _kv_row("Candidate", app.candidate.fullName)
        + _kv_row("Email", app.candidate.userId.email)
        + _kv_row("Position", job.title)
        + _kv_row("Match score", f"{score}/100")
        + _kv_row("Pre-screening", _badge("PASSED" if passed else "REJECTED", passed))
    )
    if not passed and reasons:
        company_rows += (
            f"<p style='margin:0 0 12px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#33334d'>"
            f"Auto-reject reasons: {_esc('; '.join(reasons))}</p>"
        )
    push(
        job.company.userId_id,
        f"New pre-screened applicant — {job.title}" if passed else f"Pre-screening rejected an applicant — {job.title}",
        f"{app.candidate.fullName} — match score {score}/100.",
        "EMAIL",
        decision_point="APPLICATION_RECEIVED",
        html_body=_shell(
            f"New applicant — {job.title}",
            company_rows,
            cta_url=f"{app_url()}/#/recruiter/applicants",
            cta_label="Review applicants",
        ),
    )


def report_exam_evaluated(app, graded: dict, withheld: bool) -> None:
    """EXAM_EVALUATED — HR evaluation summary (match score + exam score +
    FULL proctoring audit log) and the candidate's result notification."""
    from .models import ProctoringLog

    job = app.job
    exam_status = app.examStatus or ("PASSED" if graded["passed"] else "FAILED")
    proctoring = list(ProctoringLog.objects.filter(application=app).order_by("createdAt"))
    violation_events = [p for p in proctoring if p.eventType != "SNAPSHOT"]

    # ---- company: full evaluation summary ----
    audit_rows = "".join(
        _kv_row(js_dt(p.createdAt), f"{p.eventType} — {p.details or 'no details'}")
        for p in proctoring[:40]
    ) or _kv_row("Audit trail", "No proctoring events were recorded.")
    if len(proctoring) > 40:
        audit_rows += _kv_row("…", f"{len(proctoring) - 40} more events in the application detail view")

    company_rows = _table(
        _kv_row("Candidate", app.candidate.fullName)
        + _kv_row("Position", job.title)
        + _kv_row("Match score", f"{app.matchScore}/100")
        + _kv_row("Exam score", f"{graded['examScore']}% (pass mark {job.examPassMark}%)")
        + _kv_row("Outcome", _badge(exam_status, graded["passed"]))
        + _kv_row("Violations", f"{len(violation_events)} event(s), {app.violationCount} counted serious")
    )
    if withheld:
        company_rows += (
            "<p style='margin:0 0 12px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#8a6d1f'>"
            "Results are held (MANUAL release mode) — candidates cannot see scores until you release them.</p>"
        )
    company_rows += (
        f"<p style='margin:14px 0 6px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;font-weight:700;color:{BRAND_DARK}'>"
        f"Proctoring audit log ({len(proctoring)} event{'' if len(proctoring) == 1 else 's'})</p>{_table(audit_rows)}"
    )
    push(
        job.company.userId_id,
        f"Assessment completed — {job.title}",
        f"{app.candidate.fullName} scored {graded['examScore']}% ({exam_status}). Full audit attached.",
        "EMAIL",
        decision_point="EXAM_EVALUATED",
        html_body=_shell("Evaluation summary", company_rows,
                         cta_url=f"{app_url()}/#/recruiter/applicants", cta_label="Open evaluation"),
    )

    # ---- candidate: result / withheld notice ----
    if withheld:
        push(
            app.candidate.userId_id,
            f"Assessment submitted — {job.title}",
            "Your answers were submitted successfully. The employer will publish results for all candidates together.",
            "EMAIL",
            decision_point="EXAM_EVALUATED",
            html_body=_shell(
                f"Assessment submitted — {job.title}",
                _table(_kv_row("Position", job.title) + _kv_row("Status", "Submitted — results withheld until release")),
                cta_url=f"{app_url()}/#/candidate/applications", cta_label="My applications",
            ),
        )
    else:
        msg = (
            f"You scored {graded['examScore']}% (pass mark {job.examPassMark}%). The employer can now schedule your live interview."
            if graded["passed"]
            else f"You scored {graded['examScore']}% — the pass mark was {job.examPassMark}%."
        )
        push(
            app.candidate.userId_id,
            f"Assessment {exam_status.lower()} — {job.title}",
            msg,
            "EMAIL",
            decision_point="EXAM_EVALUATED",
            html_body=_shell(
                f"Assessment result — {job.title}",
                _table(
                    _kv_row("Exam score", f"{graded['examScore']}%")
                    + _kv_row("Pass mark", f"{job.examPassMark}%")
                    + _kv_row("Outcome", _badge(exam_status, graded["passed"]))
                ),
                cta_url=f"{app_url()}/#/candidate/applications", cta_label="My applications",
            ),
        )


def report_exam_results_released(app) -> None:
    """EXAM_RESULTS_RELEASED — candidate sees published result."""
    passed = (app.examStatus or "") == "PASSED"
    push(
        app.candidate.userId_id,
        f"Exam results published — {app.job.title}",
        f"Your proctored assessment result is now available: {int(app.examScore or 0)}% ({'PASSED' if passed else 'NOT PASSED'}).",
        "EMAIL",
        decision_point="EXAM_RESULTS_RELEASED",
        html_body=_shell(
            f"Exam results published — {app.job.title}",
            _table(
                _kv_row("Exam score", f"{int(app.examScore or 0)}%")
                + _kv_row("Outcome", _badge("PASSED" if passed else "NOT PASSED", passed))
            ),
            cta_url=f"{app_url()}/#/candidate/applications", cta_label="View result",
        ),
    )


def report_interview_invitation(schedule, app) -> list:
    """INTERVIEW_SCHEDULED — candidate invite (with join link) + company copy.

    Returns [{recipient, role, status, error}] so slot generation can tell the
    recruiter exactly which notifications went out (or why they were skipped)."""
    from .common import js_locale_datetime
    from .livekit import is_configured as livekit_ready

    job = app.job
    when = js_locale_datetime(schedule.scheduledTime)
    end = (
        js_locale_datetime(schedule.scheduledTime + __import__("datetime").timedelta(minutes=schedule.slotDurationMinutes))
        if schedule.slotDurationMinutes
        else None
    )
    join_url = f"{app_url()}/#/interview-room/{schedule.id}"
    fmt_label = {"VIDEO": "Video call", "VOICE": "Voice call", "ONSITE": "On-site"}.get(schedule.format, schedule.format)
    via_livekit = livekit_ready() and schedule.format in ("VIDEO", "VOICE")

    cand_rows = _table(
        _kv_row("Position", job.title)
        + _kv_row("Company", job.company.companyName)
        + _kv_row("Format", fmt_label + (" — powered by LiveKit" if via_livekit else ""))
        + _kv_row("When", f"{when}" + (f" – {end}" if end else ""))
        + _kv_row("Interviewer", schedule.interviewerName or "EthioHire recruiter")
    )
    cand_log = push(
        app.candidate.userId_id,
        f"Interview scheduled — {job.title}",
        f"Your live {schedule.format.lower()} interview is set for {when}. Join from the Interviews page.",
        "EMAIL",
        decision_point="INTERVIEW_SCHEDULED",
        html_body=_shell(
            f"Interview invitation — {job.title}",
            cand_rows
            + (
                "<p style='margin:0 0 12px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#33334d'>"
                "The room opens right here in EthioHire — camera, microphone and in-room question display included."
                if via_livekit else
                "Open the Interviews page a few minutes before your slot."
            )
            + "</p>",
            cta_url=join_url, cta_label="Open interview room",
        ),
    )

    company_log = push(
        job.company.userId_id,
        f"Interview confirmed — {job.title}",
        f"Interview with {app.candidate.fullName} scheduled for {when}.",
        "EMAIL",
        decision_point="INTERVIEW_SCHEDULED",
        html_body=_shell(
            f"Interview confirmed — {job.title}",
            _table(
                _kv_row("Candidate", app.candidate.fullName)
                + _kv_row("Position", job.title)
                + _kv_row("When", f"{when}" + (f" – {end}" if end else ""))
                + _kv_row("Format", fmt_label)
            ),
            cta_url=f"{app_url()}/#/recruiter/interviews", cta_label="Open interviews",
        ),
    )
    return [
        {
            "recipient": user_email(app.candidate.userId_id) or "(no address)",
            "role": "CANDIDATE",
            "status": cand_log.status if cand_log else "SKIPPED",
            "error": cand_log.error if cand_log else "delivery unavailable",
        },
        {
            "recipient": user_email(job.company.userId_id) or "(no address)",
            "role": "RECRUITER",
            "status": company_log.status if company_log else "SKIPPED",
            "error": company_log.error if company_log else "delivery unavailable",
        },
    ]


def report_interview_completed(schedule, app, by_role: str) -> None:
    """INTERVIEW_COMPLETED."""
    from .common import js_locale_datetime

    title = app.job.title
    push(
        app.candidate.userId_id,
        f"Interview completed — {title}",
        "Your live interview was marked complete. The employer will follow up with a decision.",
        "EMAIL",
        decision_point="INTERVIEW_COMPLETED",
        html_body=_shell(
            f"Interview completed — {title}",
            _table(_kv_row("Position", title) + _kv_row("Date", js_locale_datetime(schedule.scheduledTime))),
            cta_url=f"{app_url()}/#/candidate/applications", cta_label="My applications",
        ),
    )
    if by_role != "RECRUITER":
        push(
            app.job.company.userId_id,
            f"Interview finished — {title}",
            f"{app.candidate.fullName} marked the interview as completed.",
            "EMAIL",
            decision_point="INTERVIEW_COMPLETED",
            html_body=_shell(
                f"Interview finished — {title}",
                _table(_kv_row("Candidate", app.candidate.fullName) + _kv_row("Position", title)),
                cta_url=f"{app_url()}/#/recruiter/applicants", cta_label="Review applicants",
            ),
        )


def report_interview_evaluated(schedule, app, evaluation, released: bool = True) -> None:
    """INTERVIEW_EVALUATED — end-of-interview candidate email.

    released=True  → the interviewer's summary WITH the overall score.
    released=False → completion notice only; the score is held by the job's
    result-release mode (AFTER_ALL / MANUAL) and follows later."""
    from .common import js_locale_datetime

    if released:
        push(
            app.candidate.userId_id,
            f"Interview evaluated — {app.job.title}",
            f"The interviewer submitted a structured evaluation. Overall score: {int(evaluation['overallScore'])}/100.",
            "EMAIL",
            decision_point="INTERVIEW_EVALUATED",
            html_body=_shell(
                f"Interview evaluation — {app.job.title}",
                _table(
                    _kv_row("Position", app.job.title)
                    + _kv_row("Interview date", js_locale_datetime(schedule.scheduledTime))
                    + _kv_row("Overall score", f"{int(evaluation['overallScore'])}/100")
                )
                + "<p style='margin:0 0 12px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#33334d'>"
                  "The employer will use this evaluation for the final decision.</p>",
                cta_url=f"{app_url()}/#/candidate/interviews", cta_label="View interviews",
            ),
        )
    else:
        push(
            app.candidate.userId_id,
            f"Interview completed — {app.job.title}",
            "Your live interview is complete and the interviewer's evaluation has been recorded. "
            "Results are published together for all candidates once the employer releases them — you will be notified.",
            "EMAIL",
            decision_point="INTERVIEW_EVALUATED",
            html_body=_shell(
                f"Interview completed — {app.job.title}",
                _table(
                    _kv_row("Position", app.job.title)
                    + _kv_row("Interview date", js_locale_datetime(schedule.scheduledTime))
                    + _kv_row("Status", _badge("EVALUATED — RESULT HELD", True))
                ),
                cta_url=f"{app_url()}/#/candidate/interviews", cta_label="View interviews",
            ),
        )


def report_interview_results_released(schedule, app, evaluation) -> None:
    """INTERVIEW_RESULTS_RELEASED — batch publish of a held evaluation."""
    from .common import js_locale_datetime

    push(
        app.candidate.userId_id,
        f"Interview results published — {app.job.title}",
        f"The employer published your interview result. Overall score: {int(evaluation['overallScore'])}/100.",
        "EMAIL",
        decision_point="INTERVIEW_RESULTS_RELEASED",
        html_body=_shell(
            f"Interview result — {app.job.title}",
            _table(
                _kv_row("Position", app.job.title)
                + _kv_row("Interview date", js_locale_datetime(schedule.scheduledTime))
                + _kv_row("Overall score", f"{int(evaluation['overallScore'])}/100")
            ),
            cta_url=f"{app_url()}/#/candidate/interviews", cta_label="View result",
        ),
    )


def report_status_change(app, new_status: str, reason: str = None, decision_point: str = "APPLICATION_STATUS") -> None:
    """APPLICATION_SHORTLISTED / APPLICATION_REJECTED / APPLICATION_HIRED."""
    job = app.job
    if new_status == "SHORTLISTED":
        title, headline = f"You were shortlisted — {job.title}", "The employer shortlisted your application after reviewing your assessment and proctoring audit."
    elif new_status == "HIRED":
        title, headline = f"Offer of employment — {job.title}", "Congratulations! The employer marked you as hired via EthioHire."
    else:
        title, headline = f"Application update — {job.title}", reason or "Unfortunately your application was not successful."

    rows = _table(
        _kv_row("Position", job.title)
        + _kv_row("Company", job.company.companyName)
        + _kv_row("Status", _badge(new_status, new_status in ("SHORTLISTED", "HIRED")))
        + _kv_row("Match score", f"{app.matchScore}/100")
        + (_kv_row("Exam score", f"{int(app.examScore or 0)}%") if app.examScore is not None else "")
    )
    if new_status == "REJECTED" and reason:
        rows += f"<p style='margin:0 0 12px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#33334d'>Reason: {_esc(reason)}</p>"
    push(
        app.candidate.userId_id,
        title,
        headline,
        "EMAIL",
        decision_point=decision_point,
        html_body=_shell(title, rows, cta_url=f"{app_url()}/#/candidate/applications", cta_label="My applications"),
    )


def js_dt(dt) -> str:
    from django.utils import timezone as dj_tz

    local = dt.astimezone(dj_tz.get_current_timezone()) if dj_tz.is_aware(dt) else dt
    return local.strftime("%b %d, %H:%M UTC")
