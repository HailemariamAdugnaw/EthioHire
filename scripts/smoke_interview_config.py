#!/usr/bin/env python3
"""Quick smoke test for Task 12 backend changes (interview config, release modes)."""
import json
import urllib.request

BASE = "http://127.0.0.1:8000"


def req(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("X-Session-Token", token)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


# 1. demo login as recruiter
s, d = req("POST", "/api/auth/demo-login", {"email": "hr@addistech.et", "password": "Demo123!"})
token = d.get("sessionToken")
print("login:", s, "token:", bool(token))

# 2. my jobs
s, d = req("GET", "/api/jobs?mine=1", token=token)
if s != 200:
    print("jobs failed:", s, d)
else:
    job = d["jobs"][0]
    print("jobs:", s, "first job:", job["title"], "| visibility:", job.get("interviewQuestionVisibility"), "| release:", job.get("interviewResultRelease"))

    # 3. job detail — should include interviewQuestions + scoringTemplate
    s, d = req("GET", f"/api/jobs/{job['id']}", token=token)
    print("detail:", s, "| interviewQuestions:", len(d["job"].get("interviewQuestions", [])), "| template:", json.dumps(d["job"].get("scoringTemplate"))[:120])

    # 4. PUT interview config
    s, d = req("PUT", f"/api/jobs/{job['id']}", {
        "interviewQuestionVisibility": "ALL",
        "interviewResultRelease": "MANUAL",
        "interviewQuestions": [
            {"questionText": "Walk me through a project you are proud of.", "guidance": "Look for ownership and metrics."},
            {"questionText": "How do you handle conflicting priorities?", "guidance": ""},
        ],
        "scoringTemplate": {
            "competencies": [{"label": "Ownership"}, {"label": "Communication"}, {"label": "SQL depth"}],
            "scaleMax": 4,
            "rateQuestions": False,
            "instructions": "Score honestly; add notes.",
        },
    }, token=token)
    print("PUT config:", s)
    s, d = req("GET", f"/api/jobs/{job['id']}", token=token)
    jt = d["job"]
    print("after PUT:", "| visibility:", jt.get("interviewQuestionVisibility"), "| release:", jt.get("interviewResultRelease"),
          "| IQs:", [(q["questionText"][:30], q["order"]) for q in jt.get("interviewQuestions", [])],
          "| tpl:", json.dumps(jt.get("scoringTemplate"))[:160])

    # 5. interview results release status
    s, d = req("GET", f"/api/jobs/{job['id']}/interview-results", token=token)
    print("interview-results GET:", s, d)
