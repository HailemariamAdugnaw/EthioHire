#!/usr/bin/env python3
"""Interview question visibility UI verification — the feature lives ONLY in
the Interview Setup module now (removed from the job editor):

  A. Module Question banks tab: per-question visibility toggles + bulk
     show/hide + live counter in the bank editor.
  B. Flags round-trip through the API and re-render on reload.
  C. Module Job configuration tab: link the bank to a job, switch the
     candidate visibility mode and result release, save -> API round-trip.
  D. The job editor no longer embeds any of it (no bank card, no bulk bar,
     no exam banner).

Run: python3 scripts/iq_visibility_ui_test.py
"""
import sys
import time

sys.path.insert(0, "/home/z/my-project/scripts")
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
PASS, FAIL, FAILURES = 0, 0, []
RUN = str(int(time.time()))


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok  - {name}")
    else:
        FAIL += 1
        FAILURES.append(name)
        print(f"  FAIL - {name} {extra}")


def api(method, path, body=None, token=None):
    import json as _json
    import urllib.request

    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Session-Token", token)
    data = _json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=15) as r:
            return r.status, _json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, _json.loads(e.read().decode())
        except Exception:
            return e.code, {}


def poll(path, token, want, tries=12, delay=500):
    s, d = api("GET", path, token=token)
    for _ in range(tries - 1):
        if want(d):
            return s, d
        time.sleep(delay / 1000)
        s, d = api("GET", path, token=token)
    return s, d


def main():
    s, d = api("POST", "/api/auth/demo-login", {"email": "hr@addistech.et", "password": "Demo123!"})
    assert s == 200, f"recruiter demo-login failed: {s}"
    token = d["sessionToken"]

    # fresh job — the create call itself must provision the interview record
    s, d = api("POST", "/api/jobs", {
        "title": f"UI IQ Bank {RUN}", "description": "interview bank module test",
        "category": "Quality Assurance", "location": "Addis Ababa",
        "postingStartDate": "2026-01-01T00:00:00.000Z",
        "applicationDeadline": "2027-01-01T00:00:00.000Z",
    }, token=token)
    assert s == 200, f"job create failed: {s} {d}"
    jid = d["job"]["id"]
    check("job creation provisions default bank + template (API)", d["job"]["bankId"] and d["job"]["evalTemplateId"])

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(f"{BASE}/#/auth")
        page.wait_for_timeout(800)
        page.fill('input[type="email"]', "hr@addistech.et")
        page.fill('input[type="password"]', "Demo123!")
        page.click('button[type="submit"]')
        page.wait_for_timeout(1800)

        # --- A. module: banks tab, create a bank with 2 questions
        page.goto(f"{BASE}/#/recruiter/interview-setup")
        page.wait_for_selector('[data-testid="setup-tab-banks"]', timeout=15000)
        check("setup tabs render (banks/templates/jobs)",
              page.locator('[data-testid="setup-tab-banks"]').count() == 1
              and page.locator('[data-testid="setup-tab-templates"]').count() == 1
              and page.locator('[data-testid="setup-tab-jobs"]').count() == 1)
        page.locator('[data-testid="new-bank"]').click()
        page.wait_for_selector('[data-testid="bank-editor"]', timeout=10000)
        page.fill("#bk-name", f"Module bank {RUN}")
        # the editor opens with one blank row — fill it as question A, add B
        page.locator('[data-testid="bank-question-row"]').first.locator("textarea").fill("Module question A — visible")
        page.locator('[data-testid="bank-question-row"]').first.locator('input[placeholder^="Optional guidance"]').fill("look for clarity")
        page.locator('[data-testid="bank-editor"] button:has-text("Add question")').click()
        page.locator('[data-testid="bank-question-row"]').last.locator("textarea").fill("Module question B — hidden from candidate")

        # --- B. per-question toggle + bulk bar
        row_b = page.locator('[data-testid="bank-question-row"]').last
        row_b.locator('[data-testid^="bank-visibility-"]').click()
        page.wait_for_timeout(200)
        check("toggle shows Hidden state", "Hidden" in row_b.locator('[data-testid^="bank-visibility-"]').inner_text())
        bulk = page.locator('[data-testid="bank-bulk-bar"]')
        check("bulk counter shows 1 of 2", "1 of 2" in bulk.inner_text())
        page.locator('[data-testid="bank-hide-all"]').click()
        page.wait_for_timeout(200)
        check("hide-all sets 0 of 2", "0 of 2" in bulk.inner_text())
        page.locator('[data-testid="bank-show-all"]').click()
        page.wait_for_timeout(200)
        check("show-all sets 2 of 2", "2 of 2" in bulk.inner_text())
        row_b.locator('[data-testid^="bank-visibility-"]').click()
        page.wait_for_timeout(200)

        page.locator('[data-testid="save-bank"]').click()
        page.wait_for_timeout(1500)

        # --- C. flags persisted via API
        s, d = poll("/api/question-banks", token, lambda dd: any(b["name"] == f"Module bank {RUN}" for b in dd.get("banks", [])))
        bank = next(b for b in d["banks"] if b["name"] == f"Module bank {RUN}")
        s, d = api("GET", f"/api/question-banks/{bank['id']}", token=token)
        flags = [q.get("visibleToCandidate") for q in d["bank"]["questions"]]
        check("saved per-question flags persisted", flags == [True, False], f"flags={flags}")

        # --- D. reload the bank editor: persisted state renders
        page.goto(f"{BASE}/#/recruiter/interview-setup")
        page.wait_for_timeout(1200)
        page.locator(f'[data-testid="edit-bank-{bank["id"]}"]').click()
        page.wait_for_selector('[data-testid="bank-editor"]', timeout=10000)
        bulk = page.locator('[data-testid="bank-bulk-bar"]')
        check("reloaded editor shows 1 of 2 visible", "1 of 2" in bulk.inner_text())
        rows = page.locator('[data-testid="bank-question-row"]')
        check("reloaded row A shows Candidate sees", "Candidate sees" in rows.nth(0).inner_text())
        check("reloaded row B shows Hidden", "Hidden" in rows.nth(1).inner_text())

        # --- E. Job configuration tab: link THIS bank to the job + configure
        page.locator('[data-testid="setup-tab-jobs"]').click()
        page.wait_for_selector(f'[data-testid="job-config-open-{jid}"]', timeout=10000)
        page.locator(f'[data-testid="job-config-open-{jid}"]').click()
        page.wait_for_selector('[data-testid="job-config-editor"]', timeout=10000)
        check("provisioned bank pre-linked", "question bank" in page.locator('[data-testid="bank-linked-note"]').inner_text())
        check("provisioned template note renders", page.locator('[data-testid="template-linked-note"]').count() == 1)
        # link the module bank created above
        page.locator("#jc-bank").click()
        page.get_by_role("option", name=f"Module bank {RUN}").click()
        page.check("#jc-all")
        page.check("#jc-after")
        page.locator('[data-testid="save-job-config"]').click()
        page.wait_for_timeout(1500)
        s, d = poll(f"/api/jobs/{jid}", token, lambda dd: dd.get("job", {}).get("interviewQuestionVisibility") == "ALL")
        check("visibility ALL persisted from module", d.get("job", {}).get("interviewQuestionVisibility") == "ALL")
        check("release AFTER_ALL + linked bank persisted from module", d["job"]["interviewResultRelease"] == "AFTER_ALL" and d["job"]["bankId"] == bank["id"], f"release={d['job']['interviewResultRelease']}")

        # --- F. the job editor no longer embeds any interview/exam configuration
        page.goto(f"{BASE}/#/recruiter/jobs/{jid}/edit")
        page.wait_for_selector('[data-testid="j-desc-editor"]', timeout=15000)
        page.wait_for_timeout(800)
        body = page.inner_text("body")
        check("job editor has no interview bank card", "Interview question bank" not in body)
        check("job editor has no scoring template card", "scoring template" not in body)
        check("job editor has no exam banner", "Proctored exam" not in body and page.locator('[data-testid="open-exams-module"]').count() == 0)
        check("job editor has no bulk bar", page.locator('[data-testid="iq-bulk-bar"]').count() == 0)

        check("zero page errors", len(errors) == 0, "; ".join(errors[:3]))
        page.screenshot(path="/home/z/my-project/scripts/shots/iq_visibility_module.png", full_page=True)
        browser.close()

    # --- cleanup
    api("DELETE", f"/api/jobs/{jid}", token=token)
    s, d = api("DELETE", f"/api/question-banks/{bank['id']}", token=token)
    check("test bank cleaned up", s == 200)

    print(f"\nIQ VISIBILITY UI RESULT: {PASS}/{PASS + FAIL} passed")
    if FAILURES:
        print("Failed:", FAILURES)
        sys.exit(1)


if __name__ == "__main__":
    main()
