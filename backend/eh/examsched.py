"""EthioHire — scheduled exam session helpers (Feature: Scheduled Text Exam
Engine + configurable result visibility).

Release rules (MANUAL mode):
  - Results become visible when ANY of these happens:
      a) the recruiter clicks "Release results"  -> resultsReleasedAt set
      b) the designated release schedule passes  -> releaseAt
  - IMMEDIATE mode is always visible right after submission.
  - NOTE: completing the exam never auto-releases MANUAL results — even when
    every qualified applicant has finished. "Manual" means the recruiter
    publishes (or the pre-set release schedule passes); this previously
    auto-published the moment the last candidate submitted, which leaked
    results recruiters had explicitly held.
"""
import datetime as _dt

from django.utils import timezone

from .common import audit, js_locale_datetime, notify
from .models import ExamSession, JobApplication


def due_for_release(session: ExamSession) -> bool:
    """True when a MANUAL session has satisfied its release condition but the
    flag has not been persisted yet. Explicit recruiter release (a) and the
    pre-set release schedule (b) are the only triggers — submission events
    never publish held results."""
    if session.releaseMode != "MANUAL" or session.resultsReleasedAt is not None:
        return False
    if session.releaseAt is not None and timezone.now() >= session.releaseAt:
        return True
    return False


def is_released(session: ExamSession) -> bool:
    """Whether candidates may currently see scores for this session."""
    if session is None:
        return True
    if session.releaseMode != "MANUAL":
        return True
    return session.resultsReleasedAt is not None or due_for_release(session)


def do_release(session: ExamSession, actor_email: str = "system") -> int:
    """Publish results: persist the flag and notify every completed candidate."""
    now = timezone.now()
    if session.resultsReleasedAt is None:
        session.resultsReleasedAt = now
        session.save(update_fields=["resultsReleasedAt", "updatedAt"])

    completed = JobApplication.objects.filter(
        job_id=session.job_id, preScreenPassed=True, examCompletedAt__isnull=False
    ).select_related("candidate", "job")
    from .notifications import report_exam_results_released

    for app in completed:
        report_exam_results_released(app)
    audit(
        actor_email, "EXAM_RESULTS_RELEASED",
        f"ExamSession:{session.job.title}",
        f"{completed.count()} candidate result(s) published",
    )
    return completed.count()


def release_if_due(session: ExamSession | None) -> ExamSession | None:
    """Auto-release hook — call after grading, before serializing results."""
    if session is not None and due_for_release(session):
        do_release(session)
    return session


def is_scheduled(session: ExamSession | None) -> bool:
    """Provisioned-but-not-yet-scheduled sessions (scheduledAt=None, created
    automatically with the job) behave like no session at all for candidates."""
    return session is not None and session.scheduledAt is not None


def window_end(session: ExamSession) -> _dt.datetime | None:
    """Close of the identical countdown window — None while unscheduled."""
    if session is None or session.scheduledAt is None:
        return None
    return session.scheduledAt + _dt.timedelta(minutes=session.durationMinutes)


def scheduling_notice(session: ExamSession) -> str:
    return (
        f"The assessment opens on {js_locale_datetime(session.scheduledAt)} and every "
        f"qualified candidate starts at the same moment with an identical "
        f"{session.durationMinutes}-minute countdown window."
    )


__all__ = [
    "due_for_release",
    "is_released",
    "is_scheduled",
    "do_release",
    "release_if_due",
    "window_end",
    "scheduling_notice",
]
