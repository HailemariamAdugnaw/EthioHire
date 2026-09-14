"""Visual verification of the redesigned landing page + cleaned-up auth view."""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
SHOTS = "/home/z/my-project/scripts/ui-shots"

results = []
console_msgs = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(f"  {'ok ' if cond else 'FAIL'} - {name} {extra if not cond else ''}")


def main() -> int:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda m: console_msgs.append((m.type, m.text)))
        page.on("pageerror", lambda e: console_msgs.append(("pageerror", str(e))))

        # ---- landing page ----
        page.goto(f"{BASE}/#/", wait_until="domcontentloaded")
        page.wait_for_selector("text=Hire the best.", timeout=30000)
        # simulate a real user scroll so whileInView animations fire
        page.evaluate("""async () => {
            const h = document.body.scrollHeight;
            for (let y = 0; y <= h; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
            window.scrollTo(0, 0);
        }""")
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{SHOTS}/landing_new_hero.png")
        page.screenshot(path=f"{SHOTS}/landing_new_full.png", full_page=True)

        body = " ".join(page.locator("body").inner_text().split())
        check("hero: new gradient headline", "Skip the noise" in body)
        check("hero: announcement pill", "Auto-scheduled interviews & proctored exams" in body)
        check("hero: dual CTA", "Create free account" in body and "See how it works" in body)
        check("stats band", "Manual screening time" in body and "Exams audit-logged" in body)
        check("workflow cards", "A four-stage, fraud-resistant hiring funnel" in body)
        check("portals cards", "Three portals, one account" in body)
        check("voices section", "What the funnel feels like" in body)
        check("stack band updated", "Django REST Framework" in body and "React 19 + Vite" in body)
        check("stack band cleaned", "Next.js" not in body and "Prisma" not in body)
        check("dual-audience CTA", "I'm hiring — post a job" in body and "I'm job hunting — apply" in body)
        check("footer columns", "Trust" in body and "Get started" in body)

        # nav anchors exist
        for anchor in ["#workflow", "#portals", "#voices", "#stack"]:
            check(f"anchor {anchor} present", page.locator(anchor).count() == 1)

        # ---- auth view: no mode banners ----
        page.goto(f"{BASE}/#/login", wait_until="domcontentloaded")
        page.wait_for_selector("#email", timeout=30000)
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{SHOTS}/auth_view_clean.png")
        body2 = " ".join(page.locator("body").inner_text().split())
        check("auth: no 'Firebase Authentication active' banner", "Firebase Authentication active" not in body2)
        check("auth: no 'Demo authentication mode' banner", "Demo authentication mode" not in body2)
        check("auth: Google button still shown (FIREBASE mode)", "Continue with Google" in body2)
        check("auth: demo quick-fill hidden in FIREBASE mode", "Demo accounts (one-click fill)" not in body2)

        # mode info now in the console
        infos = " | ".join(t for ty, t in console_msgs if ty in ("info", "log"))
        check("console: auth mode logged to console instead of UI",
              "Firebase Authentication active" in infos,
              f"console infos: {infos[:200]}")

        errors = [t for ty, t in console_msgs if ty in ("error", "pageerror") and "favicon" not in t.lower()]
        check("console: zero errors on landing+auth", len(errors) == 0, "; ".join(errors[:3]))

        browser.close()

    fails = [r for r in results if not r[1]]
    print(f"\nVISUAL RESULT: {len(results) - len(fails)}/{len(results)} passed")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
