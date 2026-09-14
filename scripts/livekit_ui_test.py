#!/usr/bin/env python3
"""
EthioHire — LiveKit live interview BROWSER E2E (two real browsers, real SFU).

Runs against the real local LiveKit server (scripts/livekit-server on :7880)
and the real Vite app on :3000. Headless Chromium has no camera devices, so
both sides exercise the room's graceful listen-only path (media failure ->
auto retry without publishing) — the real SFU connection, data-channel
question sync, scoring template and evaluation flow are all fully exercised.

  setup (API): job + question -> candidate applies -> passes exam -> VIDEO
               interview scheduled (meeting link = in-app room)
  1. recruiter logs in via UI, opens the room, joins with LiveKit
  2. candidate logs in via the SECOND browser context, joins the same room
  3. both show the "LiveKit connected" badge (real WebRTC connection)
  4. recruiter advances the question bank -> the candidate's current-question
     display updates over the LiveKit data channel (proves shared-room presence)
  5. recruiter submits the scoring template -> evaluation persisted, interview
     completed, INTERVIEW_EVALUATED notification logged

Run: python3 scripts/livekit_ui_test.py
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


def open_room_and_join(page, interview_id, shot):
    page.goto(f"{BASE}/#/interview-room/{interview_id}", wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="livekit-room"]', timeout=30000)
    page.wait_for_selector('[data-testid="join-livekit"]', timeout=15000)
    page.screenshot(path=f"{SHOTS}/{shot}-prejoin.png")
    page.click('[data-testid="join-livekit"]')


def main() -> int:
    import os

    os.makedirs(SHOTS, exist_ok=True)

    # ---------------- API setup ----------------
    _, rec_login = req("POST", "/api/auth/demo-login", {"email": "hr@addistech.et", "password": "Demo123!"})
    rec_token = rec_login["sessionToken"]
    _, cand_login = req("POST", "/api/auth/demo-login", {"email": "candidate@ethiohire.et", "password": "Demo123!"})
    cand_token = cand_login["sessionToken"]

    s, d = req("POST", "/api/jobs", {
        "title": f"UI LiveKit Job {RUN}", "description": "live interview browser test",
        "postingStartDate": iso_in(-5), "applicationDeadline": iso_in(1440),
        "assessmentQuestions": [
            {"questionText": "What is LiveKit used for?", "questionType": "MCQ",
             "options": ["Video interviews", "Email", "Billing"], "correctAnswer": "Video interviews",
             "timeLimitSeconds": 90},
            {"questionText": "Which protocol powers WebRTC media?", "questionType": "MCQ",
             "options": ["SRTP", "SMTP", "FTP"], "correctAnswer": "SRTP",
             "timeLimitSeconds": 90},
        ],
        # Feature 6 — dedicated live-interview bank (separate from the exam
        # bank) with SINGLE visibility; the room must drive THESE questions.
        "interviewQuestions": [
            {"questionText": "Walk me through a real-time media project you built.", "guidance": "WebRTC, SFU vs P2P, TURN"},
            {"questionText": "How do you handle flaky user networks during a call?", "guidance": "ICE restarts, simulcast, degradation"},
        ],
        "interviewQuestionVisibility": "SINGLE",
    }, token=rec_token)
    assert s == 200, d
    job = d["job"]["id"]

    s, d = req("POST", f"/api/jobs/{job}/apply", {}, token=cand_token)
    assert s == 200 and d["screening"]["passed"], d
    app_id = d["application"]["id"]

    s, d = req("POST", f"/api/applications/{app_id}/exam", {"action": "start"}, token=cand_token)
    questions = d["exam"]["questions"]
    for q, ans in zip(questions, ["Video interviews", "SRTP"]):
        req("POST", f"/api/applications/{app_id}/exam", {"action": "answer", "questionId": q["id"], "answer": ans}, token=cand_token)
    s, d = req("POST", f"/api/applications/{app_id}/exam", {"action": "complete"}, token=cand_token)
    assert s == 200 and d.get("passed"), d

    s, d = req("PATCH", f"/api/applications/{app_id}", {"action": "SCHEDULE_INTERVIEW",
                                                        "scheduledTime": iso_in(30), "format": "VIDEO"}, token=rec_token)
    assert s == 200, d
    interview_id = d["schedule"]["id"]
    s, d = req("GET", f"/api/applications/{app_id}", token=rec_token)
    candidate_name = d["application"]["candidate"]["fullName"]
    print(f"setup ok — interview {interview_id}, candidate {candidate_name}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=[
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-capture",
        ])
        rec_ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        cand_ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        rec = rec_ctx.new_page()
        cand = cand_ctx.new_page()
        for p in (rec, cand):
            p.on("pageerror", lambda e: page_errors.append(f"pageerror: {e}"))

        # ---- 1. recruiter joins ----
        ui_login(rec, "hr@addistech.et", "Demo123!")
        open_room_and_join(rec, interview_id, "lk-rec")
        rec.wait_for_selector("text=LiveKit connected", timeout=45000)
        check("recruiter LiveKit connection established", True)
        check("recruiter sees question bank", rec.locator('[data-testid="question-bank"]').count() == 1)
        check("recruiter sees scoring template", rec.locator('[data-testid="scoring-template"]').count() == 1)

        # ---- 2. candidate joins the same room ----
        ui_login(cand, "candidate@ethiohire.et", "Demo123!")
        open_room_and_join(cand, interview_id, "lk-cand")
        cand.wait_for_selector("text=LiveKit connected", timeout=45000)
        check("candidate LiveKit connection established", True)
        check("candidate has finish-session panel", cand.locator('[data-testid="candidate-complete"]').count() == 1)

        time.sleep(3)  # let the SFU settle
        rec.screenshot(path=f"{SHOTS}/lk-rec-room.png")
        cand.screenshot(path=f"{SHOTS}/lk-cand-room.png")

        # ---- 4. question bank sync over the data channel ----
        q1 = rec.locator('[data-testid="current-question"]').inner_text()
        c_q1 = cand.locator('[data-testid="current-question"]').inner_text()
        check("initial question matches on both screens", q1.strip()[:20] == c_q1.strip()[:20])
        rec.click('[aria-label="Next question"]')
        time.sleep(1.5)
        q2 = rec.locator('[data-testid="current-question"]').inner_text()
        c_q2 = cand.locator('[data-testid="current-question"]').inner_text()
        check("recruiter advanced to question 2", "2" in rec.locator('[data-testid="question-progress"]').inner_text())
        check("candidate question display synced via data channel", q2.strip()[:20] == c_q2.strip()[:20],
              f"rec={q2[:40]!r} cand={c_q2[:40]!r}")

        # ---- 5. scoring template submission (overall auto-summed from competencies) ----
        rec.locator('[data-testid="scoring-template"] [aria-label="Technical depth 5"]').first.click()
        rec.locator('[data-testid="scoring-template"] [aria-label="Communication 4"]').first.click()
        time.sleep(0.3)
        auto_txt = rec.locator('[data-testid="overall-auto"]').inner_text()
        check("overall auto-summed (9/20 → 45, no manual entry)", "45" in auto_txt, f"display={auto_txt!r}")
        rec.fill("#lk-comments", "Great comms, deep technical knowledge.")
        rec.click('[data-testid="submit-evaluation"]')
        rec.wait_for_selector("text=Evaluation submitted", timeout=20000)
        check("evaluation submitted toast", True)
        rec.wait_for_url("**/recruiter/interviews", timeout=20000)
        rec.screenshot(path=f"{SHOTS}/lk-eval-done.png")

        # ---- 6. API-level verification ----
        s, d = req("GET", f"/api/interviews/{interview_id}/evaluation", token=cand_token)
        check("evaluation persisted (candidate readable)", s == 200 and d["evaluation"] and d["evaluation"]["overallScore"] == 45
              and d["evaluation"]["comments"] == "Great comms, deep technical knowledge.")
        check("competency ratings stored", sorted(c["score"] for c in d["evaluation"]["competencyScores"]) == [0, 0, 4, 5])
        s, d = req("GET", f"/api/applications/{app_id}", token=rec_token)
        check("interview marked COMPLETED with auto-summed score 45", d["application"]["status"] == "INTERVIEW_COMPLETED"
              and any(i["score"] == 45 for i in d["application"].get("interviewSchedules", [])))

        _, admin = req("POST", "/api/auth/demo-login", {"email": "admin@ethiohire.et", "password": "Admin123!"})
        s, d = req("GET", "/api/admin/notification-logs?take=50", token=admin["sessionToken"])
        check("INTERVIEW_EVALUATED notification logged", any(l["decisionPoint"] == "INTERVIEW_EVALUATED" and l["status"] in ("SENT", "SKIPPED") for l in d["logs"]))

        browser.close()

    req("DELETE", f"/api/jobs/{job}", token=rec_token)

    print()
    failed = [r for r in results if not r[1]]
    print(f"RESULT: {len(results) - len(failed)}/{len(results)} passed" + (f", {len(failed)} failed" if failed else ""))
    if page_errors:
        print(f"page errors ({len(page_errors)}):")
        for e in page_errors[:5]:
            print("  ", e)
    return 1 if failed or page_errors else 0


if __name__ == "__main__":
    sys.exit(main())
