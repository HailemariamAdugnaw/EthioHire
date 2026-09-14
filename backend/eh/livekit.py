"""EthioHire — LiveKit room access tokens for live interviews.

LiveKit is an open-source WebRTC SFU. The Django API never proxies media —
it only mints short-lived access tokens (JWT, HS256) carrying *video grants*
that say which room a participant may join and what they can do there:

    {
      "iss": "<LIVEKIT_API_KEY>",        # API key
      "sub": "<identity>",               # stable participant identity
      "nbf" / "exp": <window>,           # token validity (default 4 h)
      "video": {
        "room": "interview-<id>",
        "roomJoin": true,
        "canPublish": true, "canSubscribe": true, "canPublishData": true,
        "roomAdmin": true|false          # interviewer only
      },
      "name": "Display name"
    }

The browser then connects straight to LIVEKIT_URL (wss://...) with the token.
Environment: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET — see
docs/LIVEKIT_SETUP.md.
"""
import os
import time
import uuid

import jwt

TOKEN_TTL_SECONDS = 4 * 60 * 60


def config() -> dict:
    return {
        "url": (os.environ.get("LIVEKIT_URL") or "").strip(),
        "apiKey": (os.environ.get("LIVEKIT_API_KEY") or "").strip(),
        "apiSecret": (os.environ.get("LIVEKIT_API_SECRET") or "").strip(),
    }


def is_configured() -> bool:
    c = config()
    return bool(c["url"] and c["apiKey"] and c["apiSecret"])


def room_name(interview_id: str) -> str:
    return f"interview-{interview_id}"


def mint_token(room: str, identity: str, name: str, admin: bool = False, ttl: int = TOKEN_TTL_SECONDS) -> str:
    """Mint a LiveKit access token for one participant."""
    c = config()
    now = int(time.time()) - 5  # small clock-skew buffer
    payload = {
        "iss": c["apiKey"],
        "sub": identity,
        "jti": str(uuid.uuid4()),
        "name": name,
        "video": {
            "room": room,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
            "roomAdmin": bool(admin),
            "recorder": False,
            "hidden": False,
        },
        "nbf": now,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(payload, c["apiSecret"], algorithm="HS256")


__all__ = ["config", "is_configured", "room_name", "mint_token", "TOKEN_TTL_SECONDS"]
