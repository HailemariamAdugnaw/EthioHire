"""
EthioHire — shared API plumbing: errors, view decorator, JS-compatible
formatting helpers, audit + notification helpers.

The decorator + helpers mirror src/lib/auth.ts jsonError() and
src/lib/api-utils.ts from the original Next.js implementation, so the React
frontend keeps receiving `{ "error": "<message>" }` envelopes with identical
status codes and messages.
"""
import functools
import traceback

from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response

from .models import AuditLog, Notification


class ApiError(Exception):
    """HTTP error carrying a user-facing message — mirrors HttpError in auth.ts."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status = status_code
        self.message = message


def require(condition, status_code: int, message: str) -> None:
    if not condition:
        raise ApiError(status_code, message)


def view(methods):
    """
    Wrap a function into a DRF api_view with:
      - no DRF auth/permission machinery (custom session auth in ehauth.py)
      - ApiError -> {"error": message} at its status code
      - unexpected exceptions -> 500 {"error": ...} (logged to stderr)
    """

    def decorator(fn):
        @api_view(methods)
        @authentication_classes([])
        @permission_classes([])
        @functools.wraps(fn)
        def wrapped(request, *args, **kwargs):
            try:
                return fn(request, *args, **kwargs)
            except ApiError as exc:
                return Response({"error": exc.message}, status=exc.status)
            except Exception as exc:  # noqa: BLE001
                traceback.print_exc()
                return Response(
                    {"error": str(exc) or "Internal server error"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        return wrapped

    return decorator


# ---------- JS-compatible scalar formatting ----------

def parse_client_dt(val):
    """Parse an ISO datetime coming from the client ('...Z' or offset form or
    naive 'YYYY-MM-DDTHH:mm'). Returns an aware datetime or None."""
    import datetime as _dt

    from django.utils.dateparse import parse_datetime
    from django.utils import timezone as dj_tz

    if val in (None, ""):
        return None
    s = str(val).strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = parse_datetime(s)
    if dt is None:
        return None
    if dj_tz.is_naive(dt):
        dt = dt.replace(tzinfo=_dt.timezone.utc)
    return dt


def jsnum(n):
    """Render a JS-style number: integral floats lose the trailing .0"""
    if n is None:
        return None
    f = float(n)
    return int(f) if f.is_integer() else f


def jsloc(n) -> str:
    """JS Number.prototype.toLocaleString() equivalent (en-US, no fractions)."""
    f = float(n)
    if f.is_integer():
        return f"{int(f):,}"
    return f"{f:,.3f}".rstrip("0").rstrip(".")


def display_tzinfo():
    """Timezone used to render human-readable datetimes in emails/notices.

    The API itself always returns UTC ISO-8601 (browsers convert to the
    viewer's local time), but outbound EMAIL has no client to convert — the
    time shown must be rendered server-side. DISPLAY_TIMEZONE (IANA name)
    controls it; EthioHire defaults to Addis Ababa so candidates and
    recruiters see the wall-clock time they actually picked."""
    import datetime as _dt
    import os

    name = (os.environ.get("DISPLAY_TIMEZONE") or "Africa/Addis_Ababa").strip()
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(name)
    except Exception:  # noqa: BLE001 — unknown zone name on a slim image
        return _dt.timezone.utc


def js_locale_datetime(dt) -> str:
    """Node's Date.toLocaleString() (en-US, 12h): '9/13/2026, 2:30:05 PM'

    Timezone-aware: converts to DISPLAY_TIMEZONE (default Africa/Addis_Ababa)
    before formatting — historically this rendered raw UTC hours, which made
    every scheduled time in every email disagree with the picker."""
    import datetime as _dt

    from django.utils import timezone as dj_tz

    if dj_tz.is_naive(dt):
        dt = dj_tz.make_aware(dt, _dt.timezone.utc)
    local = dt.astimezone(display_tzinfo())
    h24 = local.hour
    ampm = "AM" if h24 < 12 else "PM"
    h12 = h24 % 12
    if h12 == 0:
        h12 = 12
    return f"{local.month}/{local.day}/{local.year}, {h12}:{local.minute:02d}:{local.second:02d} {ampm}"


# ---------- Side-effect helpers (src/lib/api-utils.ts) ----------

def audit(actor_email, action, entity=None, details=None) -> None:
    try:
        AuditLog.objects.create(actorEmail=actor_email, action=action, entity=entity, details=details)
    except Exception as exc:  # noqa: BLE001
        print("[EthioHire] audit log failed:", exc)


def notify(user_id, title, body=None, channel="IN_APP") -> None:
    """In-app notification row + optional outbound delivery.

    EMAIL / SMS channels are routed through eh.notifications (Resend / SMS
    adapter), which also records every attempt in NotificationLog. Fail-safe:
    provider problems never break the API request that triggered this.
    """
    try:
        from . import notifications as outbound

        outbound.push(
            user_id, title, body,
            channel=channel,
            decision_point="GENERAL",
        )
    except Exception as exc:  # noqa: BLE001
        # last-resort fallback: at least persist the in-app row
        try:
            Notification.objects.create(user_id=user_id, title=title, body=body, channel=channel)
        except Exception:  # noqa: BLE001
            pass
        print("[EthioHire] notification failed:", exc)
