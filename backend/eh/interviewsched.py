"""EthioHire — interview result release scheduling (Feature: scheduled manual
release + candidate-side enforcement).

Release rules for JobPosting.interviewResultRelease:
  - IMMEDIATE → the evaluation is published the moment the interviewer
    submits it (nothing to schedule).
  - AFTER_ALL → held until every interview for the job is completed, then
    published together (existing behaviour) OR earlier if the pre-set
    release schedule passes (safety net for interviews that never complete).
  - MANUAL    → held until the recruiter publishes them. Two triggers:
      a) the recruiter clicks "Release results" on the Interviews page
      b) the pre-set release schedule (interviewResultsReleaseAt) passes —
         the recruiter sets date & time once; every held result for the job
         publishes automatically at that moment. Submission events never
         publish held results.

Enforcement is server-side: while an evaluation is held, every candidate
payload (interview list, interview detail, evaluation GET) reports the
score as null + resultWithheld=true. The schedule is evaluated lazily on
read (no worker needed) — when the pre-set time has passed the held
evaluations are stamped releasedAt and the candidates are notified.
"""
import datetime as _dt

from django.utils import timezone

from .common import audit
from .models import InterviewEvaluation, InterviewSchedule, JobPosting


def release_due(job: JobPosting) -> bool:
    """True when the job's pre-set interview release schedule has passed."""
    ra = getattr(job, "interviewResultsReleaseAt", None)
    return ra is not None and timezone.now() >= ra


def evaluation_is_released(ev: InterviewEvaluation | None, job: JobPosting | None) -> bool:
    """Whether the candidate may currently see this evaluation's result."""
    if ev is None:
        return False
    if ev.releasedAt is not None:
        return True
    if job is not None and release_due(job):
        return True
    return False


def publish_due_results(job: JobPosting, actor_email: str = "system") -> int:
    """Lazy auto-publish — stamp + notify every held evaluation for a job when
    its pre-set release schedule has passed. Safe to call on any read path;
    returns the number of newly published results."""
    if job.interviewResultRelease not in ("MANUAL", "AFTER_ALL"):
        return 0
    if not release_due(job):
        return 0
    held = list(
        InterviewEvaluation.objects.filter(
            interview__application__job=job,
            releasedAt__isnull=True,
            interview__status="COMPLETED",
        ).select_related("interview__application__candidate", "interview__application__job")
    )
    if not held:
        return 0
    from .notifications import report_interview_results_released
    now = timezone.now()
    for ev in held:
        ev.releasedAt = now
        ev.save(update_fields=["releasedAt", "updatedAt"])
        report_interview_results_released(ev.interview, ev.interview.application, {"overallScore": ev.overallScore})
    audit(
        actor_email, "INTERVIEW_RESULTS_RELEASED", f"JobPosting:{job.title}",
        f"{len(held)} interview result(s) published by the pre-set schedule",
    )
    return len(held)


def mask_interview_for_candidate(data: dict, interview: InterviewSchedule) -> dict:
    """Enforce the release setting on a candidate-facing interview payload.

    While the evaluation is held (MANUAL/AFTER_ALL, not yet published and the
    release schedule has not passed) the interview score is masked — it used
    to leak into the candidate's interview history because the score is
    written onto InterviewSchedule when the interviewer submits the
    evaluation. Adds resultWithheld/resultReleaseAt so the UI can explain
    the hold."""
    job = interview.application.job
    if (job.interviewResultRelease or "IMMEDIATE").upper() == "IMMEDIATE":
        return data
    ev = InterviewEvaluation.objects.filter(interview=interview).first()
    if evaluation_is_released(ev, job):
        return data
    data = dict(data)
    data["score"] = None
    data["resultWithheld"] = True
    data["resultReleaseAt"] = _iso(job.interviewResultsReleaseAt)
    return data


def _iso(dt) -> str | None:
    if dt is None:
        return None
    import datetime as _d

    if dt.tzinfo is not None:
        dt = dt.astimezone(_d.timezone.utc).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def schedule_notice(job: JobPosting) -> str:
    return (
        f"Results publish automatically on {_iso(job.interviewResultsReleaseAt)} "
        f"(release mode: {(job.interviewResultRelease or 'IMMEDIATE').lower()})."
    )


__all__ = [
    "release_due",
    "evaluation_is_released",
    "publish_due_results",
    "mask_interview_for_candidate",
    "schedule_notice",
]
