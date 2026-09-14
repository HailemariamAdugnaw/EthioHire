#!/usr/bin/env python3
"""End-to-end Firebase auth verification for EthioHire.

Uses the Firebase Auth REST API (no browser needed) with the project's web
API key to REALLY create + sign in a test user, then exchanges the resulting
ID token against the Django backend:
  1. accounts:signUp            -> create firebase user
  2. accounts:signInWithPassword -> obtain idToken
  3. POST /api/auth/firebase-sync with Bearer idToken -> expect 200 + provisioned user
  4. GET  /api/auth/me with Bearer idToken -> expect the same user
  5. cleanup: accounts:delete the test user
"""
import json
import sys
import urllib.request
import urllib.error

API_KEY = "AIzaSyDN8Ciht2NC8b8UjmyMOPX4B5RAnsg2O7M"
BASE = "http://127.0.0.1:8000"
import time
EMAIL = f"fb-e2e-{int(time.time())}@ethiohire.et"
PASSWORD = "FirebaseE2E!123"
NAME = "Firebase E2E Tester"

passed, failed = 0, 0


def check(label, ok, extra=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  ok   - {label}" + (f" | {extra}" if extra else ""))
    else:
        failed += 1
        print(f"  FAIL - {label}" + (f" | {extra}" if extra else ""))


def firebase_rest(action: str, body: dict) -> tuple[int, dict]:
    req = urllib.request.Request(
        f"https://identitytoolkit.googleapis.com/v1/accounts:{action}?key={API_KEY}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def api(path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST")
    if body is None:
        req = urllib.request.Request(BASE + path, headers=headers)  # GET
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


print("== Firebase E2E ==")
# 0. internet reachability (identitytoolkit answers 404 on GET but proves egress)
try:
    urllib.request.urlopen(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}", timeout=8
    )
    net = True
except urllib.error.HTTPError:
    net = True  # reached Google; 404 on GET is expected
except Exception:
    net = False
if not net:
    print("  !! no internet egress — cannot exercise real Firebase REST API")
    sys.exit(2)

# 1. sign up (ignore email-exists)
s, d = firebase_rest("signUp", {"email": EMAIL, "password": PASSWORD, "returnSecureToken": True})
if s == 400 and d.get("error", {}).get("message") == "EMAIL_EXISTS":
    s, d = firebase_rest("signInWithPassword", {"email": EMAIL, "password": PASSWORD, "returnSecureToken": True})
check("firebase signUp", s == 200, f"idTokenLen={len(d.get('idToken', ''))}")
local_id = d.get("localId", "")
id_token = d.get("idToken", "")

# 2. firebase-sync provisions the Django user
s2, d2 = api("/api/auth/firebase-sync", token=id_token, body={"email": EMAIL, "name": NAME, "role": "CANDIDATE"})
check("firebase-sync 200", s2 == 200, json.dumps(d2.get("user", {}))[:120])
check("synced email matches", d2.get("user", {}).get("email") == EMAIL)
check("synced role CANDIDATE", d2.get("user", {}).get("role") == "CANDIDATE")
first_id = d2.get("user", {}).get("id")
# idempotent second sync must return the same account (no duplicate row)
s2b, d2b = api("/api/auth/firebase-sync", token=id_token, body={"email": EMAIL, "name": NAME, "role": "CANDIDATE"})
check("firebase-sync idempotent", s2b == 200 and d2b.get("user", {}).get("id") == first_id)

# 3. /api/auth/me with the Firebase Bearer token
s3, d3 = api("/api/auth/me", token=id_token)
check("auth/me with Bearer", s3 == 200 and d3.get("user", {}).get("email") == EMAIL)

# 4. demo endpoints still functional (seeded admin can fetch notifications? skip — just config)
s4, d4 = api("/api/auth/config")
check("config still FIREBASE", s4 == 200 and d4.get("mode") == "FIREBASE")

# 5. cleanup firebase test user
if local_id:
    s5, _ = firebase_rest("delete", {"idToken": id_token})
    check("firebase cleanup delete", s5 == 200)

print(f"FIREBASE E2E RESULT: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
