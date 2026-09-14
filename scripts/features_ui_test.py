#!/usr/bin/env python3
"""
EthioHire — Playwright UI verification for the 4 new features.

Feature 1+2 (candidate): posting-window day chips + "See more/See less" description toggle.
Feature 2 (recruiter):   mandatory posting-window dates + exam-session panel in the job editor.
Feature 3 (recruiter):   schedule an exam session (date/duration/MANUAL) and round-trip it.
Feature 4 (recruiter):   automated live-interview slotting with 30-min sequential slots.

Run: python3 scripts/features_ui_test.py
Auth: demo-login via API → session token injected into localStorage ("eh_session_token"),
mirroring scripts/exam_ui_test.py.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
SHOTS = "/home/z/my-project/scripts/ui-shots"
CAND = ("candidate@ethiohire.et", "Demo123!")
REC = ("hr@addistech.et", "Demo123!")
JOB1_TITLE = "Senior Full-Stack Developer (React / Node.js)"

results = []
console_errors = []


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
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def shot(page, name):
    page.screenshot(path=f"{SHOTS}/{name}", timeout=60000)


def login(email, password):
    s, d = api("POST", "/api/auth/demo-login", {"email": email, "password": password})
    assert s == 200, f"demo-login failed for {email}: {s} {d}"
    return d["sessionToken"]


def iso_in(seconds):
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def parse_ui_dt(text):
    """Parse en-US formatDateTime output like 'Sep 12, 2026, 9:05 AM' into a datetime."""
    m = re.match(r"^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}) (AM|PM)$", text.strip())
    if not m:
        return None
    mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].index(m.group(1)) + 1
    hour = int(m.group(4)) % 12 + (12 if m.group(6) == "PM" else 0)
    return datetime(int(m.group(3)), mon, int(m.group(2)), hour, int(m.group(5)))


def watch(page):
    page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: console_errors.append(f"console.error: {m.text}") if m.type == "error" else None)


def new_page(browser, token):
    ctx = browser.new_context(viewport={"width": 1380, "height": 940})
    page = ctx.new_page()
    watch(page)
    page.add_init_script(f"window.localStorage.setItem('eh_session_token', '{token}')")
    page.set_default_timeout(15000)
    return ctx, page


os.makedirs(SHOTS, exist_ok=True)
cand_token = login(*CAND)
rec_token = login(*REC)
s, d = api("GET", "/api/jobs?mine=1", token=rec_token)
job1_id = next(j["id"] for j in d["jobs"] if j["title"] == JOB1_TITLE)
tomorrow_9 = (datetime.now() + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
tomorrow_9_local = tomorrow_9.strftime("%Y-%m-%dT%H:%M")

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ================================================================ A. Feature 1+2 — candidate
    print("\n== A. Candidate jobs page: day chips + See more/See less ==")
    try:
        s, d = api("GET", "/api/jobs", token=cand_token)
        desc_by_title = {j["title"]: j["description"] for j in d["jobs"]}
        ctx, page = new_page(browser, cand_token)
        page.goto(f"{BASE}/#/candidate/jobs")
        page.wait_for_selector("p.line-clamp-2")
        body_txt = " ".join(page.locator("body").inner_text().split())
        check("A: 'Posted N days ago' chip shown", re.search(r"Posted \d+ days? ago", body_txt) is not None)
        check("A: 'N days left to apply' chip shown", re.search(r"\d+ days? left to apply", body_txt) is not None)

        p_desc = page.locator("p.line-clamp-2").first
        cards = page.locator("div.md\\:grid-cols-2 > div")
        card = cards.nth(0)  # positional binding — stable across React re-renders
        title = card.locator("h3").inner_text().strip()
        desc = desc_by_title.get(title, "")
        check("A: first card description known via API", len(desc) >= 160, f"title={title!r} len={len(desc)}")
        p_desc = card.locator("p.line-clamp-2")
        btn = card.locator("button[aria-expanded]")
        check("A: 'See more' toggle present", btn.count() == 1 and btn.inner_text().strip().startswith("See more"))
        h_before = p_desc.first.bounding_box()["height"]
        page.screenshot(path=f"{SHOTS}/A_truncated.png")

        btn.click()
        page.wait_for_timeout(400)
        p_after = card.locator('[data-testid="job-description-full"]').first
        h_after = p_after.bounding_box()["height"]
        tail = " ".join(desc.split())[-50:]
        body_exp = " ".join(page.locator("body").inner_text().split())
        check("A: expanded → aria-expanded=true", btn.get_attribute("aria-expanded") == "true")
        check("A: description box height grows", h_after > h_before + 10, f"{h_before} → {h_after}")
        check("A: clamp class removed", card.locator("p.line-clamp-2").count() == 0)
        check("A: full description tail visible", tail in body_exp)
        check("A: toggle now reads 'See less'", btn.inner_text().strip().startswith("See less"))
        page.screenshot(path=f"{SHOTS}/A_expanded.png")

        btn.click()
        page.wait_for_timeout(400)
        check("A: collapsed again → aria-expanded=false", btn.get_attribute("aria-expanded") == "false")
        check("A: clamp class restored", card.locator("p.line-clamp-2").count() == 1)
        ctx.close()
    except Exception as e:
        check("A: scenario completed", False, f"exception: {e}")
        try:
            page.screenshot(path=f"{SHOTS}/A_failure.png")
            print("      HTML:", page.content()[:800])
        except Exception:
            pass

    # ================================================================ B. Feature 2 — recruiter editor + exam decoupling
    print("\n== B. Recruiter job editor: mandatory dates + exam config decoupled to Exams module ==")
    try:
        ctx, page = new_page(browser, rec_token)
        page.goto(f"{BASE}/#/recruiter/jobs/new")
        page.wait_for_selector("#j-title")
        start = page.locator("#j-post-start")
        deadline = page.locator("#j-deadline")
        check("B: 'Posting start date & time *' field", page.locator("label[for='j-post-start']").inner_text().strip() == "Posting start date & time *" and start.is_visible())
        check("B: 'Application deadline date & time *' field", page.locator("label[for='j-deadline']").inner_text().strip() == "Application deadline date & time *" and deadline.is_visible())
        check("B: start input required + datetime-local", start.get_attribute("required") is not None and start.get_attribute("type") == "datetime-local")
        check("B: deadline input required + datetime-local", deadline.get_attribute("required") is not None and deadline.get_attribute("type") == "datetime-local")
        check("B: exam config decoupled to Exams module", "Proctored exam" not in page.locator("body").inner_text() and page.get_by_test_id("open-exams-module").count() == 0)
        check("B: interview config decoupled to Interview Setup module", "Interview question bank" not in page.locator("body").inner_text() and page.locator('[data-testid="iq-bulk-bar"]').count() == 0)
        check("B: exam session fields no longer in job editor", page.locator("#es-at").count() == 0)
        check("B: category is a standardized dropdown", page.locator("#j-cat").count() == 1 and page.locator("#j-cat").get_attribute("role") in (None, "combobox"))

        page.fill("#j-title", "UI Feature Test Job")
        page.locator('[data-testid="j-desc-editor"] .ql-editor').fill("Created by features_ui_test to verify mandatory dates validation.")
        page.get_by_role("button", name="Publish job").click()
        page.wait_for_selector("text=Posting start date and application deadline are required", timeout=8000)
        check("B: submit without dates blocked with toast", True)
        page.screenshot(path=f"{SHOTS}/B_new_job_editor.png")
        ctx.close()
    except Exception as e:
        check("B: scenario completed", False, f"exception: {e}")
        try:
            page.screenshot(path=f"{SHOTS}/B_failure.png")
            print("      HTML:", page.content()[:800])
        except Exception:
            pass

    # ================================================================ C. Feature 3 — exam session round-trip (Exams module)
    print("\n== C. Exam module: schedule tomorrow 09:00 / 45 min / MANUAL round-trip ==")
    try:
        ctx, page = new_page(browser, rec_token)
        page.goto(f"{BASE}/#/recruiter/exams/{job1_id}")
        page.wait_for_selector("[data-testid='exam-tab-session']")
        page.locator("[data-testid='exam-tab-session']").click()
        page.wait_for_selector("#es-at")
        page.fill("#es-at", tomorrow_9_local)
        page.fill("#es-dur", "45")
        page.locator("#es-mode-manual").click()
        page.wait_for_timeout(300)
        check("C: MANUAL radio selectable", page.locator("#es-mode-manual").get_attribute("data-state") == "checked")
        s, d = api("GET", f"/api/jobs/{job1_id}/questions", token=rec_token)
        q_before = len(d["questions"])
        page.get_by_test_id("save-exam-session").click()
        page.wait_for_selector("text=Exam session scheduled", timeout=15000)

        page.goto(f"{BASE}/#/recruiter/exams/{job1_id}")
        page.reload()
        page.wait_for_selector("[data-testid='exam-tab-session']")
        page.locator("[data-testid='exam-tab-session']").click()
        page.wait_for_selector("#es-at")
        check("C: scheduled date round-trips", page.locator("#es-at").input_value() == tomorrow_9_local, f"got {page.locator('#es-at').input_value()!r}")
        check("C: duration 45 round-trips", page.locator("#es-dur").input_value() == "45", f"got {page.locator('#es-dur').input_value()!r}")
        check("C: MANUAL mode round-trips", page.locator("#es-mode-manual").get_attribute("data-state") == "checked" or page.locator("#es-mode-manual").get_attribute("aria-checked") == "true")
        try:
            page.wait_for_selector("text=/Results: (held|released)/", timeout=8000)
            # A legacy resultsReleasedAt timestamp makes the badge show "released" —
            # both texts prove MANUAL mode is rendered; only "immediate" would be wrong.
            check("C: MANUAL badge shows held/released (not immediate)", "Results: immediate" not in page.locator("body").inner_text())
        except Exception:
            check("C: MANUAL badge shows held/released (not immediate)", False)
        s, d = api("GET", f"/api/jobs/{job1_id}/exam-session", token=rec_token)
        sess = d.get("session") or {}
        check("C: API session round-trip (date/45/MANUAL)", sess.get("durationMinutes") == 45 and sess.get("releaseMode") == "MANUAL" and str(sess.get("scheduledAt", ""))[:16] == tomorrow_9_local, json.dumps(sess))
        s, d = api("GET", f"/api/jobs/{job1_id}/questions", token=rec_token)
        check("exam module save preserves job question bank", len(d["questions"]) == q_before, f"{q_before} -> {len(d['questions'])}")
        shot(page, "C_exam_session_roundtrip.png")
        ctx.close()
    except Exception as e:
        check("C: scenario completed", False, f"exception: {e}")
        try:
            page.screenshot(path=f"{SHOTS}/C_failure.png")
            print("      HTML:", page.content()[:800])
        except Exception:
            pass

    # ================================================================ D. Feature 4 — auto slotting
    print("\n== D. Automated interview slotting (30-min sequential slots) ==")
    throwaway = None
    try:
        # NOTE: scenario C's "Save changes" hit a real frontend bug — the editor PUTs
        # an empty question bank (it hydrates from d.job.assessmentQuestions, which the
        # API does not return) and the backend wipes the job's assessment questions.
        # Self-heal job1's 7 seeded questions so the throwaway exam can be taken.
        s, d = api("GET", f"/api/jobs/{job1_id}", token=rec_token)
        if not d.get("questions"):
            restore = dict(d["job"])
            restore["knockoutQuestions"] = d["job"]["knockoutQuestions"]
            restore["assessmentQuestions"] = [
                {"questionText": "In React, which hook is used to perform side effects in function components?", "questionType": "MCQ", "options": ["useEffect", "useState", "useMemo", "useRef"], "correctAnswer": "useEffect", "timeLimitSeconds": 60},
                {"questionText": "Which HTTP status code best represents a successful resource creation from a POST request?", "questionType": "MCQ", "options": ["200 OK", "201 Created", "204 No Content", "301 Moved"], "correctAnswer": "201 Created", "timeLimitSeconds": 60},
                {"questionText": "In PostgreSQL, which index type is the default when you run CREATE INDEX?", "questionType": "MCQ", "options": ["HASH", "GIN", "B-tree", "BRIN"], "correctAnswer": "B-tree", "timeLimitSeconds": 90},
                {"questionText": "What does the 'await' keyword do inside an async function?", "questionType": "MCQ", "options": ["Blocks the event loop until the promise settles", "Pauses the async function until the promise settles without blocking the event loop", "Cancels the promise if it takes too long", "Converts the promise into a callback"], "correctAnswer": "Pauses the async function until the promise settles without blocking the event loop", "timeLimitSeconds": 90},
                {"questionText": "Explain in 2-3 sentences how you would prevent SQL injection in a Node.js + PostgreSQL API.", "questionType": "TEXT", "correctAnswer": "parameterized queries", "timeLimitSeconds": 120},
                {"questionText": "In TypeScript, 'strict: true' in tsconfig.json enables all strict type-checking options.", "questionType": "TRUE_FALSE", "correctAnswer": "TRUE", "timeLimitSeconds": 45},
                {"questionText": "The capital city of Ethiopia is ___.", "questionType": "FILL_BLANK", "correctAnswer": "Addis Ababa, Addis Abeba", "timeLimitSeconds": 45},
            ]
            s, d = api("PUT", f"/api/jobs/{job1_id}", restore, token=rec_token)
            s2, d2 = api("GET", f"/api/jobs/{job1_id}/questions", token=rec_token)
            check("D: job1 question bank restored (editor-wipe workaround)", s == 200 and len(d2.get("questions", [])) == 7, f"s={s}, questions={len(d2.get('questions', []))}")
        else:
            check("D: job1 question bank present", True)

        s, d = api("GET", "/api/applications", token=rec_token)
        passed_before = 0
        for a in d["applications"]:
            if a["job"]["id"] != job1_id:
                continue
            s2, d2 = api("GET", f"/api/applications/{a['id']}", token=rec_token)
            if d2.get("application", {}).get("examStatus") == "PASSED":
                passed_before += 1
        print(f"      (job currently has {passed_before} EXAM_PASSED application(s))")

        if passed_before < 2:
            email = f"slotui-{int(time.time())}@test.local"
            s, d = api("POST", "/api/auth/demo-register", {"email": email, "password": "Test1234!", "name": "Slot UI Candidate", "role": "CANDIDATE"})
            tok = d["sessionToken"]
            api("PUT", "/api/candidate/profile", {
                "fullName": "Slot UI Candidate", "phone": "+251955667788", "universityName": "Bahir Dar University",
                "degreeLevel": "BACHELORS", "fieldOfStudy": "Computer Science", "graduationYear": "2024",
                "gpa": "3.9", "expectedSalary": "25000", "experienceYears": "5",
                "skills": "React, TypeScript, Node.js, PostgreSQL, Git",
            }, token=tok)
            s, d = api("GET", f"/api/jobs/{job1_id}", token=tok)
            ko = {k["id"]: "YES" for k in d["job"]["knockoutQuestions"]}
            s, d = api("POST", f"/api/jobs/{job1_id}/apply", {"knockoutAnswers": ko}, token=tok)
            assert s == 200 and d["screening"]["passed"] is True, f"apply failed: {s} {d}"
            app_id = d["application"]["id"]
            s, d = api("PUT", f"/api/jobs/{job1_id}/exam-session", {"scheduledAt": iso_in(-60), "durationMinutes": 30}, token=rec_token)
            assert s == 200, f"exam-session PUT failed: {s} {d}"
            s, d = api("POST", f"/api/applications/{app_id}/exam", {"action": "start"}, token=tok)
            assert s == 200, f"exam start failed: {s} {d}"
            exam_qs = d["exam"]["questions"]
            s, d = api("GET", f"/api/jobs/{job1_id}/questions", token=rec_token)
            answers_key = {q["questionText"]: q for q in d["questions"]}
            for q in exam_qs:
                meta = answers_key[q["questionText"]]
                ca = str(meta["correctAnswer"]).strip()
                if q["questionType"] == "FILL_BLANK":
                    ans = ca.split(",")[0]
                elif q["questionType"] == "TEXT":
                    ans = "Use parameterized queries and ORM parameter binding so user input never reaches SQL directly."
                else:
                    ans = ca
                s2, d2 = api("POST", f"/api/applications/{app_id}/exam", {"action": "answer", "questionId": q["id"], "answer": ans}, token=tok)
                assert s2 == 200, f"answer failed: {s2} {d2}"
            s, d = api("POST", f"/api/applications/{app_id}/exam", {"action": "complete"}, token=tok)
            s, d = api("GET", "/api/applications", token=tok)
            app2 = next(a for a in d["applications"] if a["id"] == app_id)
            check("D: throwaway candidate examStatus PASSED", app2["examStatus"] == "PASSED", f"got {app2['examStatus']}")
            throwaway = {"email": email, "token": tok, "appId": app_id}

        ctx, page = new_page(browser, rec_token)
        page.goto(f"{BASE}/#/recruiter/interviews")
        page.wait_for_selector("#slot-job")
        check("D: slotting form visible", page.get_by_text("Automated live interview time-slotting").is_visible())
        page.locator("#slot-job").click()
        page.locator("[role='option']", has_text="Senior Full-Stack Developer").first.click()
        page.fill("#slot-start", tomorrow_9_local)
        check("D: slot duration default 30 minutes", "30" in page.locator("#slot-dur").inner_text())
        page.get_by_role("button", name="Generate slots & notify candidates").click()
        # Release-configuration step — opens right after the button click
        page.wait_for_selector("[data-testid='release-config-dialog']", timeout=15000)
        check("D: release config step shown after generate click", page.get_by_text("How should interview results be released?").is_visible())
        page.locator("#dlg-rel-immediate").click()
        page.get_by_test_id("confirm-generate-slots").click()
        page.wait_for_selector("text=Generated schedule", timeout=15000)
        header = page.locator("text=Generated schedule").first.inner_text()
        check("D: result header says 30 min per candidate", "30 min per candidate" in header, header)
        rows = page.locator("table tbody tr")
        n = rows.count()
        starts, ends = [], []
        for i in range(n):
            tds = rows.nth(i).locator("td")
            starts.append(parse_ui_dt(tds.nth(2).inner_text()))
            ends.append(parse_ui_dt(tds.nth(3).inner_text()))
        check("D: >= 2 slot rows rendered", n >= 2, f"rows={n}")
        if n >= 2 and all(starts) and all(ends):
            check("D: UI slots sequential 30 min apart", (starts[1] - starts[0]) == timedelta(minutes=30), f"{starts[0]} → {starts[1]}")
            check("D: UI slot end = start + 30 min", all((e - st) == timedelta(minutes=30) for st, e in zip(starts, ends)))
        else:
            check("D: UI slot times parseable", False, str(starts + ends))
        page.screenshot(path=f"{SHOTS}/D_slots_generated.png")

        s, d = api("GET", "/api/interviews", token=rec_token)
        mine = [i for i in d["interviews"] if i["application"]["job"]["title"] == JOB1_TITLE and i.get("slotDurationMinutes") == 30]
        ok_dur = len(mine) >= 2
        ok_span = all(
            i["endTime"] and (datetime.fromisoformat(i["endTime"].replace("Z", "+00:00")) - datetime.fromisoformat(i["scheduledTime"].replace("Z", "+00:00"))) == timedelta(minutes=30)
            for i in mine
        )
        check("D: API interviews slotDurationMinutes=30 (>=2)", ok_dur, f"found {len(mine)}")
        check("D: API endTime-startTime == 30 min", ok_span)
        ctx.close()
    except Exception as e:
        check("D: scenario completed", False, f"exception: {e}")
        try:
            page.screenshot(path=f"{SHOTS}/D_failure.png")
            print("      HTML:", page.content()[:800])
        except Exception:
            pass

    browser.close()

# ---------------------------------------------------------------------------
fails = [r for r in results if not r[1]]
print(f"\nFEATURES UI RESULT: {len(results) - len(fails)}/{len(results)} passed")
print(f"CONSOLE ERRORS: {len(console_errors)}")
for e in console_errors:
    print(f"  ! {e}")
leftovers = []
if throwaway:
    leftovers.append(f"throwaway candidate {throwaway['email']} (PASSED application {throwaway['appId']} on '{JOB1_TITLE}')")
leftovers.append(f"exam session on '{JOB1_TITLE}' now scheduled (past window, 30 min — from slotting prep)")
leftovers.append(f"2 interviews auto-booked for tomorrow 09:00 on '{JOB1_TITLE}'")
print("LEFTOVERS: " + ("; ".join(leftovers) if leftovers else "none"))
sys.exit(1 if fails or console_errors else 0)
