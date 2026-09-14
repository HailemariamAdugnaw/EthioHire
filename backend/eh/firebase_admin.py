"""
EthioHire — Firebase Admin SDK, lazy initialization (port of
src/lib/firebase-admin.ts). Credentials come from the
FIREBASE_SERVICE_ACCOUNT_JSON env var (full service-account JSON string).
Absent => DEMO auth mode.

Hardening:
- private_key written with literal "\\n" sequences (a very common mistake
  when pasting the service-account JSON into .env files) is normalized to
  real newlines before constructing the certificate, instead of failing
  with "Invalid PEM formatted message".
- initialization errors are remembered and surfaced via firebase_init_error()
  so /api/auth/config can degrade to DEMO mode instead of advertising a
  FIREBASE mode that can never verify a token.
"""
import json
import os
import threading

_lock = threading.Lock()
_admin_app = None
_init_attempted = False
_init_error: str | None = None


def is_firebase_server_configured() -> bool:
    return bool(os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON"))


def _normalize_private_key(key: str) -> str:
    """Fix \\n (and \\r) literal escapes that survive JSON parsing."""
    if "-----BEGIN" not in key:
        return key
    if "\\n" in key:  # literal backslash + n two-char sequences
        key = key.replace("\\n", "\n")
    return key.replace("\\r", "\n").replace("\r\n", "\n")


def _service_account() -> dict | None:
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        return None
    try:
        service_account = json.loads(raw)
    except json.JSONDecodeError:
        # Tolerate a raw value whose newlines were pasted UNESCAPED (real
        # line breaks inside the JSON string break json.loads). Retry after
        # escaping bare newlines that sit between the PEM markers.
        escaped = raw.replace("\r\n", "\\n").replace("\n", "\\n")
        try:
            service_account = json.loads(escaped)
        except json.JSONDecodeError:
            raise ValueError(
                "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON — paste the "
                "service-account file as a single line (keep the \\n escapes "
                "inside private_key)."
            ) from None
    if isinstance(service_account, dict):
        pk = service_account.get("private_key")
        if isinstance(pk, str):
            service_account["private_key"] = _normalize_private_key(pk)
    return service_account


def get_firebase_auth():
    global _admin_app, _init_attempted, _init_error

    if _admin_app is not None:
        from firebase_admin import auth as fb_auth

        return fb_auth
    if _init_attempted:
        return None

    with _lock:
        if _admin_app is not None or _init_attempted:
            return fb_auth if _admin_app else None
        _init_attempted = True

        if not is_firebase_server_configured():
            return None
        try:
            import firebase_admin
            from firebase_admin import credentials, auth as fb_auth

            service_account = _service_account()
            if not service_account:
                return None
            _admin_app = firebase_admin.initialize_app(
                credentials.Certificate(service_account),
                {
                    "projectId": os.environ.get("NEXT_PUBLIC_FIREBASE_PROJECT_ID")
                    or os.environ.get("VITE_FIREBASE_PROJECT_ID")
                    or service_account.get("project_id")
                },
            )
            _init_error = None
            print("[EthioHire] Firebase Admin initialized — Firebase auth mode ACTIVE")
            return fb_auth
        except Exception as exc:  # noqa: BLE001
            _init_error = str(exc)
            print(
                "[EthioHire] Failed to initialize Firebase Admin — falling back "
                f"to DEMO auth mode. Cause: {exc}"
            )
            if "PEM" in str(exc) or "private" in str(exc).lower():
                print(
                    "[EthioHire] Hint: the private_key in "
                    "FIREBASE_SERVICE_ACCOUNT_JSON looks malformed. Paste the "
                    "service-account JSON as ONE line and keep the \\n escapes "
                    "inside private_key exactly as downloaded."
                )
            return None


def firebase_init_error() -> str | None:
    """Human-readable reason the Admin SDK failed to initialize (or None)."""
    if _admin_app is not None:
        return None
    if not is_firebase_server_configured():
        return None
    if not _init_attempted:
        get_firebase_auth()
    return _init_error


def verify_firebase_id_token(id_token: str):
    fb_auth = get_firebase_auth()
    if fb_auth is None:
        return None
    try:
        return fb_auth.verify_id_token(id_token, check_revoked=True)
    except Exception:  # noqa: BLE001
        return None
