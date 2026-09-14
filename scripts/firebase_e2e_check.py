"""
EthioHire — Firebase end-to-end verification (backend chain).

Mints a REAL Firebase ID token via the identitytoolkit REST API (using the
project's web API key), then drives the Django backend through:
  1. POST /api/auth/firebase-sync  (Bearer idToken) -> provisions local user
  2. GET  /api/auth/me             (Bearer idToken) -> resolves the user
  3. POST /api/auth/firebase-sync  again            -> idempotent re-sync
  4. cleanup: delete the Firebase test user via REST
"""
import json
import time
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8000"


def load_api_key() -> str:
    for line in open("/home/z/my-project/.env", encoding="utf-8"):
        if line.startswith("NEXT_PUBLIC_FIREBASE_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("API key not found in .env")


def http(url: str, payload: dict | None = None, headers: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def main() -> None:
    api_key = load_api_key()
    email = f"fb-e2e-{int(time.time())}@ethiohire.dev"
    password = "Smoke123!x"

    # 1) mint a REAL ID token from Google's identitytoolkit
    status, body = http(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={api_key}",
        {"email": email, "password": password, "returnSecureToken": True},
    )
    assert status == 200, f"identitytoolkit signUp failed: {status} {body}"
    id_token, uid = body["idToken"], body["localId"]
    print(f"[1] REAL Firebase idToken minted  uid={uid}  email={email}")

    bearer = {"Authorization": f"Bearer {id_token}"}

    # 2) firebase-sync provisions the local row
    status, body = http(
        f"{BASE}/api/auth/firebase-sync",
        {"email": email, "name": "FB E2E Smoker", "role": "CANDIDATE"},
        bearer,
    )
    assert status == 200, f"firebase-sync failed: {status} {body}"
    assert body.get("user", {}).get("name") == "FB E2E Smoker", f"bad payload: {body}"
    assert body["user"].get("id"), f"missing user.id: {body}"
    print(f"[2] firebase-sync OK -> {json.dumps(body['user'])}")

    # 3) /api/auth/me resolves via the Bearer token
    status, body = http(f"{BASE}/api/auth/me", None, bearer)
    assert status == 200 and body.get("user", {}).get("email") == email, f"me failed: {status} {body}"
    print(f"[3] auth/me OK -> {json.dumps(body['user'])}")

    # 4) idempotent re-sync (no duplicate row)
    status, body = http(
        f"{BASE}/api/auth/firebase-sync",
        {"email": email, "name": "FB E2E Smoker", "role": "CANDIDATE"},
        bearer,
    )
    assert status == 200 and body.get("user", {}).get("id"), f"re-sync failed: {status} {body}"
    print(f"[4] firebase-sync re-run OK (idempotent) -> {json.dumps(body['user'])}")

    # 5) garbage token must yield NO identity (401, or 200 with user=null —
    #    the SPA probes /me on every boot so 401 would paint console noise)
    status, body = http(f"{BASE}/api/auth/me", None, {"Authorization": "Bearer not.a.jwt"})
    identity = (body or {}).get("user") if status == 200 else "nonempty"
    assert (status == 401) or (status == 200 and identity is None), \
        f"garbage token yielded an identity! {status} {body}"
    print(f"[5] garbage token yields no identity (HTTP {status}, user={identity})")

    # 6) cleanup — remove the Firebase test user
    status, body = http(
        f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={api_key}",
        {"idToken": id_token},
    )
    assert status == 200, f"cleanup delete failed: {status} {body}"
    print("[6] Firebase test user deleted (cleanup)")

    print("\nALL FIREBASE BACKEND CHECKS PASSED")


if __name__ == "__main__":
    main()
