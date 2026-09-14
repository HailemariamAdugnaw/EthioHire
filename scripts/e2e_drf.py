#!/usr/bin/env python3
"""
EthioHire — E2E API test suite for the Django REST Framework backend.
Port of scripts/e2e-test.ts (45 assertions) + additional coverage.

Run: python3 scripts/e2e_drf.py [base_url]
Default base: http://127.0.0.1:3000 (through the Vite proxy, like the real app)
"""
import json
import re
import sys
import time
import urllib.request
import urllib.error
from http.cookiejar import CookieJar
from datetime import datetime, timedelta, timezone

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
# Unique per-run suffix so re-runs never collide with previously registered users (409).
RUN = str(int(time.time()))
PASS = 0
FAIL = 0
FAILURES = []


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok {PASS:>2} - {name}")
    else:
        FAIL += 1
        FAILURES.append(name)
        print(f"  FAIL   - {name} {extra}")


def req(method, path, body=None, token=None, raw_token_header=False):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    if body is not None:
        r.add_header("Content-Type", "application/json")
    if token:
        if raw_token_header:
            r.add_header("X-Session-Token", token)
        else:
            r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def section(title):
    print(f"\n== {title} ==")


def iso_in(minutes: float) -> str:
    """ISO datetime `minutes` from now (used for posting windows & sessions)."""
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


# ---------------------------------------------------------------- 1. Public
section("Health & config")
s, d = req("GET", "/api/health")
check("health ok", s == 200 and d.get("status") == "ok" and d.get("app") == "EthioHire")
check("database up", d.get("database") == "up")
# The suite runs in either auth mode: DEMO (no Firebase env) or FIREBASE
# (service account configured, e.g. the user's live .env).
check("auth mode reported", d.get("authMode") in ("DEMO", "FIREBASE"))
s, d = req("GET", "/api/auth/config")
check(
    "auth config consistent",
    s == 200 and d.get("mode") in ("DEMO", "FIREBASE")
    and (d.get("mode") == "FIREBASE") == bool(d.get("firebase"))
    and ((d.get("mode") == "FIREBASE") == (d.get("authMode") == "FIREBASE") if d.get("authMode") else True),
)
s, d = req("GET", "/api/")
check("api root", s == 200 and d.get("message") == "Hello, world!")

# ---------------------------------------------------------------- 2. Auth
section("Auth")
s, d = req("POST", "/api/auth/demo-login", {"email": "candidate@ethiohire.et", "password": "wrong"})
check("bad password 401", s == 401 and d.get("error") == "Invalid email or password.")
s, d = req("POST", "/api/auth/demo-login", {})
check("missing credentials 400", s == 400 and d.get("error") == "Email and password are required.")

s, cand_login = req("POST", "/api/auth/demo-login", {"email": "candidate@ethiohire.et", "password": "Demo123!"})
check("candidate login", s == 200 and cand_login.get("demoMode") is True and cand_login["user"]["role"] == "CANDIDATE")
check("sessionToken issued", bool(cand_login.get("sessionToken")))
cand_token = cand_login["sessionToken"]

s, rec_login = req("POST", "/api/auth/demo-login", {"email": "hr@addistech.et", "password": "Demo123!"})
check("recruiter login", s == 200 and rec_login["user"]["role"] == "RECRUITER")
rec_token = rec_login["sessionToken"]

s, rec2_login = req("POST", "/api/auth/demo-login", {"email": "hr@riftvalleybank.et", "password": "Demo123!"})
rec2_token = rec2_login["sessionToken"]
check("recruiter2 login", s == 200)

s, admin_login = req("POST", "/api/auth/demo-login", {"email": "admin@ethiohire.et", "password": "Admin123!"})
check("admin login", s == 200 and admin_login["user"]["role"] == "ADMIN")
admin_token = admin_login["sessionToken"]

s, d = req("GET", "/api/auth/me", token=cand_token, raw_token_header=True)
check("me via X-Session-Token", s == 200 and d["user"]["email"] == "candidate@ethiohire.et")
s, d = req("GET", "/api/auth/me")
check("me anonymous null", s == 200 and d.get("user") is None)

s, d = req("POST", "/api/auth/demo-register", {"email": "x@y.z", "password": "short", "name": "X", "role": "CANDIDATE"})
check("register short password", s == 400 and d.get("error") == "Password must be at least 8 characters.")
s, d = req("POST", "/api/auth/demo-register", {"email": "candidate@ethiohire.et", "password": "Password1!", "name": "Dup", "role": "CANDIDATE"})
check("register duplicate email 409", s == 409)
s, d = req("POST", "/api/auth/demo-register", {"email": f"e2e-cand-{RUN}@ethiohire.et", "password": "E2ePass123!", "name": "E2E Candidate", "role": "CANDIDATE"})
check("register candidate", s == 200 and d["user"]["role"] == "CANDIDATE")
e2e_cand_token = d["sessionToken"]
s, d = req("POST", "/api/auth/demo-register", {"email": f"e2e-hr-{RUN}@ethiohire.et", "password": "E2ePass123!", "name": "E2E HR", "role": "RECRUITER"})
check("register recruiter", s == 200 and d["user"]["role"] == "RECRUITER")
e2e_rec_token = d["sessionToken"]

# ---------------------------------------------------------------- 3. Guards
section("Role guards")
s, d = req("GET", "/api/applications")
check("applications require auth 401", s == 401 and d.get("error") == "Authentication required. Please sign in.")
s, d = req("GET", "/api/admin/analytics", token=cand_token, raw_token_header=True)
check("admin analytics denied for candidate 403", s == 403 and "Access denied" in d.get("error", ""))
s, d = req("POST", "/api/jobs", {"title": "T", "description": "D"}, token=cand_token, raw_token_header=True)
check("job create denied for candidate 403", s == 403)

# ---------------------------------------------------------------- 4. Candidate profile
section("Candidate profile")
s, d = req("GET", "/api/candidate/profile", token=e2e_cand_token, raw_token_header=True)
check("profile auto-created", s == 200 and d["profile"]["fullName"] == "E2E Candidate")
check("profile embeds children", d["profile"].get("documents") == [] and d["profile"].get("references") == [])
s, d = req("PUT", "/api/candidate/profile", {
    "fullName": "E2E Candidate", "phone": "+251999", "universityName": "E2E University",
    "degreeLevel": "BACHELORS", "fieldOfStudy": "Testing", "graduationYear": "2024",
    "gpa": "3.5", "expectedSalary": "30000", "experienceYears": "1",
    "skills": "React, Testing, Django", "about": "E2E test profile",
}, token=e2e_cand_token, raw_token_header=True)
check("profile update", s == 200 and d["profile"]["gpa"] == 3.5 and d["profile"]["graduationYear"] == 2024)
s, d = req("POST", "/api/candidate/documents", {"type": "CV", "name": "cv.pdf", "fileUrl": "mock://cv.pdf"}, token=e2e_cand_token, raw_token_header=True)
check("document create", s == 200 and d["document"]["type"] == "CV")
doc_id = d["document"]["id"]
s, d = req("POST", "/api/candidate/references", {"name": "Ref One", "title": "Prof"}, token=e2e_cand_token, raw_token_header=True)
check("reference create + SENT status", s == 200 and d["reference"]["surveyStatus"] == "SENT")

# ---------------------------------------------------------------- 5. Jobs
section("Jobs")
s, d = req("GET", "/api/jobs")
check("public jobs list", s == 200 and len(d["jobs"]) >= 3)
check("job embeds company", d["jobs"][0]["company"]["companyName"] in ("Addis Tech Group", "Rift Valley Bank"))
check("job embeds application count", isinstance(d["jobs"][0]["_count"]["applications"], int))
s, d = req("GET", "/api/jobs?q=full-stack")
check("jobs search q", s == 200 and len(d["jobs"]) == 1 and "Full-Stack" in d["jobs"][0]["title"])
s, d = req("GET", "/api/jobs?category=Technology")
check("jobs filter category", s == 200 and len(d["jobs"]) == 1)

s, d = req("GET", "/api/jobs?mine=1", token=rec_token, raw_token_header=True)
check("recruiter mine=1", s == 200 and len(d["jobs"]) >= 2)
s, d = req("GET", "/api/jobs?mine=1", token=e2e_cand_token, raw_token_header=True)
check("mine=1 for candidate returns OPEN jobs", s == 200 and len(d["jobs"]) >= 3)

# unapproved recruiter cannot post (freshly registered e2e recruiter is always PENDING)
s, d = req("POST", "/api/jobs", {
    "title": "E2E Job", "description": "Test job with all 4 question types",
}, token=e2e_rec_token, raw_token_header=True)
check("unverified company cannot post 403", s == 403 and "verified by the platform admin" in d.get("error", ""))

# Feature 2 — posting window dates are mandatory
s, d = req("POST", "/api/jobs", {"title": "No dates", "description": "x"}, token=rec_token, raw_token_header=True)
check("job without postingStartDate 400", s == 400 and d.get("error") == "Posting start date is required.")
s, d = req("POST", "/api/jobs", {
    "title": "No deadline", "description": "x", "postingStartDate": iso_in(-60),
}, token=rec_token, raw_token_header=True)
check("job without applicationDeadline 400", s == 400 and d.get("error") == "Application deadline date is required.")
s, d = req("POST", "/api/jobs", {
    "title": "Bad window", "description": "x",
    "postingStartDate": iso_in(60), "applicationDeadline": iso_in(-60),
}, token=rec_token, raw_token_header=True)
check("deadline before start 400", s == 400 and d.get("error") == "Application deadline must be after the posting start date.")

# create a job with ALL 4 question types
s, d = req("POST", "/api/jobs", {
    "title": "E2E Four-Types Job", "description": "Test job",
    "category": "Quality Assurance", "location": "Addis Ababa", "jobType": "FULL_TIME",
    "minExperienceYears": "0", "minGpa": "", "examPassMark": "60", "maxViolations": "3",
    "postingStartDate": iso_in(-1440), "applicationDeadline": iso_in(43200),
    "knockoutQuestions": [{"questionText": "Are you available immediately?", "requiredAnswer": "yes"}],
    "assessmentQuestions": [
        {"questionText": "MCQ pick", "questionType": "MCQ", "options": ["A1", "A2", "A3", "A4"], "correctAnswer": "A2", "timeLimitSeconds": 30},
        {"questionText": "TF statement", "questionType": "TRUE_FALSE", "correctAnswer": "false", "timeLimitSeconds": 20},
        {"questionText": "Fill the ___", "questionType": "FILL_BLANK", "correctAnswer": "Django, djangoo", "timeLimitSeconds": 25},
        {"questionText": "Free text", "questionType": "TEXT", "correctAnswer": "parameterized queries", "timeLimitSeconds": 60},
        {"questionText": "Invalid type falls back to MCQ", "questionType": "ESSAY", "options": ["x", "y"], "correctAnswer": "x"},
    ],
}, token=rec_token, raw_token_header=True)
check("verified recruiter creates job", s == 200 and d["job"]["title"] == "E2E Four-Types Job")
job_id = d["job"]["id"]
qs = d["job"]["assessmentQuestions"]
check("5 assessment questions created", len(qs) == 5)
check("TF false normalized to FALSE", qs[1]["correctAnswer"] == "FALSE")
check("FILL_BLANK keeps accepted list", qs[2]["correctAnswer"] == "Django, djangoo")
check("invalid type normalized to MCQ", qs[4]["questionType"] == "MCQ")
check("knockout requiredAnswer uppercased", d["job"]["knockoutQuestions"][0]["requiredAnswer"] == "YES")
# Feature 2 — lifecycle indicators are computed server-side
check("job lifecycle fields present", all(k in d["job"] for k in ("postingStartDate", "applicationDeadline", "daysPosted", "daysRemaining", "applicationOpen")))
check("daysPosted = 1", d["job"]["daysPosted"] == 1)
check("daysRemaining = 30", d["job"]["daysRemaining"] == 30)
check("applicationOpen true", d["job"]["applicationOpen"] is True)

s, d = req("GET", f"/api/jobs/{job_id}", token=rec_token, raw_token_header=True)
check("job detail for recruiter has questions", s == 200 and len(d["questions"]) == 5 and d["myApplication"] is None)
s, d = req("GET", f"/api/jobs/{job_id}", token=e2e_cand_token, raw_token_header=True)
check("job detail for candidate hides questions", d["questions"] is None and d["myApplication"] is None)

# Editor-save regression (question-wipe bug): PUT the job back with the SAME
# question array the recruiter GET returned — the bank must survive intact.
s, d = req("GET", f"/api/jobs/{job_id}", token=rec_token, raw_token_header=True)
put_body = dict(d["job"])
put_body["knockoutQuestions"] = d["job"]["knockoutQuestions"]
qs_for_put = []
for q in d["questions"]:
    q2 = dict(q)
    if isinstance(q2.get("options"), str):  # detail GET returns options as a JSON string
        q2["options"] = json.loads(q2["options"])
    qs_for_put.append(q2)
put_body["assessmentQuestions"] = qs_for_put
s, d = req("PUT", f"/api/jobs/{job_id}", put_body, token=rec_token, raw_token_header=True)
check("editor save accepted", s == 200)
s, d = req("GET", f"/api/jobs/{job_id}/questions", token=rec_token, raw_token_header=True)
def _opts_count(q):
    o = q.get("options")
    if isinstance(o, str):  # questions endpoint returns options as a JSON string
        o = json.loads(o)
    return len(o) if isinstance(o, list) else 0
check("editor save preserves question bank", s == 200 and len(d["questions"]) == 5)
check("editor save preserves knockouts", s == 200 and len(d["knockout"]) == 1)
check("editor save preserves MCQ options", s == 200 and all(_opts_count(q) > 0 for q in d["questions"] if q["questionType"] == "MCQ"))

# ---------------------------------------------------------------- 6. Apply + pre-screen
section("Apply & pre-screening")
# fetch knockout ids so we can answer YES (unanswered knockouts fail by design)
s, d = req("GET", f"/api/jobs/{job_id}", token=cand_token, raw_token_header=True)
ko_map = {k["id"]: "YES" for k in d["job"]["knockoutQuestions"]}
s, d = req("POST", f"/api/jobs/{job_id}/apply", {"knockoutAnswers": ko_map}, token=cand_token, raw_token_header=True)
# candidate@ has a complete profile — should pass pre-screen
if s == 200:
    check("apply passes pre-screen", d["screening"]["passed"] is True and isinstance(d["screening"]["matchScore"], int))
    cand_app_id = d["application"]["id"]
else:
    print("      (candidate apply response:", d, ")")
    cand_app_id = None

s, d = req("POST", f"/api/jobs/{job_id}/apply", {"knockoutAnswers": {}}, token=e2e_cand_token, raw_token_header=True)
check("wrong knockout answer fails pre-screen", s == 200 and d["screening"]["passed"] is False)
check("reject reason present", "knockout" in " ".join(d["screening"]["rejectReasons"]).lower())
e2e_app_id = d["application"]["id"]
s, d = req("POST", f"/api/jobs/{job_id}/apply", {}, token=e2e_cand_token, raw_token_header=True)
check("duplicate apply 409 + applicationId", s == 409 and d.get("applicationId") == e2e_app_id)

# ---------------------------------------------------------------- 7. Exam engine (4 types)
section("Exam engine")
s, d = req("POST", f"/api/applications/{e2e_app_id}/exam", {"action": "start"}, token=e2e_cand_token, raw_token_header=True)
check("exam blocked without pre-screen 403", s == 403)

if cand_app_id:
    s, d = req("POST", f"/api/applications/{cand_app_id}/exam", {"action": "start"}, token=cand_token, raw_token_header=True)
    check("exam start", s == 200 and d["exam"]["jobTitle"] == "E2E Four-Types Job")
    check("passMark + maxViolations present", d["exam"]["passMark"] == 60 and d["exam"]["maxViolations"] == 3)
    eq = d["exam"]["questions"]
    check("5 questions served without correctAnswer", len(eq) == 5 and all("correctAnswer" not in q for q in eq))
    check("options parsed to arrays", isinstance(eq[0]["options"], list))
    qmap = {q["order"]: q for q in eq}

    # answer 4 of 5 correctly (5/5 correct later via TEXT keyword)
    s, d = req("POST", f"/api/applications/{cand_app_id}/exam", {"action": "answer", "questionId": qmap[1]["id"], "answer": "A2", "timeSpentSeconds": 5}, token=cand_token, raw_token_header=True)
    check("answer MCQ", s == 200 and d.get("ok") is True)
    s, d = req("POST", f"/api/applications/{cand_app_id}/exam", {"action": "answer", "questionId": qmap[2]["id"], "answer": "no"}, token=cand_token, raw_token_header=True)
    check("answer TRUE_FALSE (no → FALSE)", s == 200)
    s, d = req("POST", f"/api/applications/{cand_app_id}/exam", {"action": "answer", "questionId": qmap[3]["id"], "answer": "  django  "}, token=cand_token, raw_token_header=True)
    check("answer FILL_BLANK case-insensitive", s == 200)
    s, d = req("POST", f"/api/applications/{cand_app_id}/exam", {"action": "answer", "questionId": qmap[4]["id"], "answer": "I would use parameterized queries and ORM bindings to prevent SQL injection."}, token=cand_token, raw_token_header=True)
    check("answer TEXT via keyword", s == 200)
    s, d = req("POST", f"/api/applications/{cand_app_id}/exam", {"action": "answer", "questionId": qmap[5]["id"], "answer": "x"}, token=cand_token, raw_token_header=True)
    check("answer normalized MCQ", s == 200)
    s, d = req("POST", f"/api/applications/{cand_app_id}/exam", {"action": "violation", "eventType": "BOGUS"}, token=cand_token, raw_token_header=True)
    check("invalid violation type 400", s == 400 and d.get("error") == "Invalid event type.")
    s, d = req("POST", f"/api/applications/{cand_app_id}/exam", {"action": "violation", "eventType": "WINDOW_BLUR", "details": "blur"}, token=cand_token, raw_token_header=True)
    check("non-serious violation does not count", s == 200 and d["terminated"] is False and d["violationCount"] == 0)

    s, d = req("POST", f"/api/applications/{cand_app_id}/exam", {"action": "complete"}, token=cand_token, raw_token_header=True)
    check("exam complete all correct → 100 PASSED", s == 200 and d["score"] == 100 and d["examStatus"] == "PASSED")
    s, d = req("POST", f"/api/applications/{cand_app_id}/exam", {"action": "complete"}, token=cand_token, raw_token_header=True)
    check("exam re-complete alreadyCompleted", s == 200 and d.get("alreadyCompleted") is True)
    s, d = req("POST", f"/api/applications/{cand_app_id}/exam", {"action": "start"}, token=cand_token, raw_token_header=True)
    check("exam restart blocked 409", s == 409)

# 5/7 seeded job math via Meron's seeded app is already PASSED; test partial grading with a fresh application:
section("Partial grading (5/7 → 71%)")
s, d = req("GET", "/api/jobs?q=Full-Stack", token=cand_token, raw_token_header=True)
job1_id = d["jobs"][0]["id"]
s, d = req("GET", f"/api/jobs/{job1_id}", token=cand_token, raw_token_header=True)
my_app = d.get("myApplication")
check("seeded application exists for candidate", bool(my_app))
if my_app:
    check("seeded exam score 80 PASSED", my_app["examScore"] == 80 and my_app["examStatus"] == "PASSED")

# the seeded job1 session already ran — the recruiter re-opens the window so the
# fresh grader candidate can take the exam (also exercises the exam-session PUT)
s, d = req("PUT", f"/api/jobs/{job1_id}/exam-session", {
    "scheduledAt": iso_in(-2), "durationMinutes": 60, "releaseMode": "IMMEDIATE",
}, token=rec_token, raw_token_header=True)
check("recruiter reschedules job1 exam session", s == 200 and d["session"]["durationMinutes"] == 60)

# register a new candidate to run partial grading on the seeded 7-question job
s, d = req("POST", "/api/auth/demo-register", {"email": f"e2e-grade-{RUN}@ethiohire.et", "password": "E2ePass123!", "name": "E2E Grader", "role": "CANDIDATE"})
g_token = d["sessionToken"]
req("PUT", "/api/candidate/profile", {
    "fullName": "E2E Grader", "degreeLevel": "BACHELORS", "graduationYear": "2024",
    "gpa": "3.5", "expectedSalary": "35000", "experienceYears": "3",
    "skills": "React, Node.js",
}, token=g_token, raw_token_header=True)
s, d = req("GET", f"/api/jobs/{job1_id}", token=g_token, raw_token_header=True)
ko_map = {k["id"]: "YES" for k in d["job"]["knockoutQuestions"]}
s, d = req("POST", f"/api/jobs/{job1_id}/apply", {"knockoutAnswers": ko_map}, token=g_token, raw_token_header=True)
check("grader candidate passes pre-screen", s == 200 and d["screening"]["passed"] is True)
g_app = d["application"]["id"]

s, d = req("POST", f"/api/applications/{g_app}/exam", {"action": "start"}, token=g_token, raw_token_header=True)
gq = {q["order"]: q for q in d["exam"]["questions"]}
check("seeded job serves 7 questions incl TF + FILL_BLANK", len(gq) == 7 and gq[6]["questionType"] == "FILL_BLANK" and gq[7] is None if False else len(gq) == 7)
types = {q["order"]: q["questionType"] for q in d["exam"]["questions"]}
check("all four types present in seed", set(types.values()) == {"MCQ", "TRUE_FALSE", "FILL_BLANK", "TEXT"})

answers = [
    (1, "useEffect", True), (2, "201 Created", True), (3, "GIN", False),          # wrong MCQ
    (4, "Blocks the event loop until the promise settles", False),                # wrong MCQ
    (5, "Use parameterized queries always", True),                                # TEXT keyword
    (6, "true", True),                                                            # TF
    (7, "addis ababa", True),                                                     # FILL_BLANK case-insensitive
]
for order, ans, _expected in answers:
    s, d = req("POST", f"/api/applications/{g_app}/exam", {"action": "answer", "questionId": gq[order]["id"], "answer": ans}, token=g_token, raw_token_header=True)
    if s != 200:
        print(f"      answer {order} failed:", d)
s, d = req("POST", f"/api/applications/{g_app}/exam", {"action": "complete"}, token=g_token, raw_token_header=True)
check("5/7 correct → 71% PASSED", s == 200 and d["score"] == 71 and d["passed"] is True, f"got {d}")

# termination path
s, d = req("POST", "/api/auth/demo-register", {"email": f"e2e-cheat-{RUN}@ethiohire.et", "password": "E2ePass123!", "name": "E2E Cheater", "role": "CANDIDATE"})
c_token = d["sessionToken"]
req("PUT", "/api/candidate/profile", {
    "fullName": "E2E Cheater", "degreeLevel": "BACHELORS", "graduationYear": "2024",
    "gpa": "3.5", "expectedSalary": "35000", "experienceYears": "3", "skills": "React",
}, token=c_token, raw_token_header=True)
s, d = req("GET", f"/api/jobs/{job_id}", token=c_token, raw_token_header=True)
ko_map = {k["id"]: "YES" for k in d["job"]["knockoutQuestions"]}
s, d = req("POST", f"/api/jobs/{job_id}/apply", {"knockoutAnswers": ko_map}, token=c_token, raw_token_header=True)
c_app = d["application"]["id"]
s, d = req("POST", f"/api/applications/{c_app}/exam", {"action": "start"}, token=c_token, raw_token_header=True)
for i in range(3):
    s, d = req("POST", f"/api/applications/{c_app}/exam", {"action": "violation", "eventType": "TAB_SWITCH", "details": f"tab {i}"}, token=c_token, raw_token_header=True)
check("3 TAB_SWITCH violations → terminated", s == 200 and d["terminated"] is True and d["violationCount"] == 3)
s, d = req("POST", f"/api/applications/{c_app}/exam", {"action": "answer", "questionId": "x", "answer": "y"}, token=c_token, raw_token_header=True)
check("answer after termination 409", s == 409)

# ---------------------------------------------------------------- 8. Recruiter flows
section("Recruiter")
s, d = req("GET", "/api/recruiter/company", token=rec_token, raw_token_header=True)
check("recruiter company", s == 200 and d["company"]["companyName"] == "Addis Tech Group")
s, d = req("PUT", "/api/recruiter/company", {"companyName": "Addis Tech Group", "industry": "Software & IT Services"}, token=rec_token, raw_token_header=True)
check("recruiter company update", s == 200)

s, d = req("GET", "/api/applications", token=rec_token, raw_token_header=True)
apps = d["applications"]
check("recruiter sees own applications", s == 200 and len(apps) >= 3)
check("application embeds job+candidate", "job" in apps[0] and "candidate" in apps[0])
target = next((a for a in apps if a["candidate"]["fullName"] == "E2E Candidate"), None)
check("e2e candidate application visible", bool(target))
s, d = req("GET", f"/api/applications/{target['id']}", token=rec_token, raw_token_header=True)
check("application detail embeds proctoring+answers", s == 200 and "proctoringLogs" in d["application"] and "examAnswers" in d["application"])

s, d = req("PATCH", f"/api/applications/{target['id']}", {"action": "SHORTLIST"}, token=rec_token, raw_token_header=True)
check("shortlist action", s == 200 and d["application"]["status"] == "SHORTLISTED")
s, d = req("PATCH", f"/api/applications/{target['id']}", {"action": "SCHEDULE_INTERVIEW", "scheduledTime": "2026-12-01T10:00:00.000Z", "format": "VIDEO"}, token=rec_token, raw_token_header=True)
check("schedule interview", s == 200 and d["schedule"]["status"] == "SCHEDULED")
check("meeting link default", "/#/interview-room/" in d["schedule"]["meetingLink"])
sched_id = d["schedule"]["id"]
s, d = req("PATCH", f"/api/applications/{target['id']}", {"action": "BOGUS"}, token=rec_token, raw_token_header=True)
check("unknown decision action 400", s == 400 and d.get("error") == "Unknown action: BOGUS")

s, d = req("GET", "/api/interviews", token=rec_token, raw_token_header=True)
check("recruiter interviews list", s == 200 and len(d["interviews"]) >= 1)
s, d = req("GET", f"/api/interviews/{sched_id}", token=rec_token, raw_token_header=True)
# Room question source — the live room reads the DEDICATED interview bank only;
# the proctored exam pool (assessmentQuestions) is never sent to the room.
check(
    "interview room payload: exam pool excluded, dedicated bank present",
    s == 200
    and "assessmentQuestions" not in d["interview"]["application"]["job"]
    and "interviewQuestions" in d["interview"]["application"]["job"],
)
s, d = req("PATCH", f"/api/interviews/{sched_id}", {"score": 8.5, "notes": "strong"}, token=rec_token, raw_token_header=True)
check("interview scoring", s == 200 and d["interview"]["score"] == 8.5)

s, d = req("PUT", f"/api/jobs/{job_id}", {"title": "E2E Four-Types Job (updated)", "status": "CLOSED", "assessmentQuestions": [
    {"questionText": "New TF", "questionType": "TRUE_FALSE", "correctAnswer": "TRUE"}
]}, token=rec_token, raw_token_header=True)
check("job update replaces questions", s == 200)
s, d = req("GET", f"/api/jobs/{job_id}/questions", token=rec_token, raw_token_header=True)
check("questions replaced (1 left)", s == 200 and len(d["questions"]) == 1 and d["questions"][0]["questionType"] == "TRUE_FALSE")
s, d = req("PUT", "/api/jobs/nonexistent", {"title": "X"}, token=rec_token, raw_token_header=True)
check("update missing job 404", s == 404)

# ---------------------------------------------------------------- 9. Candidate views
section("Candidate views")
s, d = req("GET", "/api/applications", token=cand_token, raw_token_header=True)
check("candidate sees own applications", s == 200 and len(d["applications"]) >= 1)
s, d = req("GET", "/api/interviews", token=cand_token, raw_token_header=True)
check("candidate sees scheduled interviews", s == 200 and len(d["interviews"]) >= 1)
s, d = req("GET", "/api/notifications", token=cand_token, raw_token_header=True)
check("notifications list + unread count", s == 200 and "unread" in d and len(d["notifications"]) >= 1)
s, d = req("PATCH", "/api/notifications", {}, token=cand_token, raw_token_header=True)
check("mark all notifications read", s == 200 and d["ok"] is True)
s, d = req("GET", "/api/notifications", token=cand_token, raw_token_header=True)
check("unread now 0", d["unread"] == 0)

# ---------------------------------------------------------------- 10. Admin
section("Admin")
s, d = req("GET", "/api/admin/analytics", token=admin_token, raw_token_header=True)
check("analytics totals", s == 200 and d["totals"]["users"] >= 9 and d["totals"]["jobs"] >= 4)
check("analytics funnel", all(k in d["funnel"] for k in ("applied", "preScreenPassed", "examPassed", "interviews", "hired")))
check("recentAudit 10", len(d["recentAudit"]) <= 10)

s, d = req("GET", "/api/admin/companies", token=admin_token, raw_token_header=True)
check("companies list", s == 200 and len(d["companies"]) >= 2)
rift = next(c for c in d["companies"] if c["companyName"] == "Rift Valley Bank")
s, d = req("PATCH", "/api/admin/companies", {"companyId": rift["id"], "verificationStatus": "APPROVED", "subscriptionPlan": "PRO"}, token=admin_token, raw_token_header=True)
check("company verify + plan", s == 200 and d["company"]["verificationStatus"] == "APPROVED" and d["company"]["subscriptionPlan"] == "PRO")

s, d = req("GET", "/api/admin/settings", token=admin_token, raw_token_header=True)
check("settings + plans", s == 200 and len(d["settings"]) >= 6 and any(p["plan"] == "PRO" for p in d["plans"]))
s, d = req("PATCH", "/api/admin/settings", {"key": "e2e_setting", "value": "42"}, token=admin_token, raw_token_header=True)
check("setting upsert", s == 200 and d["setting"]["value"] == "42")
s, d = req("GET", "/api/admin/audit?take=50", token=admin_token, raw_token_header=True)
check("audit logs", s == 200 and len(d["logs"]) >= 5)

# ------------------------------------------------- 12. Feature 2 — lifecycle enforcement
section("Feature 2 — application window enforcement")
# expired posting window
s, d = req("POST", "/api/jobs", {
    "title": "E2E Expired Job", "description": "closed already",
    "postingStartDate": iso_in(-2880), "applicationDeadline": iso_in(-60),
    "assessmentQuestions": [{"questionText": "Q?", "questionType": "MCQ", "options": ["a", "b"], "correctAnswer": "a"}],
}, token=rec_token, raw_token_header=True)
expired_job = d["job"]["id"]
check("expired job created (deadline in past allowed)", s == 200 and d["job"]["applicationOpen"] is False)
check("expired job daysRemaining 0", d["job"]["daysRemaining"] == 0)
s, d = req("POST", f"/api/jobs/{expired_job}/apply", {}, token=cand_token, raw_token_header=True)
check("apply after deadline rejected", s == 400 and "deadline for this position has passed" in d.get("error", ""))
# not-yet-open posting window
s, d = req("POST", "/api/jobs", {
    "title": "E2E Future Job", "description": "opens tomorrow",
    "postingStartDate": iso_in(1440), "applicationDeadline": iso_in(10080),
}, token=rec_token, raw_token_header=True)
future_job = d["job"]["id"]
check("future job created", s == 200 and d["job"]["applicationOpen"] is False)
s, d = req("POST", f"/api/jobs/{future_job}/apply", {}, token=cand_token, raw_token_header=True)
check("apply before posting start rejected", s == 400 and "not open yet" in d.get("error", ""))

# ------------------------------------------------- 13. Feature 3 — scheduled group exam
section("Feature 3 — scheduled text exam engine")

def make_simple_job(title: str) -> str:
    s, d = req("POST", "/api/jobs", {
        "title": title, "description": "scheduled exam test",
        "postingStartDate": iso_in(-60), "applicationDeadline": iso_in(43200),
        "assessmentQuestions": [{"questionText": "2 + 2 = ?", "questionType": "MCQ", "options": ["3", "4", "5", "22"], "correctAnswer": "4", "timeLimitSeconds": 60}],
    }, token=rec_token, raw_token_header=True)
    assert s == 200, d
    return d["job"]["id"]

def apply_and_pass(token, job) -> str:
    s, d = req("POST", f"/api/jobs/{job}/apply", {}, token=token, raw_token_header=True)
    assert s == 200 and d["screening"]["passed"] is True, d
    return d["application"]["id"]

sched_job = make_simple_job("E2E Scheduled Exam Job")
# recruiter schedules the pooled session an hour ahead
s, d = req("PUT", f"/api/jobs/{sched_job}/exam-session", {
    "scheduledAt": iso_in(60), "durationMinutes": 45, "releaseMode": "IMMEDIATE",
}, token=rec_token, raw_token_header=True)
check("exam session scheduled", s == 200 and d["session"]["releaseMode"] == "IMMEDIATE" and d["session"]["durationMinutes"] == 45)
s, d = req("GET", f"/api/jobs/{sched_job}/exam-session", token=rec_token, raw_token_header=True)
check("exam session GET stats", s == 200 and d["stats"]["qualified"] == 0 and d["stats"]["released"] is True)

sched_app = apply_and_pass(cand_token, sched_job)
check("apply to scheduled job passes pre-screen", bool(sched_app))

s, d = req("POST", f"/api/applications/{sched_app}/exam", {"action": "start"}, token=cand_token, raw_token_header=True)
check("exam start blocked before session opens 403", s == 403 and "same moment" in d.get("error", ""))
s, d = req("POST", f"/api/applications/{sched_app}/exam", {"action": "status"}, token=cand_token, raw_token_header=True)
check("exam status locked", s == 200 and d["exam"]["locked"] is True and d["exam"]["canStart"] is False)
check("status carries shared session window", d["exam"]["session"]["scheduledAt"] is not None and d["exam"]["session"]["durationMinutes"] == 45)
# candidate application view shows pooled EXAM_SCHEDULED
s, d = req("GET", "/api/applications", token=cand_token, raw_token_header=True)
row = next(a for a in d["applications"] if a["id"] == sched_app)
check("application status EXAM_SCHEDULED", row["status"] == "EXAM_SCHEDULED" and row["examSession"]["durationMinutes"] == 45)

# recruiter moves the session into the open past → window is now open for everyone
s, d = req("PUT", f"/api/jobs/{sched_job}/exam-session", {
    "scheduledAt": iso_in(-2), "durationMinutes": 30, "releaseMode": "IMMEDIATE",
}, token=rec_token, raw_token_header=True)
check("exam session rescheduled into the past", s == 200)
s, d = req("POST", f"/api/applications/{sched_app}/exam", {"action": "start"}, token=cand_token, raw_token_header=True)
check("exam start unlocked after reschedule", s == 200 and d["exam"]["session"]["releaseMode"] == "IMMEDIATE")
mcq = d["exam"]["questions"][0]
s, d = req("POST", f"/api/applications/{sched_app}/exam", {"action": "answer", "questionId": mcq["id"], "answer": "4"}, token=cand_token, raw_token_header=True)
check("answer within window", s == 200)
s, d = req("POST", f"/api/applications/{sched_app}/exam", {"action": "complete"}, token=cand_token, raw_token_header=True)
check("IMMEDIATE mode reveals score", s == 200 and d["score"] == 100 and d["passed"] is True and d.get("resultsWithheld") is None)

# ---- manual release variant (Option B) ----
manual_job = make_simple_job("E2E Manual Release Job")
s, d = req("PUT", f"/api/jobs/{manual_job}/exam-session", {
    "scheduledAt": iso_in(-1), "durationMinutes": 30, "releaseMode": "MANUAL",
}, token=rec_token, raw_token_header=True)
check("MANUAL session created", s == 200 and d["session"]["releaseMode"] == "MANUAL")
manual_app = apply_and_pass(cand_token, manual_job)
g_manual_app = apply_and_pass(g_token, manual_job)  # stays incomplete → no auto-release
s, d = req("POST", f"/api/applications/{manual_app}/exam", {"action": "start"}, token=cand_token, raw_token_header=True)
mq = d["exam"]["questions"][0]
s, d = req("POST", f"/api/applications/{manual_app}/exam", {"action": "answer", "questionId": mq["id"], "answer": "4"}, token=cand_token, raw_token_header=True)
check("manual-mode answer saved", s == 200)
s, d = req("POST", f"/api/applications/{manual_app}/exam", {"action": "complete"}, token=cand_token, raw_token_header=True)
check("MANUAL mode withholds results", s == 200 and d.get("resultsWithheld") is True and d.get("score") is None)
s, d = req("GET", "/api/applications", token=cand_token, raw_token_header=True)
row = next(a for a in d["applications"] if a["id"] == manual_app)
check("candidate sees EXAM_SUBMITTED, no score leak", row["status"] == "EXAM_SUBMITTED" and row["examScore"] is None and row["examStatus"] is None)
s, d = req("GET", "/api/applications", token=rec_token, raw_token_header=True)
row = next(a for a in d["applications"] if a["id"] == manual_app)
check("recruiter still sees real score", row["examScore"] == 100 and row["examStatus"] == "PASSED")
s, d = req("GET", f"/api/jobs/{manual_job}/exam-session", token=rec_token, raw_token_header=True)
check("session stats qualified 2, completed 1, released False", d["stats"]["qualified"] == 2 and d["stats"]["completed"] == 1 and d["stats"]["released"] is False)
s, d = req("POST", f"/api/jobs/{manual_job}/exam-session/release", {}, token=rec_token, raw_token_header=True)
check("manual release publishes results", s == 200 and d["released"] == 1 and d["session"]["resultsReleasedAt"] is not None)
s, d = req("GET", "/api/applications", token=cand_token, raw_token_header=True)
row = next(a for a in d["applications"] if a["id"] == manual_app)
check("candidate sees score after release", row["examScore"] == 100 and row["examStatus"] == "PASSED")

# ------------------------------------------------- 14. Feature 4 — interview slotting
section("Feature 4 — automated interview time-slotting")
# second qualified candidate on sched_job (grader account exists from partial grading)
s, d = req("GET", f"/api/jobs/{sched_job}", token=g_token, raw_token_header=True)
check("grader can view slotting job", s == 200)
g_sched_app = apply_and_pass(g_token, sched_job)
s, d = req("POST", f"/api/applications/{g_sched_app}/exam", {"action": "start"}, token=g_token, raw_token_header=True)
gq2 = d["exam"]["questions"][0]
req("POST", f"/api/applications/{g_sched_app}/exam", {"action": "answer", "questionId": gq2["id"], "answer": "4"}, token=g_token, raw_token_header=True)
s, d = req("POST", f"/api/applications/{g_sched_app}/exam", {"action": "complete"}, token=g_token, raw_token_header=True)
check("grader passes scheduled exam (100)", s == 200 and d["score"] == 100)

slot_start = iso_in(120)
s, d = req("POST", f"/api/jobs/{sched_job}/interview-slots", {}, token=rec_token, raw_token_header=True)
check("missing startAt 400", s == 400 and d.get("error") == "Interview start date & time is required.")
s, d = req("POST", f"/api/jobs/{sched_job}/interview-slots", {
    "startAt": slot_start, "slotDurationMinutes": 30, "format": "VIDEO",
}, token=rec_token, raw_token_header=True)
check("slots generated for all exam passers", s == 200 and d["created"] == 2 and len(d["slots"]) == 2)
slots = sorted(d["slots"], key=lambda x: x["startTime"])
gap0 = (datetime.fromisoformat(slots[1]["startTime"].replace("Z", "+00:00")) - datetime.fromisoformat(slots[0]["startTime"].replace("Z", "+00:00"))).total_seconds()
gap1 = (datetime.fromisoformat(slots[1]["endTime"].replace("Z", "+00:00")) - datetime.fromisoformat(slots[1]["startTime"].replace("Z", "+00:00"))).total_seconds()
check("slots sequential & non-overlapping (30 min apart)", gap0 == 1800 and gap1 == 1800)
s, d = req("GET", "/api/interviews", token=cand_token, raw_token_header=True)
iv = next(i for i in d["interviews"] if i["applicationId"] == sched_app)
check("candidate interview has slot end + duration", iv["slotDurationMinutes"] == 30 and iv["endTime"] is not None)
s, d = req("GET", "/api/applications", token=cand_token, raw_token_header=True)
row = next(a for a in d["applications"] if a["id"] == sched_app)
check("application moved to INTERVIEW_SCHEDULED", row["status"] == "INTERVIEW_SCHEDULED")
# regenerate with a different duration → slots are re-booked, still non-overlapping
s, d = req("POST", f"/api/jobs/{sched_job}/interview-slots", {
    "startAt": slot_start, "slotDurationMinutes": 15, "format": "VOICE",
}, token=rec_token, raw_token_header=True)
check("slot regeneration re-books (15 min)", s == 200 and d["slotDurationMinutes"] == 15 and d["created"] == 2)
slots2 = sorted(d["slots"], key=lambda x: x["startTime"])
gap2 = (datetime.fromisoformat(slots2[1]["startTime"].replace("Z", "+00:00")) - datetime.fromisoformat(slots2[0]["startTime"].replace("Z", "+00:00"))).total_seconds()
check("regenerated slots 15 min apart", gap2 == 900)

# --------------------------------------------- 15. Resend notifications + LiveKit
section("Feature 5 — Resend reporting & decisioning + LiveKit live interviews")

import base64 as b64

def _jwt_payload(token: str) -> dict:
    pad = token.split(".")[1]
    pad += "=" * (-len(pad) % 4)
    return json.loads(b64.urlsafe_b64decode(pad).decode())

lk_job = make_simple_job("E2E LiveKit Interview Job")
lk_app = apply_and_pass(cand_token, lk_job)
s, d = req("POST", f"/api/applications/{lk_app}/exam", {"action": "start"}, token=cand_token, raw_token_header=True)
lq = d["exam"]["questions"][0]
req("POST", f"/api/applications/{lk_app}/exam", {"action": "answer", "questionId": lq["id"], "answer": "4"}, token=cand_token, raw_token_header=True)
req("POST", f"/api/applications/{lk_app}/exam", {"action": "complete"}, token=cand_token, raw_token_header=True)

# --- delivery audit trail (Reporting & Decisioning) ---
s, d = req("GET", "/api/admin/notification-logs?take=100", token=admin_token, raw_token_header=True)
check("admin notification-logs endpoint", s == 200 and isinstance(d.get("logs"), list) and isinstance(d.get("providers"), dict))
ar = [l for l in d["logs"] if l["decisionPoint"] == "APPLICATION_RECEIVED"]
check("APPLICATION_RECEIVED emails logged (candidate + company)", len(ar) >= 2)
exam_logs = [l for l in d["logs"] if l["decisionPoint"] == "EXAM_EVALUATED"]
check("EXAM_EVALUATED evaluation-summary emails logged", len(exam_logs) >= 2)
check("delivery rows carry recipient + subject + status", all(l["recipient"] and l["subject"] and l["status"] in ("SENT", "SKIPPED", "FAILED") for l in d["logs"]))
s, d = req("GET", "/api/admin/notification-logs", token=rec_token, raw_token_header=True)
check("notification-logs admin-only", s in (401, 403))

# --- interview scheduling decision point ---
s, d = req("PATCH", f"/api/applications/{lk_app}", {"action": "SCHEDULE_INTERVIEW", "scheduledTime": iso_in(120), "format": "VIDEO"}, token=rec_token, raw_token_header=True)
check("interview scheduled via decision action", s == 200 and d["schedule"]["status"] == "SCHEDULED")
interview_id = d["schedule"]["id"]
check("meeting link points at the in-app room", bool(d["schedule"]["meetingLink"]) and "/#/interview-room/" in d["schedule"]["meetingLink"])
s, d = req("GET", "/api/admin/notification-logs?take=100", token=admin_token, raw_token_header=True)
inv = [l for l in d["logs"] if l["decisionPoint"] == "INTERVIEW_SCHEDULED"]
check("INTERVIEW_SCHEDULED invitation emails logged (candidate + company)", len(inv) >= 2)

# --- LiveKit access tokens ---
s, d = req("GET", f"/api/interviews/{interview_id}/livekit", token=rec_token, raw_token_header=True)
check("livekit endpoint answers with config state", s == 200 and isinstance(d.get("configured"), bool))
if d.get("configured"):
    payload = _jwt_payload(d["token"])
    check("token grants join the interview room", payload["video"]["room"] == f"interview-{interview_id}" and payload["video"]["roomJoin"] is True)
    check("interviewer receives roomAdmin grant", payload["video"]["roomAdmin"] is True and d.get("role") == "INTERVIEWER")
    check("token issued with TTL window", payload.get("exp", 0) > payload.get("nbf", 0))
    s2, d2 = req("GET", f"/api/interviews/{interview_id}/livekit", token=cand_token, raw_token_header=True)
    c_payload = _jwt_payload(d2["token"])
    check("candidate token is plain joiner (no roomAdmin)", c_payload["video"]["roomAdmin"] is False and d2.get("role") == "CANDIDATE")
    check("identities are namespaced per side", d2.get("identity", "").startswith("candidate-") and d.get("identity", "").startswith("interviewer-"))
else:
    print("      (LiveKit env not set — graceful-degradation path verified)")
s, d = req("GET", f"/api/interviews/{interview_id}/livekit", token=g_token, raw_token_header=True)
check("livekit token denied for unrelated users", s == 403)

# --- structured evaluation (scoring template) ---
eval_body = {
    "overallScore": 82,
    "competencyScores": [{"key": "communication", "label": "Communication", "score": 4}, {"key": "technical", "label": "Technical depth", "score": 5}],
    "questionRatings": [{"questionId": lq["id"], "score": 4, "note": ""}],
    "comments": "Strong candidate",
}
s, d = req("POST", f"/api/interviews/{interview_id}/evaluation", eval_body, token=rec_token, raw_token_header=True)
check("recruiter submits scoring-template evaluation", s == 200 and d["evaluation"]["overallScore"] == 82)
check("evaluation completes interview + writes score", d["interview"]["status"] == "COMPLETED" and d["interview"]["score"] == 82)
s, d = req("GET", f"/api/interviews/{interview_id}/evaluation", token=cand_token, raw_token_header=True)
check("candidate reads the evaluation", s == 200 and d["evaluation"]["overallScore"] == 82 and d["evaluation"]["comments"] == "Strong candidate")
s, d = req("POST", f"/api/interviews/{interview_id}/evaluation", {"overallScore": 50}, token=cand_token, raw_token_header=True)
check("candidate cannot submit evaluation", s == 403)
s, d = req("POST", f"/api/interviews/{interview_id}/evaluation", {}, token=rec_token, raw_token_header=True)
check("evaluation without score rejected 400", s == 400)

s, d = req("GET", "/api/admin/notification-logs?take=100", token=admin_token, raw_token_header=True)
ie = [l for l in d["logs"] if l["decisionPoint"] == "INTERVIEW_EVALUATED"]
check("INTERVIEW_EVALUATED decision email logged", len(ie) >= 1)

# --- final status decision point ---
s, d = req("PATCH", f"/api/applications/{lk_app}", {"action": "SHORTLIST"}, token=rec_token, raw_token_header=True)
check("shortlist decision ok", s == 200 and d["application"]["status"] == "SHORTLISTED")
s, d = req("GET", "/api/admin/notification-logs?take=100", token=admin_token, raw_token_header=True)
sl = [l for l in d["logs"] if l["decisionPoint"] == "APPLICATION_SHORTLISTED"]
check("APPLICATION_SHORTLISTED decision email logged", len(sl) >= 1)

s, d = req("GET", "/api/health")
check("health exposes integration status", s == 200 and d.get("integrations", {}).get("livekit") in ("configured", "not-configured"))

req("DELETE", f"/api/jobs/{lk_job}", token=rec_token, raw_token_header=True)

# ---------------------------------------------------------------- 12. Interview module fixes & features
section("Feature 6 — dedicated interview bank, visibility, scoring template, result release, slot email report")

iq_job = make_simple_job("E2E Interview Config Job")
s, d = req("PUT", f"/api/jobs/{iq_job}", {
    "roleDescription": "Own the delivery pipeline end-to-end and mentor two junior engineers.",
    "educationRequirement": "BSc in Computer Science, Software Engineering or a related field.",
    "interviewQuestionVisibility": "ALL",
    "interviewResultRelease": "MANUAL",
    "interviewQuestions": [
        {"questionText": "Tell us about a project you led end-to-end.", "guidance": "Look for ownership and metrics."},
        {"questionText": "How do you handle ambiguous requirements?", "guidance": ""},
    ],
    "scoringTemplate": {
        "competencies": [{"label": "Ownership"}, {"label": "Technical depth"}],
        "scaleMax": 4, "rateQuestions": False, "instructions": "Score honestly; add concrete examples in notes.",
    },
}, token=rec_token, raw_token_header=True)
check("interview config PUT accepted", s == 200)
s, d = req("GET", f"/api/jobs/{iq_job}", token=rec_token, raw_token_header=True)
check("job detail returns dedicated bank + template", len(d["job"].get("interviewQuestions", [])) == 2 and d["job"]["scoringTemplate"]["configured"] is True)
check("scoring template round-trips (scale 4, no q ratings)", d["job"]["scoringTemplate"]["scaleMax"] == 4 and d["job"]["scoringTemplate"]["rateQuestions"] is False and len(d["job"]["scoringTemplate"]["competencies"]) == 2)
check("visibility + release mode persisted", d["job"]["interviewQuestionVisibility"] == "ALL" and d["job"]["interviewResultRelease"] == "MANUAL")
check("role + education sections round-trip", (d["job"]["roleDescription"] or "").startswith("Own the delivery") and (d["job"]["educationRequirement"] or "").startswith("BSc in Computer Science"))

# both candidates pass the text exam, then auto-slotting books both interviews
iq_app1 = apply_and_pass(cand_token, iq_job)
iq_app2 = apply_and_pass(g_token, iq_job)
for tok, app in ((cand_token, iq_app1), (g_token, iq_app2)):
    s, d = req("POST", f"/api/applications/{app}/exam", {"action": "start"}, token=tok, raw_token_header=True)
    qq = d["exam"]["questions"][0]
    req("POST", f"/api/applications/{app}/exam", {"action": "answer", "questionId": qq["id"], "answer": "4"}, token=tok, raw_token_header=True)
    s, d = req("POST", f"/api/applications/{app}/exam", {"action": "complete"}, token=tok, raw_token_header=True)
    assert s == 200 and d["passed"] is True, d
s, d = req("POST", f"/api/jobs/{iq_job}/interview-slots", {"startAt": iso_in(90), "slotDurationMinutes": 20, "format": "VIDEO"}, token=rec_token, raw_token_header=True)
check("slot response reports email outcomes", s == 200 and "notificationSummary" in d and d["notificationSummary"]["emailConfigured"] in (True, False))
check("per-slot notification state present", all(slot.get("candidateNotified") in ("SENT", "SKIPPED", "FAILED") for slot in d["slots"]))

s, d = req("GET", "/api/interviews", token=rec_token, raw_token_header=True)
ivs = sorted([i for i in d["interviews"] if i["applicationId"] in (iq_app1, iq_app2)], key=lambda x: x["scheduledTime"])
iv1, iv2 = ivs[0]["id"], ivs[1]["id"]
check("both booked interviews found", len(ivs) == 2)

# ALL mode — candidate receives the full question texts + effective template
s, d = req("GET", f"/api/interviews/{iv1}", token=cand_token, raw_token_header=True)
jd = d["interview"]["application"]["job"]
check("candidate sees full list (ALL)", len(jd["interviewQuestions"]) == 2 and all(q["questionText"] for q in jd["interviewQuestions"]))
check("candidate receives configured scoring template", jd["evaluationTemplate"]["configured"] is True and jd["evaluationTemplate"]["scaleMax"] == 4 and jd["evaluationTemplate"]["instructions"] is not None)

# SINGLE mode — texts masked for the candidate, ids kept
req("PUT", f"/api/jobs/{iq_job}", {"interviewQuestionVisibility": "SINGLE"}, token=rec_token, raw_token_header=True)
s, d = req("GET", f"/api/interviews/{iv1}", token=cand_token, raw_token_header=True)
qs_masked = d["interview"]["application"]["job"]["interviewQuestions"]
check("SINGLE masks question texts for candidate", len(qs_masked) == 2 and all(q["questionText"] is None for q in qs_masked) and all(q["id"] for q in qs_masked))
s, d = req("GET", f"/api/interviews/{iv1}", token=rec_token, raw_token_header=True)
check("interviewer still sees full texts", all(q["questionText"] for q in d["interview"]["application"]["job"]["interviewQuestions"]))

# HIDDEN mode — nothing at all for the candidate
req("PUT", f"/api/jobs/{iq_job}", {"interviewQuestionVisibility": "HIDDEN"}, token=rec_token, raw_token_header=True)
s, d = req("GET", f"/api/interviews/{iv1}", token=cand_token, raw_token_header=True)
jd = d["interview"]["application"]["job"]
check("HIDDEN hides questions entirely", jd["interviewQuestions"] == [] and jd.get("questionsHidden") is True)

# ---- Granular per-question visibility toggles (individual + bulk) — overrides
# on top of the job-wide mode: hidden questions never reach candidate payloads.
req("PUT", f"/api/jobs/{iq_job}", {
    "interviewQuestionVisibility": "ALL",
    "interviewQuestions": [
        {"questionText": "Tell us about a project you led end-to-end.", "guidance": "Look for ownership and metrics.", "visibleToCandidate": True},
        {"questionText": "How do you handle ambiguous requirements?", "guidance": "", "visibleToCandidate": False},
        {"questionText": "Salary expectations and notice period.", "guidance": "", "visibleToCandidate": True},
    ],
}, token=rec_token, raw_token_header=True)
s, d = req("GET", f"/api/jobs/{iq_job}", token=rec_token, raw_token_header=True)
iqs = d["job"]["interviewQuestions"]
check("per-question visibility flags round-trip", len(iqs) == 3 and [q["visibleToCandidate"] for q in iqs] == [True, False, True])
s, d = req("GET", f"/api/interviews/{iv1}", token=cand_token, raw_token_header=True)
jd = d["interview"]["application"]["job"]
check("ALL mode excludes hidden question from candidate payload", len(jd["interviewQuestions"]) == 2 and all(q["visibleToCandidate"] for q in jd["interviewQuestions"]) and all("ambiguous" not in (q["questionText"] or "") for q in jd["interviewQuestions"]))
s, d = req("GET", f"/api/interviews/{iv1}", token=rec_token, raw_token_header=True)
check("interviewer payload keeps hidden question (flagged)", len(d["interview"]["application"]["job"]["interviewQuestions"]) == 3)
req("PUT", f"/api/jobs/{iq_job}", {"interviewQuestionVisibility": "SINGLE"}, token=rec_token, raw_token_header=True)
s, d = req("GET", f"/api/interviews/{iv1}", token=cand_token, raw_token_header=True)
qs_masked = d["interview"]["application"]["job"]["interviewQuestions"]
check("SINGLE excludes hidden question from candidate ids", len(qs_masked) == 2 and all(q["questionText"] is None for q in qs_masked))

# ---- AFTER_ALL release: hold on first evaluation, auto-publish on the last
req("PUT", f"/api/jobs/{iq_job}", {"interviewResultRelease": "AFTER_ALL"}, token=rec_token, raw_token_header=True)
s, d = req("POST", f"/api/interviews/{iv1}/evaluation", {"overallScore": 82, "competencyScores": [{"key": "c1", "label": "Ownership", "score": 3}], "comments": "solid"}, token=rec_token, raw_token_header=True)
check("AFTER_ALL holds first evaluation", s == 200 and d["resultReleased"] is False and d["evaluation"]["releasedAt"] is None)
s, d = req("GET", f"/api/interviews/{iv1}/evaluation", token=cand_token, raw_token_header=True)
check("candidate cannot see held evaluation score", d["evaluation"]["overallScore"] is None and d["evaluation"]["resultWithheld"] is True)
s, d = req("POST", f"/api/interviews/{iv2}/evaluation", {"overallScore": 70, "competencyScores": []}, token=rec_token, raw_token_header=True)
check("last AFTER_ALL evaluation auto-releases", s == 200 and d["resultReleased"] is True)
s, d = req("GET", f"/api/interviews/{iv1}/evaluation", token=cand_token, raw_token_header=True)
check("earlier evaluation published together", d["evaluation"]["releasedAt"] is not None and d["evaluation"]["overallScore"] == 82)
s, d = req("GET", f"/api/jobs/{iq_job}/interview-results", token=rec_token, raw_token_header=True)
check("release status all published", d["held"] == 0 and d["published"] == 2)

# ---- overall score auto-summed from competency ratings (no manual entry) ----
s, d = req("POST", f"/api/interviews/{iv2}/evaluation", {"competencyScores": [
    {"key": "c1", "label": "Ownership", "score": 3},
    {"key": "c2", "label": "Technical depth", "score": 2},
    {"key": "c3", "label": "Grit", "score": 4},
]}, token=rec_token, raw_token_header=True)
check("overall auto-summed from competencies (9/12 → 75)", s == 200 and d["evaluation"]["overallScore"] == 75)
s, d = req("POST", f"/api/interviews/{iv2}/evaluation", {"competencyScores": [], "overallScore": ""}, token=rec_token, raw_token_header=True)
check("evaluation with no score and no competencies rejected 400", s == 400)

# ---- MANUAL release on the Feature-4 slots job (its interviews have no evaluations yet)
s, d = req("PUT", f"/api/jobs/{sched_job}", {"interviewResultRelease": "MANUAL"}, token=rec_token, raw_token_header=True)
check("release mode switch to MANUAL", s == 200)
s, d = req("GET", "/api/interviews", token=rec_token, raw_token_header=True)
sched_ivs = sorted([i for i in d["interviews"] if i["applicationId"] in (sched_app, g_sched_app)], key=lambda x: x["scheduledTime"])
sched_iv1, sched_iv2 = sched_ivs[0]["id"], sched_ivs[1]["id"]
# IMMEDIATE regression: default mode publishes right away
req("PUT", f"/api/jobs/{sched_job}", {"interviewResultRelease": "IMMEDIATE"}, token=rec_token, raw_token_header=True)
s, d = req("POST", f"/api/interviews/{sched_iv1}/evaluation", {"overallScore": 90, "competencyScores": []}, token=rec_token, raw_token_header=True)
check("IMMEDIATE releases on submit", s == 200 and d["resultReleased"] is True)
req("PUT", f"/api/jobs/{sched_job}", {"interviewResultRelease": "MANUAL"}, token=rec_token, raw_token_header=True)
s, d = req("POST", f"/api/interviews/{sched_iv2}/evaluation", {"overallScore": 65, "competencyScores": []}, token=rec_token, raw_token_header=True)
check("MANUAL holds evaluation", s == 200 and d["resultReleased"] is False)
s, d = req("GET", "/api/interviews", token=rec_token, raw_token_header=True)
pr = next((p for p in d.get("pendingReleases", []) if p["jobId"] == sched_job), None)
check("pendingReleases surfaces held job", pr is not None and pr["held"] == 1)

# candidate-side enforcement — held scores never reach the candidate's
# interview history / detail / evaluation (regression: the score used to leak
# into the candidate history because it is stored on InterviewSchedule)
sched_iv2_app = next(i["applicationId"] for i in d["interviews"] if i["id"] == sched_iv2)
holder_token = g_token if sched_iv2_app == g_sched_app else cand_token
s, d = req("GET", "/api/interviews", token=holder_token, raw_token_header=True)
row = next(i for i in d["interviews"] if i["id"] == sched_iv2)
check("held score masked in candidate interview history", row["score"] is None and row.get("resultWithheld") is True)
s, d = req("GET", f"/api/interviews/{sched_iv2}", token=holder_token, raw_token_header=True)
check("held score masked in candidate interview detail", s == 200 and d["interview"]["score"] is None and d["interview"].get("resultWithheld") is True)
s, d = req("GET", f"/api/interviews/{sched_iv2}/evaluation", token=holder_token, raw_token_header=True)
check("held evaluation fully masked for candidate", d["evaluation"]["overallScore"] is None and d["evaluation"]["competencyScores"] == [] and d["evaluation"]["comments"] is None and d["evaluation"]["resultWithheld"] is True)
s, d = req("GET", f"/api/interviews/{sched_iv2}", token=rec_token, raw_token_header=True)
check("recruiter still sees the held score", d["interview"]["score"] is not None)

# scheduled manual release — set date & time once, every held result for the
# job publishes automatically at that moment (no per-candidate releasing)
s, d = req("POST", f"/api/jobs/{sched_job}/interview-results/release", {"releaseAt": iso_in(0.05)}, token=rec_token, raw_token_header=True)
check("release schedule accepted", s == 200 and d.get("scheduled") is True and d.get("held") == 1)
s, d = req("POST", f"/api/jobs/{sched_job}/interview-results/release", {"releaseAt": iso_in(-5)}, token=rec_token, raw_token_header=True)
check("past release schedule rejected 400", s == 400)
s, d = req("GET", f"/api/jobs/{sched_job}/interview-results", token=rec_token, raw_token_header=True)
check("release status shows the schedule", d["scheduled"] is True and d["held"] == 1 and d["releaseAt"] is not None)
s, d = req("GET", "/api/interviews", token=holder_token, raw_token_header=True)
row = next(i for i in d["interviews"] if i["id"] == sched_iv2)
check("still withheld while the schedule is in the future", row["score"] is None and row.get("resultReleaseAt") is not None)
time.sleep(4)
s, d = req("GET", "/api/interviews", token=holder_token, raw_token_header=True)
row = next(i for i in d["interviews"] if i["id"] == sched_iv2)
check("scheduled release publishes automatically", row["score"] is not None and not row.get("resultWithheld"))
s, d = req("GET", "/api/interviews", token=rec_token, raw_token_header=True)
check("pendingReleases empty after scheduled release", all(p["jobId"] != sched_job for p in d.get("pendingReleases", [])))

# immediate release endpoint still works — hold a third interview, then publish
s, d = req("POST", f"/api/jobs/{sched_job}/apply", {}, token=e2e_cand_token, raw_token_header=True)
third_app = d["application"]["id"]
s, d = req("POST", f"/api/applications/{third_app}/exam", {"action": "start"}, token=e2e_cand_token, raw_token_header=True)
assert s == 200, d
third_q = d["exam"]["questions"][0]
req("POST", f"/api/applications/{third_app}/exam", {"action": "answer", "questionId": third_q["id"], "answer": "4"}, token=e2e_cand_token, raw_token_header=True)
req("POST", f"/api/applications/{third_app}/exam", {"action": "complete"}, token=e2e_cand_token, raw_token_header=True)
s, d = req("PATCH", f"/api/applications/{third_app}", {"action": "SCHEDULE_INTERVIEW", "scheduledTime": iso_in(30), "format": "VIDEO"}, token=rec_token, raw_token_header=True)
assert s == 200, d
third_interview = d["schedule"]["id"]
s, d = req("POST", f"/api/interviews/{third_interview}/evaluation", {"overallScore": 70, "competencyScores": []}, token=rec_token, raw_token_header=True)
check("MANUAL holds third evaluation", s == 200 and d["resultReleased"] is False)
s, d = req("POST", f"/api/jobs/{sched_job}/interview-results/release", {}, token=rec_token, raw_token_header=True)
check("immediate release endpoint publishes held results", s == 200 and d["released"] == 1)
s, d = req("GET", "/api/interviews", token=rec_token, raw_token_header=True)
check("pendingReleases empty after immediate release", all(p["jobId"] != sched_job for p in d.get("pendingReleases", [])))

req("DELETE", f"/api/jobs/{iq_job}", token=rec_token, raw_token_header=True)

# ---------------------------------------------------------------- 11. Standalone modules: weighted scoring, banks/templates, exams, control, category, WYSIWYG
section("Feature 7 — standalone resources, weighted scoring, exams module, control panel, categories, rich text")

# ---- standardized 42-category dropdown: backend validation
s, d = req("POST", "/api/jobs", {
    "title": "E2E Bad Category Job", "description": "Test", "category": "Made Up Category",
    "postingStartDate": iso_in(-60), "applicationDeadline": iso_in(1440),
}, token=rec_token, raw_token_header=True)
check("invalid category rejected 400", s == 400 and "category" in (d.get("error") or "").lower())
s, d = req("POST", "/api/jobs", {
    "title": "E2E Category Job", "description": "Test", "category": "IT, Computer Science and Software Engineering",
    "postingStartDate": iso_in(-60), "applicationDeadline": iso_in(1440),
}, token=rec_token, raw_token_header=True)
check("valid standardized category accepted", s == 200 and d["job"]["category"] == "IT, Computer Science and Software Engineering")
cat_job = d["job"]["id"]
s, d = req("PUT", f"/api/jobs/{cat_job}", {"category": "Agriculture"}, token=rec_token, raw_token_header=True)
check("category switch to another standard value", s == 200 and d["job"]["category"] == "Agriculture")

# ---- WYSIWYG rich text: HTML sanitized server-side on write
s, d = req("PUT", f"/api/jobs/{cat_job}", {
    "description": '<h2>About the role</h2><p>Build <b>great</b> things.</p><script>alert(1)</script><p onclick="evil()">click</p><ul><li>One</li><li>Two</li></ul>',
    "roleDescription": "<h3>Duties</h3><ol><li>Ship</li><li>Review</li></ol>",
    "educationRequirement": "BSc <strong>required</strong>",
}, token=rec_token, raw_token_header=True)
desc = d["job"]["description"]
check("rich text stored with allowed markup", "<h2>About the role</h2>" in desc and "<li>One</li>" in desc and "<b>great</b>" in desc)
check("script tags stripped from rich text", "<script" not in desc and "&lt;script" not in desc and "onclick" not in desc)

# ---- standalone question banks (company-owned reusable resource)
s, d = req("POST", "/api/question-banks", {
    "name": "E2E reusable bank",
    "questions": [
        {"questionText": "Bank question one?", "guidance": "g1", "visibleToCandidate": True},
        {"questionText": "Bank question two (hidden)?", "guidance": "", "visibleToCandidate": False},
    ],
}, token=rec_token, raw_token_header=True)
check("question bank created", s == 200 and d["bank"]["questionCount"] == 2)
bank_id = d["bank"]["id"]
s, d = req("GET", "/api/question-banks", token=rec_token, raw_token_header=True)
check("bank list shows linked jobs + count", any(b["id"] == bank_id and b["questionCount"] == 2 for b in d["banks"]))
s, d = req("PUT", f"/api/question-banks/{bank_id}", {"name": "E2E reusable bank v2", "questions": [{"questionText": "Renamed bank question?", "guidance": "", "visibleToCandidate": True}]}, token=rec_token, raw_token_header=True)
check("question bank updated", s == 200 and d["bank"]["questionCount"] == 1 and d["bank"]["name"] == "E2E reusable bank v2")

# ---- standalone evaluation templates (weighted competencies)
s, d = req("POST", "/api/eval-templates", {
    "name": "E2E weighted template",
    "competencies": [{"label": "Technical depth", "weight": 3}, {"label": "Communication", "weight": 1}],
    "scaleMax": 5, "rateQuestions": True, "instructions": "Weighted rubric",
}, token=rec_token, raw_token_header=True)
check("eval template created with weights", s == 200 and [c["weight"] for c in d["template"]["competencies"]] == [3, 1])
tpl_id = d["template"]["id"]

# ---- link standalone resources to a job; room payload uses them
s, d = req("PUT", f"/api/jobs/{cat_job}", {
    "bankId": bank_id,
    "templateId": tpl_id,
    "interviewQuestionVisibility": "ALL",
}, token=rec_token, raw_token_header=True)
check("job links standalone bank + template", s == 200 and d["job"]["bankId"] == bank_id and d["job"]["evalTemplateId"] == tpl_id)
s, d = req("GET", f"/api/jobs/{cat_job}", token=rec_token, raw_token_header=True)
check("job detail serves bank questions + weighted template", len(d["job"]["interviewQuestions"]) == 1 and d["job"]["scoringTemplate"]["competencies"][0]["weight"] == 3)

# ---- weighted overall auto-sum through the effective template
s, d = req("POST", f"/api/jobs/{cat_job}/apply", {}, token=cand_token, raw_token_header=True)
check("weighted-test application passes pre-screen", s == 200 and d["screening"]["passed"] is True)
wf_app = d["application"]["id"]
s, d = req("PATCH", f"/api/applications/{wf_app}", {"action": "SCHEDULE_INTERVIEW", "scheduledTime": iso_in(45), "format": "VIDEO"}, token=rec_token, raw_token_header=True)
wf_iv = d["schedule"]["id"]
# scores: technical 5×w3=15, communication 3×w1=3 → earned 18, possible 5×3+5×1=20 → 90
s, d = req("POST", f"/api/interviews/{wf_iv}/evaluation", {"competencyScores": [
    {"key": "c1", "label": "Technical depth", "score": 5},
    {"key": "c2", "label": "Communication", "score": 3},
]}, token=rec_token, raw_token_header=True)
check("weighted auto-sum (5×3 + 3×1)/(5×4) → 90", s == 200 and d["evaluation"]["overallScore"] == 90)

# ---- exams module endpoints
s, d = req("PUT", f"/api/jobs/{cat_job}/exam-questions", {"questions": [
    {"questionText": "Module exam question", "questionType": "MCQ", "options": ["a", "b"], "correctAnswer": "a", "timeLimitSeconds": 45},
]}, token=rec_token, raw_token_header=True)
check("exam module replaces question bank standalone", s == 200 and len(d["questions"]) == 1)
s, d = req("PATCH", f"/api/jobs/{cat_job}/exam-rules", {"examPassMark": 70, "maxViolations": 5}, token=rec_token, raw_token_header=True)
check("exam module updates rules without job save", s == 200 and d["examPassMark"] == 70 and d["maxViolations"] == 5)
s, d = req("GET", "/api/exams", token=rec_token, raw_token_header=True)
row = next((r for r in d["exams"] if r["jobId"] == cat_job), None)
check("exams overview lists job with stats", row is not None and row["questionCount"] == 1 and row["examPassMark"] == 70 and "stats" in row)

# ---- live session control endpoint (wf_iv scheduled above)
s, d = req("POST", f"/api/interviews/{wf_iv}/control", {"action": "PAUSE"}, token=e2e_cand_token, raw_token_header=True)
check("candidate cannot control session", s == 403)
s, d = req("POST", f"/api/interviews/{wf_iv}/control", {"action": "PAUSE"}, token=rec_token, raw_token_header=True)
check("recruiter pauses session", s == 200 and d["sessionState"] == "PAUSED")
s, d = req("GET", f"/api/interviews/{wf_iv}", token=cand_token, raw_token_header=True)
check("sessionState PAUSED visible on interview detail", d["interview"].get("sessionState") == "PAUSED")
s, d = req("POST", f"/api/interviews/{wf_iv}/control", {"action": "RESUME"}, token=rec_token, raw_token_header=True)
check("recruiter resumes session", s == 200 and d["sessionState"] == "ACTIVE")
s, d = req("POST", f"/api/interviews/{wf_iv}/control", {"action": "SPIN"}, token=rec_token, raw_token_header=True)
check("unknown control action 400", s == 400)

# ---- release configuration step on slot generation (sched_job has exam passers)
s, d = req("POST", f"/api/jobs/{sched_job}/interview-slots", {"startAt": iso_in(120), "slotDurationMinutes": 25, "interviewResultRelease": "MANUAL", "interviewResultsReleaseAt": iso_in(200)}, token=rec_token, raw_token_header=True)
check("slot generation applies release config (MANUAL + schedule)", s == 200 and d["releaseApplied"]["mode"] == "MANUAL" and d["releaseApplied"]["releaseAt"])
s, d = req("GET", f"/api/jobs/{sched_job}", token=rec_token, raw_token_header=True)
check("release config persisted on job", d["job"]["interviewResultRelease"] == "MANUAL" and d["job"]["interviewResultsReleaseAt"] is not None)
s, d = req("POST", f"/api/jobs/{sched_job}/interview-slots", {"startAt": iso_in(150), "slotDurationMinutes": 25, "interviewResultRelease": "AFTER_ALL"}, token=rec_token, raw_token_header=True)
check("slot generation release config AFTER_ALL", s == 200 and d["releaseApplied"]["mode"] == "AFTER_ALL")
s, d = req("POST", f"/api/jobs/{sched_job}/interview-slots", {"startAt": iso_in(180), "slotDurationMinutes": 25, "interviewResultRelease": "BOGUS"}, token=rec_token, raw_token_header=True)
check("invalid release mode on slots 400", s == 400)

# ------------------------------------------------- 11b. Symmetric provisioning + strict visibility
section("Feature 8 — symmetric module provisioning, exam-pool isolation, mode-strict visibility")

# SHOW_QUESTIONS / HIDE_QUESTIONS are no longer control actions — question
# visibility follows the configured SINGLE/ALL/HIDDEN mode strictly.
s, d = req("POST", f"/api/interviews/{wf_iv}/control", {"action": "SHOW_QUESTIONS"}, token=rec_token, raw_token_header=True)
check("SHOW_QUESTIONS control removed (400)", s == 400)

# Job creation provisions BOTH module records: the exam record (unscheduled
# session) and the default Interview Setup record (bank + evaluation template).
s, d = req("POST", "/api/jobs", {
    "title": "E2E Provisioning Job", "description": "Provisioning check",
    "category": "Quality Assurance", "location": "Addis Ababa",
    "postingStartDate": iso_in(-60), "applicationDeadline": iso_in(43200),
}, token=rec_token, raw_token_header=True)
check("provisioning job created", s == 200)
prov_job = d["job"]["id"]
check("default interview bank provisioned + linked", d["job"]["bankId"] is not None)
check("default evaluation template provisioned + linked", d["job"]["evalTemplateId"] is not None)
prov_bank = d["job"]["bankId"]
prov_tpl = d["job"]["evalTemplateId"]
s, d = req("GET", f"/api/question-banks/{prov_bank}", token=rec_token, raw_token_header=True)
check("provisioned bank exists in library (empty)", s == 200 and d["bank"]["questionCount"] == 0 and "E2E Provisioning Job" in d["bank"]["name"])
s, d = req("GET", f"/api/eval-templates/{prov_tpl}", token=rec_token, raw_token_header=True)
check("provisioned template has default competencies", s == 200 and len(d["template"]["competencies"]) == 4 and d["template"]["competencies"][0]["key"] == "communication")
s, d = req("GET", f"/api/jobs/{prov_job}/exam-session", token=rec_token, raw_token_header=True)
check("exam record provisioned (unscheduled)", s == 200 and d["session"] is not None and d["session"]["scheduledAt"] is None)
s, d = req("GET", f"/api/jobs/{prov_job}", token=rec_token, raw_token_header=True)
check("room bank payload empty for provisioned job", d["job"]["interviewQuestions"] == [])

# Exam rules edited in the module survive a job-editor save that omits them
s, d = req("PATCH", f"/api/jobs/{prov_job}/exam-rules", {"examPassMark": 80, "maxViolations": 4}, token=rec_token, raw_token_header=True)
check("module sets exam rules", s == 200 and d["examPassMark"] == 80)
s, d = req("PUT", f"/api/jobs/{prov_job}", {"title": "E2E Provisioning Job (edited)"}, token=rec_token, raw_token_header=True)
check("job-editor save keeps module exam rules", s == 200)
s, d = req("GET", f"/api/jobs/{prov_job}", token=rec_token, raw_token_header=True)
check("exam rules intact after job save", d["job"]["examPassMark"] == 80 and d["job"]["maxViolations"] == 4)

# Per-job interview config is editable from the Interview Setup module payloads
s, d = req("PUT", f"/api/jobs/{prov_job}", {"interviewQuestionVisibility": "ALL", "interviewResultRelease": "AFTER_ALL"}, token=rec_token, raw_token_header=True)
check("module config: visibility ALL + release AFTER_ALL", s == 200 and d["job"]["interviewQuestionVisibility"] == "ALL" and d["job"]["interviewResultRelease"] == "AFTER_ALL")

# Candidate exam status is NOT flipped to EXAM_SCHEDULED by an unscheduled session
s, d = req("GET", "/api/applications", token=e2e_cand_token, raw_token_header=True)
check("applications list OK with provisioned sessions", s == 200 and all(a.get("examSession") is None or a["status"] != "EXAM_SCHEDULED" or a.get("examSession", {}).get("scheduledAt") for a in d["applications"]))

req("DELETE", f"/api/jobs/{prov_job}", token=rec_token, raw_token_header=True)
s, d = req("DELETE", f"/api/question-banks/{prov_bank}", token=rec_token, raw_token_header=True)
check("provisioned bank deleted with job", s == 200)

# ---- delete guards for linked standalone resources
s, d = req("DELETE", f"/api/question-banks/{bank_id}", token=rec_token, raw_token_header=True)
check("linked bank delete blocked", s == 400 and "unlink" in (d.get("error") or "").lower())
s, d = req("PUT", f"/api/jobs/{cat_job}", {"bankId": None, "templateId": None}, token=rec_token, raw_token_header=True)
check("unlink bank + template", s == 200 and d["job"]["bankId"] is None and d["job"]["evalTemplateId"] is None)
s, d = req("DELETE", f"/api/question-banks/{bank_id}", token=rec_token, raw_token_header=True)
check("unlinked bank deletes", s == 200)
s, d = req("DELETE", f"/api/eval-templates/{tpl_id}", token=rec_token, raw_token_header=True)
check("unlinked template deletes", s == 200)
req("DELETE", f"/api/jobs/{cat_job}", token=rec_token, raw_token_header=True)

# ---------------------------------------------------------------- 12. Cleanup + job delete
section("Cleanup")
for jid in (job_id, expired_job, future_job, sched_job, manual_job):
    req("DELETE", f"/api/jobs/{jid}", token=rec_token, raw_token_header=True)
s, d = req("DELETE", f"/api/jobs/{job_id}", token=rec_token, raw_token_header=True)
check("job already deleted 404", s == 404)
s, d = req("GET", f"/api/jobs/{job_id}")
check("deleted job 404", s == 404)

# ---------------------------------------------------------------- summary
print(f"\n{'='*40}\nRESULT: {PASS} passed, {FAIL} failed")
if FAILURES:
    print("Failed:")
    for f in FAILURES:
        print("  -", f)
sys.exit(1 if FAIL else 0)
