"""Delete leftover EthioHire test users (fb-e2e-* / firebase-ui-*) from the
Firebase project via the Admin SDK, keeping the user's project clean."""
import sys

sys.path.insert(0, "/home/z/my-project/backend")
import os  # noqa: E402

os.chdir("/home/z/my-project/backend")

# load .env manually (same parsing the app uses)
for line in open("/home/z/my-project/.env", encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    os.environ.setdefault(k.strip(), v.strip())

import firebase_admin  # noqa: E402
from firebase_admin import auth as fb_auth  # noqa: E402

from eh.firebase_admin import _service_account  # noqa: E402

if not firebase_admin._apps:
    firebase_admin.initialize_app(
        firebase_admin.credentials.Certificate(_service_account())
    )

killed = []
page = fb_auth.list_users()
while page:
    for u in page.users:
        if u.email and (u.email.startswith("fb-e2e-") or u.email.startswith("firebase-ui-")):
            fb_auth.delete_user(u.uid)
            killed.append(u.email)
    page = page.get_next_page()

print(f"deleted {len(killed)} leftover test users:")
for e in killed:
    print("  -", e)
