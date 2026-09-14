"""
EthioHire — Firebase auth BROWSER UI verification (the exact path the user hit).

Drives the real Vite app on :3000 with Playwright:
  1. Register a brand-new account through the UI (frontend Firebase SDK ->
     identitytoolkit -> /api/auth/firebase-sync). Regression: this used to
     crash with "Cannot read properties of undefined (reading 'name')".
  2. Assert the "Account created" toast appears and the candidate portal loads.
  3. Reload -> Firebase session persistence restores the sign-in.
  4. Sign out -> sign back in via the login form ("Welcome back" toast).
  5. Assert the console has ZERO errors and ZERO Cross-Origin-Opener-Policy
     warnings (the COOP header fix).
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
SHOTS = "/home/z/my-project/scripts/ui-shots"
EMAIL = f"firebase-ui-{int(time.time())}@ethiohire.dev"
PASSWORD = "Test1234!"
NAME = "FB UI Tester"

results = []
console_errors = []
coop_warnings = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(f"  {'ok ' if cond else 'FAIL'} - {name} {extra if not cond else ''}")


def main() -> int:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda m: (
            console_errors.append(m.text) if m.type == "error"
            else (coop_warnings.append(m.text) if "Cross-Origin-Opener-Policy" in m.text else None)
        ))
        page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))

        # ---- 1. register through the UI (REAL Firebase SDK) ----
        page.goto(f"{BASE}/#/register", wait_until="domcontentloaded")
        page.wait_for_selector("#reg-name", timeout=30000)
        page.fill("#reg-name", NAME)
        page.fill("#reg-email", EMAIL)
        page.fill("#reg-password", PASSWORD)
        page.fill("#reg-password", PASSWORD)
        page.screenshot(path=f"{SHOTS}/firebase_ui_register.png")
        page.locator("#reg-password").press("Enter")

        # ---- 2. welcome toast + portal navigation ----
        try:
            page.wait_for_selector("text=Account created", timeout=30000)
            check("register: 'Account created — welcome' toast", True)
        except Exception:
            check("register: 'Account created — welcome' toast", False,
                  "toast never appeared (the old bug crashed right here)")
        page.wait_for_url("**#/**", timeout=15000)
        page.wait_for_selector('[aria-label="Sign out"]', timeout=30000)
        check("register: redirected into candidate portal", "#/candidate" in page.url, page.url)
        page.wait_for_timeout(800)
        page.screenshot(path=f"{SHOTS}/firebase_ui_candidate_portal.png")

        # ---- 3. reload -> session restored ----
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector('[aria-label="Sign out"]', timeout=30000)
        check("reload: Firebase session restored (still signed in)", True)
        body = " ".join(page.locator("body").inner_text().split())
        check("reload: portal shows the account display name", NAME in body)

        # ---- 4. sign out, then sign back in ----
        page.locator('[aria-label="Sign out"]').click()
        page.wait_for_timeout(1500)
        page.goto(f"{BASE}/#/login", wait_until="domcontentloaded")
        page.wait_for_selector("#email", timeout=30000)
        page.fill("#email", EMAIL)
        page.fill("#password", PASSWORD)
        page.locator("#password").press("Enter")
        try:
            page.wait_for_selector("text=Welcome back", timeout=30000)
            check("re-login: 'Welcome back' toast", True)
        except Exception:
            check("re-login: 'Welcome back' toast", False)
        page.wait_for_selector('[aria-label="Sign out"]', timeout=30000)
        check("re-login: candidate portal loads", "#/candidate" in page.url, page.url)
        page.wait_for_timeout(800)
        page.screenshot(path=f"{SHOTS}/firebase_ui_relogin.png")

        browser.close()

    # ---- 5. console hygiene ----
    real_errors = [e for e in console_errors if "favicon" not in e.lower()]
    check("console: zero errors", len(real_errors) == 0, "; ".join(real_errors[:3]))
    check("console: zero Cross-Origin-Opener-Policy warnings", len(coop_warnings) == 0,
          f"{len(coop_warnings)} COOP warnings")

    fails = [r for r in results if not r[1]]
    print(f"\nFIREBASE UI RESULT: {len(results) - len(fails)}/{len(results)} passed")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
