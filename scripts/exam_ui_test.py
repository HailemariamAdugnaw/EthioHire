#!/usr/bin/env python3
"""
EthioHire — exam room UI verification with fake webcam (4 question types).
Logs in as the pre-screened candidate, enters the proctored exam, verifies
MCQ / TRUE_FALSE / FILL_BLANK / TEXT renderers, answers everything, and
checks the completion flow.
"""
import json
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EMAIL = f"exam-ui-{int(time.time())}@test.et"  # self-bootstrapped per run
PASSWORD = "Test1234!"

results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(f"  {'ok ' if cond else 'FAIL'} - {name} {extra if not cond else ''}")


def api(method, path, body=None, token=None):
    r = urllib.request.Request(BASE + path, method=method)
    if body is not None:
        r.data = json.dumps(body).encode()
        r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("X-Session-Token", token)
    with urllib.request.urlopen(r, timeout=20) as resp:
        return json.loads(resp.read().decode() or "{}")


# ---------------- self-bootstrapping fixture ----------------
# (unique candidate + a job with the four question types + passed pre-screen,
#  so the test never depends on ambient seed state)
login = api("POST", "/api/auth/demo-login", {"email": "hr@addistech.et", "password": "Demo123!"})
rec = login["sessionToken"]
reg = api("POST", "/api/auth/demo-register", {
    "email": EMAIL, "password": PASSWORD, "name": "Exam UI Tester", "role": "CANDIDATE",
})
token = reg["sessionToken"]

from datetime import datetime, timedelta, timezone as _tz

d = api("POST", "/api/jobs", {
    "title": f"QA Engineer (Exam UI {int(time.time())})",
    "description": "four question types",
    "postingStartDate": (datetime.now(_tz.utc) - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    "applicationDeadline": (datetime.now(_tz.utc) + timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    "assessmentQuestions": [
        {"questionText": "Which HTTP method is idempotent?", "questionType": "MCQ",
         "options": ["GET", "POST", "PUT", "DELETE"], "correctAnswer": "PUT", "timeLimitSeconds": 60},
        {"questionText": "HyperText Transfer Protocol is what HTTP stands for.", "questionType": "TRUE_FALSE",
         "correctAnswer": "True", "timeLimitSeconds": 60},
        {"questionText": "Fill the blank: the Angular Http___ carries status and headers.", "questionType": "FILL_BLANK",
         "correctAnswer": "Response", "timeLimitSeconds": 60},
        {"questionText": "In one sentence: what does an ORM do?", "questionType": "TEXT",
         "correctAnswer": "maps", "timeLimitSeconds": 120},
    ],
}, token=rec)
assert "job" in d, d
exam_job = d["job"]["id"]
d = api("POST", f"/api/jobs/{exam_job}/apply", {}, token=token)
assert d["screening"]["passed"], d

# find the in-progress application for the 4-type job
apps = api("GET", "/api/applications", token=token)["applications"]
app = next(a for a in apps if a["job"]["title"].startswith("QA Engineer"))
exam = api("POST", f"/api/applications/{app['id']}/exam", {"action": "start"}, token=token)["exam"]
url = f"{BASE}/#/candidate/exam/{app['id']}"

with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
    ])
    ctx = browser.new_context(permissions=["camera"], viewport={"width": 1360, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script(f"window.localStorage.setItem('eh_session_token', '{token}')")
    page.goto(url)
    page.wait_for_timeout(2500)

    # webcam gate
    gate = page.get_by_role("button", name="Enable webcam & start exam")
    check("exam gate visible", gate.is_visible())
    gate.click()
    page.wait_for_timeout(3000)

    content = page.locator("body").inner_text()
    check("exam room entered", "Question" in content or "question" in content.lower(), content[:150])

    # Q1 — MCQ (radio options)
    q1 = page.get_by_text("Which HTTP method is idempotent?")
    check("MCQ question rendered", q1.count() > 0)
    radios = page.locator("[role=radio], input[type=radio]")
    check("MCQ has 4 radio options", radios.count() >= 4, f"count={radios.count()}")
    page.get_by_text("PUT", exact=True).first.click()
    page.wait_for_timeout(300)
    page.get_by_role("button", name="Save & continue").click()
    page.wait_for_timeout(1500)

    # Q2 — TRUE_FALSE
    content = page.locator("body").inner_text()
    check("TF question rendered", "HyperText Transfer Protocol" in content)
    tf_true = page.get_by_text("True", exact=True)
    check("TF True/False cards", tf_true.count() > 0)
    if tf_true.count():
        tf_true.first.click()
        page.wait_for_timeout(300)
        page.get_by_role("button", name="Save & continue").click()
        page.wait_for_timeout(1500)

    # Q3 — FILL_BLANK
    content = page.locator("body").inner_text()
    check("FILL_BLANK question rendered", "Http" in content and "___" in content)
    fb_input = page.locator("input[type=text], input:not([type])").last
    if fb_input.count():
        fb_input.fill("Response")
        page.wait_for_timeout(300)
        page.get_by_role("button", name="Save & continue").click()
        page.wait_for_timeout(1500)

    # Q4 — TEXT
    content = page.locator("body").inner_text()
    check("TEXT question rendered", "ORM" in content)
    ta = page.locator("textarea").last
    if ta.count():
        ta.fill("An ORM maps database rows to programming-language objects so developers query data without raw SQL.")
        page.wait_for_timeout(300)
        final = page.get_by_role("button", name="Submit exam")
        if final.count():
            final.first.click()
        else:
            page.get_by_role("button", name="Save & continue").click()
        page.wait_for_timeout(2500)

    content = page.locator("body").inner_text()
    import re
    m = re.search(r"(\d{1,3})\s*%", content)
    check("exam result shown", m is not None, content[-200:])
    if m:
        check("score 100%", m.group(1) == "100", f"score={m.group(1)}")

    check("no page errors", len(errors) == 0, "; ".join(errors[:2]))

    # verify server-side grading result
    apps2 = api("GET", "/api/applications", token=token)["applications"]
    app2 = next(a for a in apps2 if a["id"] == app["id"])
    check("server graded PASSED", app2["examStatus"] == "PASSED" and app2["examScore"] == 100,
          f"status={app2['examStatus']} score={app2['examScore']}")

    browser.close()

api("DELETE", f"/api/jobs/{exam_job}", token=rec)

fails = [r for r in results if not r[1]]
print(f"\nEXAM UI RESULT: {len(results) - len(fails)}/{len(results)} passed")
sys.exit(1 if fails else 0)
