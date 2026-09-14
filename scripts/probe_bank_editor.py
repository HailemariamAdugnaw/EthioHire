#!/usr/bin/env python3
"""Probe: bank editor counter + radio group behavior in the Interview Setup module."""
import sys
import time

sys.path.insert(0, "/home/z/my-project/scripts")
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
RUN = str(int(time.time()))


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 1000}).new_page()
        page.goto(f"{BASE}/#/auth")
        page.wait_for_timeout(800)
        page.fill('input[type="email"]', "hr@addistech.et")
        page.fill('input[type="password"]', "Demo123!")
        page.click('button[type="submit"]')
        page.wait_for_timeout(1800)

        page.goto(f"{BASE}/#/recruiter/interview-setup")
        page.wait_for_selector('[data-testid="new-bank"]', timeout=15000)
        page.locator('[data-testid="new-bank"]').click()
        page.wait_for_selector('[data-testid="bank-editor"]', timeout=10000)
        page.locator('[data-testid="bank-editor"] button:has-text("Add question")').click()
        page.locator('[data-testid="bank-question-row"]').last.locator("textarea").fill("Q A")
        page.locator('[data-testid="bank-editor"] button:has-text("Add question")').click()
        page.locator('[data-testid="bank-question-row"]').last.locator("textarea").fill("Q B")

        print("bulk bar count:", page.locator('[data-testid="bank-bulk-bar"]').count())
        print("initial bulk text:", repr(page.locator('[data-testid="bank-bulk-bar"]').inner_text()))
        row_b = page.locator('[data-testid="bank-question-row"]').last
        row_b.locator('[data-testid^="bank-visibility-"]').click()
        page.wait_for_timeout(400)
        print("pill after toggle:", repr(row_b.locator('[data-testid^="bank-visibility-"]').inner_text()))
        print("bulk text after toggle:", repr(page.locator('[data-testid="bank-bulk-bar"]').inner_text()))
        browser.close()


if __name__ == "__main__":
    main()
