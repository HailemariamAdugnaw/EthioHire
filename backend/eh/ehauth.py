"""
EthioHire — server-side authentication (port of src/lib/auth.ts).

Two auth modes, decided purely by environment configuration:

1. FIREBASE MODE: client sends `Authorization: Bearer <idToken>`; verified
   with the Firebase Admin SDK and mapped to a local User row.
2. DEMO MODE: signed HttpOnly cookie `eh_session` = `<userId>.<HMAC-SHA256>`
   plus the `X-Session-Token` header fallback (localStorage-backed) for
   browsers that block cookies entirely (embedded previews).
"""
import hashlib
import hmac
import re

from django.conf import settings
from django.http import HttpRequest

from .firebase_admin import verify_firebase_id_token
from .models import User

SESSION_COOKIE = "eh_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 days


def _sign(value: str) -> str:
    return hmac.new(
        settings.AUTH_SECRET.encode(), value.encode(), hashlib.sha256
    ).hexdigest()


def create_session_token(user_id: str) -> str:
    return f"{user_id}.{_sign(user_id)}"


def verify_session_token(token: str):
    idx = token.rfind(".")
    if idx <= 0:
        return None
    user_id, sig = token[:idx], token[idx + 1:]
    expected = _sign(user_id)
    if hmac.compare_digest(sig, expected):
        return user_id
    return None


def auth_mode() -> str:
    from .firebase_admin import is_firebase_server_configured

    return "FIREBASE" if is_firebase_server_configured() else "DEMO"


def is_request_https(request: HttpRequest) -> bool:
    proto = (request.headers.get("x-forwarded-proto")
             or request.headers.get("x-forwarded-protocol") or "").split(",")[0].strip().lower()
    if proto == "https":
        return True
    if proto == "http":
        return False
    if request.headers.get("x-forwarded-ssl") == "on" or request.headers.get("front-end-https") == "on":
        return True
    return request.scheme == "https"


def session_cookie_header(token: str, request: HttpRequest) -> str:
    """Set-Cookie header value — SameSite=None; Secure over HTTPS (embedded
    previews), SameSite=Lax on plain local HTTP (mirrors sessionCookieHeader)."""
    is_https = is_request_https(request)
    same_site = "None" if is_https else "Lax"
    secure = "; Secure" if is_https else ""
    return (
        f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite={same_site}"
        f"{secure}; Max-Age={SESSION_MAX_AGE}"
    )


def clear_session_cookie_header(request: HttpRequest) -> str:
    is_https = is_request_https(request)
    same_site = "None" if is_https else "Lax"
    secure = "; Secure" if is_https else ""
    return f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite={same_site}{secure}; Max-Age=0"


def to_session_user(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "role": u.role or "CANDIDATE",
        "firebaseUid": u.firebaseUid,
    }


def get_session_user(request: HttpRequest):
    """Resolve current session user — Bearer (Firebase) first, then demo
    cookie / X-Session-Token fallback. Returns a dict or None."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        decoded = verify_firebase_id_token(token)
        if decoded:
            uid = decoded.get("uid")
            email = (decoded.get("email") or "").lower()
            by_uid = User.objects.filter(firebaseUid=uid).first()
            if by_uid:
                return to_session_user(by_uid)
            by_email = User.objects.filter(email=email).first()
            if by_email:
                by_email.firebaseUid = uid
                by_email.save(update_fields=["firebaseUid"])
                return to_session_user(by_email)
            # Firebase user without a local row — client must call firebase-sync
            return None
        return None

    token = request.COOKIES.get(SESSION_COOKIE)
    if not token:
        token = request.headers.get("x-session-token")
    if not token:
        return None
    user_id = verify_session_token(token)
    if not user_id:
        return None
    user = User.objects.filter(id=user_id).first()
    return to_session_user(user) if user else None


def require_user(request: HttpRequest) -> dict:
    user = get_session_user(request)
    if not user:
        raise _auth_error(401, "Authentication required. Please sign in.")
    return user


def require_role(request: HttpRequest, *roles: str) -> dict:
    user = require_user(request)
    if user["role"] not in roles:
        raise _auth_error(403, f"Access denied. This action requires role: {' or '.join(roles)}.")
    return user


def scrypt_verify(password: str, stored: str) -> bool:
    """Verify 'salt:hash' (Node crypto.scryptSync(password, salt, 64) — salt
    used as the literal hex-character string bytes, defaults N=16384 r=8 p=1)."""
    try:
        salt, hash_hex = stored.split(":", 1)
        candidate = hashlib.scrypt(
            password.encode(), salt=salt.encode(), n=16384, r=8, p=1,
            dklen=64, maxmem=64 * 1024 * 1024,
        )
        return hmac.compare_digest(bytes.fromhex(hash_hex), candidate)
    except Exception:  # noqa: BLE001
        return False


def scrypt_hash(password: str) -> str:
    import os as _os

    salt = _os.urandom(16).hex()
    digest = hashlib.scrypt(
        password.encode(), salt=salt.encode(), n=16384, r=8, p=1,
        dklen=64, maxmem=64 * 1024 * 1024,
    ).hex()
    return f"{salt}:{digest}"


def _auth_error(status_code: int, message: str):
    from .common import ApiError

    return ApiError(status_code, message)


_EMAIL_RE = re.compile(r"^\S+@\S+\.\S+$")
