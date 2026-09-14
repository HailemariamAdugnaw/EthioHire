"""EthioHire — auth endpoints (port of src/app/api/auth/*)."""
import os
import secrets

from django.http import HttpRequest
from rest_framework.response import Response

from ..common import ApiError, audit, notify, view
from ..ehauth import (
    auth_mode,
    clear_session_cookie_header,
    create_session_token,
    require_user,
    scrypt_hash,
    scrypt_verify,
    session_cookie_header,
)
from ..firebase_admin import firebase_init_error
from ..models import CandidateProfile, CompanyProfile, User
from ..serializers import user_public_dict


def _body(request) -> dict:
    if not request.body:
        return {}
    return request.data if isinstance(request.data, dict) else {}


def _firebase_web_config() -> dict:
    """Firebase web-app config for the frontend.

    Values are accepted from NEXT_PUBLIC_FIREBASE_* (legacy guides) or
    VITE_FIREBASE_* (Vite-era naming). authDomain / storageBucket are
    sanitized to bare hosts — the Firebase JS SDK requires them WITHOUT a
    scheme, and values pasted as "https://..." break signInWithPopup.
    """

    def env(*names: str) -> str | None:
        for n in names:
            value = os.environ.get(n)
            if value:
                return value
        return None

    def bare_host(value: str | None) -> str | None:
        if not value:
            return value
        out = value.strip()
        for prefix in ("https://", "http://"):
            if out.lower().startswith(prefix):
                out = out[len(prefix):]
        return out.rstrip("/") or None

    return {
        "apiKey": env("NEXT_PUBLIC_FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY"),
        "authDomain": bare_host(env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN")),
        "projectId": env("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID"),
        "storageBucket": bare_host(env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET")),
        "messagingSenderId": env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID"),
        "appId": env("NEXT_PUBLIC_FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID"),
    }


@view(["GET"])
def auth_config(request):
    if auth_mode() == "FIREBASE":
        # Verify the Admin SDK actually initialized with the provided service
        # account. If it failed (malformed key, bad JSON, ...) fall back to
        # DEMO mode so the app stays usable instead of advertising a FIREBASE
        # mode that can never verify a token.
        init_error = firebase_init_error()
        if init_error is None:
            return Response({"mode": "FIREBASE", "firebase": _firebase_web_config()})
        return Response({
            "mode": "DEMO",
            "degraded": True,
            "reason": f"Firebase Admin SDK failed to initialize: {init_error}",
        })
    return Response({"mode": "DEMO"})


@view(["POST"])
def demo_login(request):
    body = _body(request)
    email, password = body.get("email"), body.get("password")
    if not email or not password:
        raise ApiError(400, "Email and password are required.")

    user = User.objects.filter(email=str(email).lower().strip()).first()
    if not user or not user.passwordHash:
        raise ApiError(401, "Invalid email or password.")

    if not scrypt_verify(str(password), user.passwordHash):
        raise ApiError(401, "Invalid email or password.")

    token = create_session_token(user.id)
    resp = Response({
        "user": user_public_dict(user),
        "demoMode": True,
        "sessionToken": token,
        "nonce": secrets.token_hex(4),
    })
    resp["Set-Cookie"] = session_cookie_header(token, request)
    return resp


@view(["POST"])
def demo_register(request):
    body = _body(request)
    email, password, name, role = body.get("email"), body.get("password"), body.get("name"), body.get("role")
    valid_roles = ["RECRUITER", "CANDIDATE"]
    if not email or not password or not name or role not in valid_roles:
        raise ApiError(400, "Name, email, password and a valid role (RECRUITER or CANDIDATE) are required.")
    if len(str(password)) < 8:
        raise ApiError(400, "Password must be at least 8 characters.")

    normalized_email = str(email).lower().strip()
    if User.objects.filter(email=normalized_email).exists():
        raise ApiError(409, "An account with this email already exists. Please sign in.")

    user = User.objects.create(
        email=normalized_email,
        passwordHash=scrypt_hash(str(password)),
        name=str(name).strip(),
        role=role,
    )

    # Role-specific profile shell
    if role == "RECRUITER":
        CompanyProfile.objects.create(userId=user, companyName=f"{user.name}'s Company")
    else:
        CandidateProfile.objects.create(userId=user, fullName=user.name)

    audit(normalized_email, "USER_REGISTERED", f"User:{user.id}", f"Role: {role}")
    notify(
        user.id,
        "Welcome to EthioHire!",
        "Complete your company profile and post your first job to start screening candidates automatically."
        if role == "RECRUITER"
        else "Complete your structured CV profile so recruiters can find you and you can take proctored assessments.",
    )

    token = create_session_token(user.id)
    resp = Response({"user": user_public_dict(user), "sessionToken": token})
    resp["Set-Cookie"] = session_cookie_header(token, request)
    return resp


@view(["POST"])
def demo_logout(request):
    resp = Response({"ok": True})
    resp["Set-Cookie"] = clear_session_cookie_header(request)
    return resp


@view(["GET"])
def auth_me(request):
    from ..ehauth import get_session_user

    user = get_session_user(request)
    # NOTE: 200 with `user: null` (not 401) for signed-out visitors — the SPA
    # probes this endpoint on every boot, and a 401 would paint a console
    # error on the login screen. Garbage tokens still disclose nothing.
    return Response({"user": user})


@view(["POST"])
def firebase_sync(request):
    """Syncs a Firebase-authenticated identity into the local database.

    A FIRST-TIME Firebase sign-in has no local user row yet, so
    require_user() would reject this request with 401 before provisioning
    could ever run (a deadlock that also existed in the original Next.js
    implementation). The Firebase identity is therefore resolved straight
    from the verified Bearer ID token; an already-established session
    (demo cookie / X-Session-Token) is still honored as a fallback.
    """
    from ..ehauth import get_session_user
    from ..firebase_admin import verify_firebase_id_token

    identity: dict | None = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        decoded = verify_firebase_id_token(auth_header[7:])
        if decoded:
            identity = {
                "uid": decoded.get("uid"),
                "email": (decoded.get("email") or "").lower(),
                "name": decoded.get("name") or "",
            }
    if identity is None:
        session = get_session_user(request)
        if session and session.get("firebaseUid"):
            identity = {
                "uid": session["firebaseUid"],
                "email": session["email"],
                "name": session.get("name") or "",
            }
    if identity is None:
        raise ApiError(401, "Authentication required. Please sign in.")
    if not identity["uid"]:
        raise ApiError(401, "No Firebase identity on this session.")

    body = _body(request)
    role = body.get("role")
    if role not in ["RECRUITER", "CANDIDATE", "ADMIN"]:
        role = "CANDIDATE"

    user = User.objects.filter(firebaseUid=identity["uid"]).first()
    if user is None and identity["email"]:
        user = User.objects.filter(email=identity["email"]).first()

    if user is None:
        email = identity["email"]
        if not email:
            raise ApiError(
                400,
                "Your Firebase account has no email address. Sign in with Email/Password or Google.",
            )
        name = body.get("name") or identity["name"] or email.split("@")[0]
        user = User.objects.create(
            email=email, name=name, role=role, firebaseUid=identity["uid"]
        )
        if role == "RECRUITER":
            CompanyProfile.objects.create(userId=user, companyName=f"{user.name}'s Company")
        else:
            CandidateProfile.objects.create(userId=user, fullName=user.name)
        notify(user.id, "Welcome to EthioHire!", "Your account was created via Firebase Authentication.")
        audit(email, "USER_REGISTERED_FIREBASE", f"User:{user.id}", f"Role: {role}")
    elif not user.firebaseUid:
        user.firebaseUid = identity["uid"]
        user.save(update_fields=["firebaseUid"])

    return Response({"user": user_public_dict(user)})
