"""Smoke test — the two new recruiter modules render without errors:
/recruiter/exams (list + detail tabs) and /recruiter/interview-setup
(banks + templates tabs, create + edit)."""
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
PASS = 0
FAIL = 0


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok  - {name}")
    else:
        FAIL += 1
        print(f"  FAIL - {name} {extra}")


def main():
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

        # ---- Exams module (list) ----
        page.goto(f"{BASE}/#/recruiter/exams")
        page.wait_for_timeout(1600)
        body = page.inner_text("body")
        check("exams list renders", "Proctored text exams, decoupled from the job editor" in body)
        check("exams list shows seeded jobs", page.locator("[data-testid='exam-row']").count() >= 1)

        # open the first exam detail
        page.locator("[data-testid^='manage-exam-']").first.click()
        page.wait_for_timeout(1400)
        check("exam detail question tab renders", page.locator("[data-testid='exam-tab-questions']").is_visible())
        page.locator("[data-testid='exam-tab-session']").click()
        page.wait_for_timeout(600)
        check("exam session tab shows schedule field", page.locator("#es-at").is_visible())
        page.locator("[data-testid='exam-tab-rules']").click()
        page.wait_for_timeout(600)
        check("exam rules tab shows pass mark", page.locator("#ex-pass").is_visible())
        page.screenshot(path="/home/z/my-project/scripts/shots/smoke_exams_detail.png", full_page=True)

        # ---- Interview setup module ----
        page.goto(f"{BASE}/#/recruiter/interview-setup")
        page.wait_for_timeout(1600)
        check("interview setup renders tabs", page.locator("[data-testid='setup-tab-banks']").is_visible() and page.locator("[data-testid='setup-tab-templates']").is_visible())

        # create a bank end-to-end
        page.get_by_test_id("new-bank").click()
        page.wait_for_timeout(600)
        page.fill("#bk-name", f"Smoke bank {int(time.time())}")
        page.locator("[data-testid='bank-editor'] textarea").first.fill("Smoke question — describe a hard bug you fixed.")
        page.get_by_test_id("save-bank").click()
        page.wait_for_timeout(1400)
        check("bank created + listed", "Smoke bank" in page.inner_text("body"))

        # create a weighted template end-to-end
        page.locator("[data-testid='setup-tab-templates']").click()
        page.wait_for_timeout(600)
        page.get_by_test_id("new-template").click()
        page.wait_for_timeout(600)
        page.fill("#tpl-name", f"Smoke template {int(time.time())}")
        weights = page.locator("[data-testid='template-editor'] input[type='number']")
        weights.first.fill("3")
        page.get_by_test_id("save-template").click()
        page.wait_for_timeout(1400)
        tbody = page.inner_text("body")
        check("weighted template created + listed", "Smoke template" in tbody)
        page.screenshot(path="/home/z/my-project/scripts/shots/smoke_interview_setup.png", full_page=True)

        check("zero page errors", len(errors) == 0, "; ".join(errors[:3]))
        browser.close()

    print(f"\nSMOKE RESULT: {PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
