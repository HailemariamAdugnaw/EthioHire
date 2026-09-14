#!/usr/bin/env python3
"""Delete leftover E2E/UI-test jobs + test users so seeded demo data is first."""
import os
import sys

import django

os.chdir("/home/z/my-project/backend")
sys.path.insert(0, "/home/z/my-project/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from eh.models import JobPosting, User, CandidateProfile  # noqa: E402

TEST_MARKERS = ("E2E ", "E2E-", "QA Engineer", "UI Test", "LiveKit Interview Job", "Interview Config Job")

removed = 0
for j in JobPosting.objects.all():
    if any(m in j.title for m in TEST_MARKERS):
        print(f"  deleting job: {j.title} (id={j.id})")
        j.delete()
        removed += 1
print(f"jobs removed: {removed}")

# leftover test users (e2e-* registrations, UI-test candidates)
test_users = User.objects.filter(email__regex=r"^(e2e-|fb-e2e|ui-test|cand-ui|kidus\+|grade-ui|cheat-ui|cand-|rec-|hr-)")
test_users = test_users | User.objects.filter(email__icontains="@uitest.et") | User.objects.filter(email__icontains="@e2e.et")
removed_u = 0
for u in test_users:
    if u.email in ("admin@ethiohire.et", "hr@addistech.et", "hr@riftvalleybank.et", "candidate@ethiohire.et"):
        continue
    print(f"  deleting user: {u.email}")
    u.delete()
    removed_u += 1
print(f"users removed: {removed_u}")
print("remaining jobs:", list(JobPosting.objects.values_list("title", flat=True)))
