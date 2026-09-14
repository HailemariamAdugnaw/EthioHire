# EthioHire — LiveKit Setup (Live Voice / Video Interviews)

**LiveKit** ([livekit.io](https://livekit.io)) is the open-source WebRTC SFU (Selective
Forwarding Unit) that powers EthioHire's human-led live interviews. Candidates who pass
the proctored exam get auto-scheduled into sequential, non-overlapping slots; each
interview gets its own LiveKit room with:

- **Low-latency voice/video** — the browser connects straight to the SFU with a
  short-lived access token minted by the Django API (server-side authorization,
  nothing proxied through the app server),
- **Question-bank display** — the interviewer drives which question is active and the
  candidate's screen follows in real time (LiveKit data channel),
- **Scoring template** — per-question 1–5 ratings, four competency scores, overall
  0–100 and structured notes, submitted at the end of the session and stored on the
  interview record,
- **Graceful degradation** — no camera/microphone? The room auto-retries in
  *listen-only* mode; LiveKit not configured? The room falls back to the built-in
  socket.io signaling service (`mini-services/interview-signaling`).

> **Nothing breaks without LiveKit.** While the env vars are empty, interview rooms
> run on the fallback transport and everything else keeps working.

---

## How EthioHire uses LiveKit

```
Browser (candidate) ──┐
                      │  1. GET /api/interviews/:id/livekit   (session auth)
Django REST API ──────┼─►  2. authorize: candidate of THIS application,
                      │     recruiter of THIS company, or admin
                      │  3. mint JWT access token (HS256, video grants, 4h TTL)
                      └─►  4. return { url, token, room, role }
                      │
Browser ──────────────┴──►  wss://<your-livekit>  (WebRTC media + data channel)
                            room = "interview-<interviewId>"
```

| Participant | Token grants |
|-------------|--------------|
| Candidate | `roomJoin`, `canPublish`, `canSubscribe`, `canPublishData` |
| Interviewer (recruiter/admin) | same + `roomAdmin` |

Interview invitations (Resend emails — see `RESEND_SETUP.md`) automatically contain
the in-app room link `/#/interview-room/<interviewId>` for VIDEO and VOICE formats.

---

## Option A — LiveKit Cloud (fastest, recommended to start)

1. Sign up at [cloud.livekit.io](https://cloud.livekit.io) (free tier: 50 GB/month
   media egress — hundreds of interview-hours).
2. **Create project** → name it `ethiohire`, pick the region closest to your users.
3. Open the project → **Settings → API Keys** → **Create key**.
4. Copy three values:
   - **Project URL** — `wss://ethiohire-xxxx.livekit.cloud`
   - **API Key** — e.g. `APIpkW3...`
   - **API Secret** — e.g. `f4ThCbB...` (shown once)
5. Put them in `.env` (Step "Configure EthioHire" below). Done — no servers, no TLS
   certificates, TURN included.

## Option B — Self-host with Docker (full control, no cloud cost)

1. Create `livekit.yaml`:

```yaml
# livekit.yaml — minimum production-ish config
port: 7880
bind_addresses:
  - 0.0.0.0
rtc:
  udp_port: 7882
  tcp_port: 7881
  use_external_ip: true          # required on public clouds
keys:
  # key: secret — choose your own long random secret (32+ chars)
  ethiohire-prod: replace-with-a-long-random-secret-000000
logging:
  level: info
```

2. Run the server:

```bash
docker run -d --name livekit --restart unless-stopped \
  -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  -v $(pwd)/livekit.yaml:/etc/livekit.yaml \
  livekit/livekit-server --config /etc/livekit.yaml
```

3. **TLS is mandatory** for browsers outside `localhost` — WebRTC needs a secure
   context. Put the LiveKit signal port behind your reverse proxy
   (Caddy example, automatic HTTPS):

```
livekit.yourdomain.com {
    reverse_proxy /rtc /* 127.0.0.1:7880
    reverse_proxy /tcp /* 127.0.0.1:7881
}
```

   …and set `LIVEKIT_URL=wss://livekit.yourdomain.com`.
4. For candidates behind strict corporate NATs add a **TURN service**
   ([livekit TURN](https://docs.livekit.io/home/self-hosting/turn.md)) — cloud
   projects already include one.

**Sandbox/dev shortcut** (used by this repo's tests): download the single binary and
run in dev mode — see `scripts/livekit-dev.yaml` and `scripts/livekit_ui_test.py`.

## Configure EthioHire

Add to your project-root `.env` (or your host's environment dashboard):

```env
LIVEKIT_URL=wss://ethiohire-xxxx.livekit.cloud     # or wss://livekit.yourdomain.com
LIVEKIT_API_KEY=ethiohire-prod
LIVEKIT_API_SECRET=replace-with-a-long-random-secret
PUBLIC_APP_URL=https://your-app.example.com        # so invite emails contain correct links
```

Restart the backend and verify:

```bash
curl http://localhost:8000/api/health
# { ..., "integrations": { ..., "livekit": "configured" } }
```

## Use it end-to-end

1. Candidate passes the text exam (or already has `EXAM_PASSED` applications).
2. Recruiter → **Applicants** (or job page) → *Auto-schedule interviews* — sequential
   non-overlapping slots are booked and every candidate receives an invitation email
   with the room link.
3. At the slot time both sides open the link → **Join live room** → the browser asks
   for camera/microphone → both see the "LiveKit connected" badge.
4. The interviewer advances through the **question bank** — the candidate's screen
   follows instantly. Side panel holds the **scoring template** (competencies 1–5,
   per-question ratings, overall score, notes).
5. **Submit evaluation & complete** → the interview is marked completed, the overall
   score is stored, and the candidate receives the decision email (Resend).

---

## How it works inside the codebase

| File | Purpose |
|------|---------|
| `backend/eh/livekit.py` | Config reader + JWT access-token minting (PyJWT, HS256, video grants) |
| `backend/eh/views/misc.py` | `GET /api/interviews/:id/livekit` (authorized token endpoint), `POST /api/interviews/:id/evaluation` (scoring template) |
| `backend/eh/views/applications.py` | `_apply_meeting_link` — join links on scheduled interviews |
| `frontend/src/components/ethiohire/candidate/interview-room.tsx` | `LiveKitRoom` + `VideoConference` UI, question-bank sync (data channel), scoring template panel, listen-only degradation, legacy fallback |
| `scripts/livekit_ui_test.py` | Two-browser E2E against a real SFU (connection, question sync, evaluation) |
| `scripts/livekit-dev.yaml` | Local dev server config matching the repo's test credentials |

Token details: HS256 JWT with `iss = API key`, `sub = <identity>`,
`video = { room, roomJoin, canPublish, canSubscribe, canPublishData, roomAdmin }`,
valid 4 hours, one room per interview (`interview-<id>`). Candidates never receive
`roomAdmin`.

---

## Troubleshooting

| Symptom | Cause & fix |
|---------|-------------|
| Room shows "Local mode" (legacy transport) | `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` not set or backend not restarted — check `/api/health` → `integrations.livekit` |
| "Live connection failed" toast after join | Server unreachable: wrong URL, TLS certificate invalid, or firewall blocking TCP 7880 — for self-hosted, verify `wss://` works in a browser first |
| Connects but no video/audio tiles | Participants didn't grant camera/mic permission, or no webcam — the room auto-joins **listen-only** in that case (expected in headless test browsers) |
| `token invalid` / `jwt` errors in LiveKit logs | `LIVEKIT_API_SECRET` doesn't match the secret configured on the LiveKit server (or key/secret pair from a different project) |
| Works on Wi-Fi, fails on corporate network | UDP blocked — deploy TURN (`livekit turnserver`) and reference it in `livekit.yaml` `turn` section; cloud projects include TURN automatically |
| Candidate and interviewer don't see each other | They must open the **same interview id** (room = `interview-<id>`) — check the meeting link in the invitation email |
| Question display not syncing | Both sides must be connected (green badge) — the sync rides the LiveKit data channel, which requires a live connection |
| Self-host: room closes after inactivity | Normal — LiveKit reclaims idle rooms (`departure timeout`); a fresh token reconnects instantly |

**Production checklist**

- [ ] `wss://` URL with a valid certificate (cloud = automatic)
- [ ] TURN enabled for mobile/corporate networks
- [ ] Region closest to your candidates
- [ ] `PUBLIC_APP_URL` set so invitation emails carry working links
- [ ] Load: one SFU node comfortably handles hundreds of concurrent interview participants
