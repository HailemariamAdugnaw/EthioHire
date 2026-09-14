"""EthioHire — URL configuration (Django REST Framework)."""
from django.urls import path

from eh.views import applications, auth, banks, candidate, jobs, misc

urlpatterns = [
    path("api/", misc.api_root),
    path("api/health", misc.health),

    # Auth
    path("api/auth/config", auth.auth_config),
    path("api/auth/demo-login", auth.demo_login),
    path("api/auth/demo-register", auth.demo_register),
    path("api/auth/demo-logout", auth.demo_logout),
    path("api/auth/me", auth.auth_me),
    path("api/auth/firebase-sync", auth.firebase_sync),

    # Candidate
    path("api/candidate/profile", candidate.profile_view),
    path("api/candidate/documents", candidate.documents_view),
    path("api/candidate/references", candidate.references_view),

    # Jobs
    path("api/jobs", jobs.jobs_view),
    path("api/jobs/<str:job_id>", jobs.job_detail_view),
    path("api/jobs/<str:job_id>/apply", jobs.job_apply_view),
    path("api/jobs/<str:job_id>/questions", jobs.job_questions_view),

    # Scheduled text exam engine (session settings + result release)
    path("api/jobs/<str:job_id>/exam-session", jobs.exam_session_view),
    path("api/jobs/<str:job_id>/exam-session/release", jobs.exam_session_release_view),

    # Exam management module (standalone — decoupled from the job editor)
    path("api/exams", jobs.exams_overview_view),
    path("api/jobs/<str:job_id>/exam-questions", jobs.exam_questions_view),
    path("api/jobs/<str:job_id>/exam-rules", jobs.exam_rules_view),

    # Standalone interview resources — question banks + evaluation templates
    path("api/question-banks", banks.question_banks_view),
    path("api/question-banks/<str:bank_id>", banks.question_bank_detail_view),
    path("api/eval-templates", banks.eval_templates_view),
    path("api/eval-templates/<str:template_id>", banks.eval_template_detail_view),

    # Interview result release (AFTER_ALL / MANUAL modes)
    path("api/jobs/<str:job_id>/interview-results", jobs.interview_results_release_view),
    path("api/jobs/<str:job_id>/interview-results/release", jobs.interview_results_release_view),

    # Automated live interview time-slotting
    path("api/jobs/<str:job_id>/interview-slots", misc.interview_slots_view),

    # Applications + proctored exam engine
    path("api/applications", applications.applications_view),
    path("api/applications/<str:application_id>", applications.application_detail_view),
    path("api/applications/<str:application_id>/exam", applications.exam_view),

    # Interviews
    path("api/interviews", misc.interviews_view),
    path("api/interviews/<str:interview_id>", misc.interview_detail_view),
    path("api/interviews/<str:interview_id>/livekit", misc.interview_livekit_view),
    path("api/interviews/<str:interview_id>/evaluation", misc.interview_evaluation_view),
    path("api/interviews/<str:interview_id>/control", misc.interview_control_view),

    # Notifications
    path("api/notifications", misc.notifications_view),

    # Recruiter
    path("api/recruiter/company", misc.recruiter_company_view),

    # Admin
    path("api/admin/analytics", misc.admin_analytics),
    path("api/admin/companies", misc.admin_companies),
    path("api/admin/settings", misc.admin_settings),
    path("api/admin/audit", misc.admin_audit),
    path("api/admin/notification-logs", misc.admin_notification_logs),
]
