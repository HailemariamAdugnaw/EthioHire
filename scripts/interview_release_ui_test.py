#!/usr/bin/env python3
"""
EthioHire — browser E2E: interview release schedule + job text sections.

Covers the UI surfaces:
  1. Job editor: "Role of the employee" + "Education requirements" rich-text
     sections round-trip to the API and re-render on reload. The MANUAL
     release picker lives in the Interview Setup module (Job configuration).
  2. Candidate interview history: a held (MANUAL) interview result shows the
     amber "Result withheld" badge INSTEAD of the score.
  3. Recruiter Interviews page: held results card offers the schedule picker;
     scheduling publishes automatically once the pre-set time passes.

Run: python3 scripts/interview_release_ui_test.py
"""
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
API = "http://127.0.0.1:3000"
SHOTS = "/home/z/my-project/scripts/ui-shots"
RUN = str(int(time.time()))

results = []
page_errors = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(f"  {'ok ' if cond else 'FAIL'} - {name} {extra if not cond else ''}")


def req(method, path, body=None, token=None):
    r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    if body is not None:
        r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("X-Session-Token", token)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def iso_in(minutes: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def ui_login(page, email, password):
    page.goto(f"{BASE}/#/login", wait_until="domcontentloaded")
    page.wait_for_selector("#email", timeout=30000)
    page.fill("#email", email)
    page.fill("#password", password)
    page.locator("#password").press("Enter")
    page.wait_for_selector("text=Welcome back", timeout=30000)


def main() -> int:
    import os

    os.makedirs(SHOTS, exist_ok=True)

    # ---------------- API setup ----------------
    _, rec_login = req("POST", "/api/auth/demo-login", {"email": "hr@addistech.et", "password": "Demo123!"})
    rec_token = rec_login["sessionToken"]
    _, cand_login = req("POST", "/api/auth/demo-login", {"email": "candidate@ethiohire.et", "password": "Demo123!"})
    cand_token = cand_login["sessionToken"]

    # remove leftovers from previous/failed runs of this suite (deterministic state)
    s, d = req("GET", "/api/jobs?mine=1", token=rec_token)
    for j in d.get("jobs", []):
        if j["title"].startswith("UI Release Job "):
            req("DELETE", f"/api/jobs/{j['id']}", token=rec_token)

    s, d = req("POST", "/api/jobs", {
        "title": f"UI Release Job {RUN}", "description": "release schedule + text sections browser test",
        "postingStartDate": iso_in(-5), "applicationDeadline": iso_in(1440),
        "assessmentQuestions": [
            {"questionText": "2 + 2 = ?", "questionType": "MCQ",
             "options": ["3", "4", "5", "22"], "correctAnswer": "4", "timeLimitSeconds": 90},
        ],
        "interviewResultRelease": "MANUAL",
    }, token=rec_token)
    assert s == 200, d
    job = d["job"]["id"]

    s, d = req("POST", f"/api/jobs/{job}/apply", {}, token=cand_token)
    assert s == 200 and d["screening"]["passed"], d
    app_id = d["application"]["id"]

    s, d = req("POST", f"/api/applications/{app_id}/exam", {"action": "start"}, token=cand_token)
    q = d["exam"]["questions"][0]
    req("POST", f"/api/applications/{app_id}/exam", {"action": "answer", "questionId": q["id"], "answer": "4"}, token=cand_token)
    req("POST", f"/api/applications/{app_id}/exam", {"action": "complete"}, token=cand_token)

    s, d = req("PATCH", f"/api/applications/{app_id}", {"action": "SCHEDULE_INTERVIEW",
                                                        "scheduledTime": iso_in(30), "format": "VIDEO"}, token=rec_token)
    assert s == 200, d
    interview_id = d["schedule"]["id"]
    # hold the evaluation in MANUAL mode
    s, d = req("POST", f"/api/interviews/{interview_id}/evaluation", {"overallScore": 78, "competencyScores": []}, token=rec_token)
    assert s == 200 and d["resultReleased"] is False, d
    print(f"setup ok — job {job}, interview {interview_id} held in MANUAL")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)

        # ================= 1. Job editor text sections + module release picker =================
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("pageerror", lambda e: page_errors.append(f"pageerror: {e}"))
        ui_login(page, "hr@addistech.et", "Demo123!")
        page.goto(f"{BASE}/#/recruiter/jobs/{job}/edit", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="j-role-editor"] .ql-editor', timeout=30000)
        check("job editor shows Role of the employee section", page.locator('[data-testid="j-role-editor"]').count() == 1)
        check("job editor shows Education requirements section", page.locator('[data-testid="j-edu-editor"]').count() == 1)
        page.locator('[data-testid="j-role-editor"] .ql-editor').fill("Own the checkout domain: day-to-day duties, ownership, reporting to the CTO.")
        page.locator('[data-testid="j-edu-editor"] .ql-editor').fill("BSc in Computer Science or equivalent; MSc is a plus.")
        # the release configuration is owned by the Interview Setup module now —
        # the job editor no longer embeds it
        check("job editor has no release picker (module owns it)", page.locator("#iv-release-at").count() == 0)
        page.screenshot(path=f"{SHOTS}/rel-job-editor.png")
        page.get_by_role("button", name="Save changes").click()
        page.wait_for_selector("text=Job updated", timeout=20000)
        # Interview Setup module — Job configuration tab reveals the MANUAL picker
        page.goto(f"{BASE}/#/recruiter/interview-setup", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="setup-tab-jobs"]', timeout=30000)
        page.locator('[data-testid="setup-tab-jobs"]').click()
        page.wait_for_selector(f'[data-testid="job-config-open-{job}"]', timeout=30000)
        page.locator(f'[data-testid="job-config-open-{job}"]').click()
        page.wait_for_selector('[data-testid="job-config-editor"]', timeout=30000)
        page.check("#jc-man")
        page.wait_for_selector('[data-testid="jc-release-at"]', timeout=10000)
        check("MANUAL mode reveals scheduled release picker in Interview Setup module", page.locator('[data-testid="jc-release-at"]').count() == 1)
        check("module config shows visibility modes", page.locator("#jc-single").count() == 1 and page.locator("#jc-all").count() == 1 and page.locator("#jc-hidden").count() == 1)
        page.screenshot(path=f"{SHOTS}/rel-module-config.png")
        s, d = req("GET", f"/api/jobs/{job}", token=rec_token)
        def _plain(html: str) -> str:
            import re as _re
            return _re.sub(r"<[^>]+>", "", html or "").strip()
        check("role + education persisted via UI save (rich text)",
              _plain(d["job"].get("roleDescription")).startswith("Own the checkout")
              and _plain(d["job"].get("educationRequirement")).startswith("BSc in Computer Science"))
        # reload — values must re-render
        page.goto(f"{BASE}/#/recruiter/jobs/{job}/edit", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="j-role-editor"] .ql-editor', timeout=30000)
        check("reloaded editor re-renders role section", "checkout domain" in page.locator('[data-testid="j-role-editor"] .ql-editor').inner_text())
        check("reloaded editor re-renders education section", "MSc is a plus" in page.locator('[data-testid="j-edu-editor"] .ql-editor').inner_text())

        # ================= 2. Candidate history shows withheld badge =================
        cand_ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        cand = cand_ctx.new_page()
        cand.on("pageerror", lambda e: page_errors.append(f"pageerror: {e}"))
        ui_login(cand, "candidate@ethiohire.et", "Demo123!")
        cand.goto(f"{BASE}/#/candidate/interviews", wait_until="domcontentloaded")
        cand.wait_for_selector('[data-testid="withheld-badge"]', timeout=30000)
        # the history may list several withheld interviews — scope to this job's card
        card = cand.locator("div.rounded-xl", has_text=f"UI Release Job {RUN}").first
        check("candidate history shows Result withheld badge", card.locator('[data-testid="withheld-badge"]').count() == 1)
        check("no score leaked on the withheld card", "Score:" not in card.inner_text())
        cand.screenshot(path=f"{SHOTS}/rel-candidate-withheld.png")

        # ================= 3. Recruiter schedules the release =================
        page.goto(f"{BASE}/#/recruiter/interviews", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="pending-releases"]', timeout=30000)
        row = page.locator('[data-testid="pending-releases"]')
        check("held results card lists the job", "UI Release Job" in row.inner_text())
        check("schedule picker present in held card", page.locator(f'[data-testid="release-at-{job}"]').count() == 1)
        check("release-now button present", page.locator(f'[data-testid="release-{job}"]').count() == 1)
        # schedule 45s in the future via the picker
        due = datetime.now() + timedelta(seconds=45)
        local = due.strftime("%Y-%m-%dT%H:%M:%S")
        page.fill(f'[data-testid="release-at-{job}"]', local)
        page.click(f'[data-testid="schedule-release-{job}"]')
        page.wait_for_selector("text=Release scheduled", timeout=15000)
        check("schedule toast shown", True)
        s, d = req("GET", f"/api/jobs/{job}/interview-results", token=rec_token)
        check("API reports scheduled release", d.get("scheduled") is True and d.get("releaseAt") is not None)
        page.screenshot(path=f"{SHOTS}/rel-recruiter-scheduled.png")
        cand.reload()
        card = cand.locator("div.rounded-xl", has_text=f"UI Release Job {RUN}").first
        card.locator('[data-testid="withheld-badge"]').wait_for(timeout=20000)
        check("candidate sees the scheduled release time", "releases" in card.locator('[data-testid="withheld-badge"]').inner_text())

        # wait for the pre-set moment, then the candidate's read publishes it
        time.sleep(47)
        s, d = req("GET", "/api/interviews", token=cand_token)
        row = next(i for i in d["interviews"] if i["id"] == interview_id)
        check("scheduled auto-release published the result", row["score"] is not None and not row.get("resultWithheld"))
        cand.reload()
        card = cand.locator("div.rounded-xl", has_text=f"UI Release Job {RUN}").first
        card.locator("text=Score:").wait_for(timeout=20000)
        check("candidate history now shows the score", "78" in card.inner_text())
        cand.screenshot(path=f"{SHOTS}/rel-candidate-released.png")

        browser.close()

    req("DELETE", f"/api/jobs/{job}", token=rec_token)

    print()
    failed = [r for r in results if not r[1]]
    print(f"RESULT: {len(results) - len(failed)}/{len(results)} passed" + (f", {len(failed)} failed" if failed else ""))
    if page_errors:
        print(f"page errors ({len(page_errors)}):")
        for e in page_errors[:10]:
            print("   ", e)
    return 1 if (failed or page_errors) else 0


if __name__ == "__main__":
    sys.exit(main())
