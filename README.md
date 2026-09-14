# EthioHire — Automated Recruitment, Pre-Screening & Interview Platform

EthioHire digitizes Ethiopian recruitment end-to-end: structured candidate profiles, an
automated pre-screening ATS, proctored online assessments with anti-cheating controls,
live voice/video interviews, and a full admin console.

**Stack:** React 19 (Vite) · Django REST Framework · PostgreSQL 16 · Firebase Auth (optional) · socket.io (WebRTC signaling)

---

## Architecture

```
┌──────────────────────┐         ┌──────────────────────────┐         ┌──────────────┐
│  React SPA (Vite)    │  /api/* │  Django REST Framework   │  SQL    │  PostgreSQL  │
│  3 portals + exam    │ ──────► │  ~25 JSON endpoints      │ ──────► │  16          │
│  room + interviews   │  proxy  │  session/Firebase auth   │         └──────────────┘
│  port 3000           │         │  port 8000               │
└──────────────────────┘         └──────────────────────────┘
          │  socket.io (live interview WebRTC)    ▲
          └──────────────────────────────────────►│ signaling :3031
```

- **Frontend** (`frontend/`) — React 19 + TypeScript + Tailwind CSS 4, hash-routed SPA.
  In dev, Vite proxies `/api/*` to Django; in production nginx (or Vercel rewrites) does.
- **Backend** (`backend/`) — Django 5/6 + DRF, PostgreSQL, custom HMAC session auth with
  Firebase ID-token (Bearer) support, server-side exam grading and pre-screening engine.
- **Signaling** (`mini-services/interview-signaling/`) — bun + socket.io WebRTC relay.

## Feature map

- **Three portals** — Candidate, Recruiter/HR, Admin (role-guarded, plus a public landing page)
- **Stage 1 — Pre-screening:** knockout questionnaires, GPA / graduation-window / experience /
  salary-budget hard filters, weighted 0–100 match score
- **Stage 2 — Proctored exam:** fullscreen + webcam monitoring, violation tracking with
  auto-termination, per-question timers, server-side grading for **4 question types**:
  multiple choice · true/false · fill-in-the-blank · free text
- **Stage 3 — Live interviews:** WebRTC rooms with in-room chat, recruiter scoring
- **Stage 4 — Decisioning:** shortlist / reject / schedule / hire with notification fan-out
- **Admin console:** analytics funnel + charts, company verification, subscription plans,
  audit logs, platform settings, and the in-app **Setup Guides** (admin-only)

## Repository layout

```
backend/                  Django project (config + eh app)
  config/                 settings, urls, wsgi
  eh/                     models, auth, matching, questions, views/
  eh/management/commands/ seed.py (demo data)
frontend/                 React SPA (Vite + TypeScript + Tailwind 4)
  src/components/ethiohire/   all portal components
  src/lib/auth-client.tsx     dual-mode auth client
mini-services/interview-signaling/   WebRTC signaling (bun + socket.io)
docs/                     step-by-step guides (also rendered in-app, admin portal)
scripts/                  dev-stack.sh, start_postgres.py, e2e_drf.py, exam_ui_test.py
docker/                   backend entrypoint
Dockerfile                Django backend image
docker-compose.yml        frontend + backend + db + signaling
```

## Quick start (local, no Docker)

Prerequisites: Python 3.12+, PostgreSQL 16 running locally, Node 18+ (or bun).

```bash
# 1 — environment
cp .env.example .env            # defaults match the local PostgreSQL below

# 2 — backend
pip install -r backend/requirements.txt
cd backend
python manage.py migrate
python manage.py seed           # demo companies, jobs, applications
python manage.py runserver 127.0.0.1:8000

# 3 — frontend (new terminal)
cd frontend
npm install
npm run dev                     # http://localhost:3000 (proxies /api → :8000)
```

One-command stack (used in the sandbox, also good for Linux/macOS dev):
`bun run dev` — boots PostgreSQL (via `scripts/start_postgres.py`), migrates + seeds,
starts Django on :8000, the signaling service on :3031 and Vite on :3000.

## Docker (one command)

```bash
cp .env.example .env
docker compose up -d --build    # → http://localhost:3000
```

See `docs/DOCKER_GUIDE.md` for the full walkthrough.

## Demo accounts (seeded)

| Role      | Email                      | Password    |
|-----------|----------------------------|-------------|
| Admin     | `admin@ethiohire.et`       | `Admin123!` |
| Recruiter | `hr@addistech.et`          | `Demo123!`  |
| Recruiter | `hr@riftvalleybank.et`     | `Demo123!`  |
| Candidate | `candidate@ethiohire.et`   | `Demo123!`  |

## Authentication modes

| Mode | How it activates | Details |
|------|------------------|---------|
| **DEMO** (default) | No Firebase env vars | HMAC-signed HttpOnly session cookie + `X-Session-Token` fallback |
| **FIREBASE** | `FIREBASE_SERVICE_ACCOUNT_JSON` present | Bearer ID tokens verified with the Admin SDK; guide: `docs/FIREBASE_SETUP.md` |

The mode is detected at runtime from `/api/auth/config` — the same build runs in both modes.

## Testing

```bash
# API end-to-end suite (~100 assertions; backend + frontend stack must be running)
python3 scripts/e2e_drf.py

# Proctored exam UI test (Playwright, fake webcam — all 4 question types)
python3 scripts/exam_ui_test.py

# Frontend typecheck
cd frontend && npm run build
```

## Deployment guides

All guides are in `docs/` **and** rendered inside the app (Admin portal → Setup Guides):

- `docs/FIREBASE_SETUP.md` — Firebase Authentication (Email/Password + Google)
- `docs/DOCKER_GUIDE.md` — full stack with Docker Compose
- `docs/DEPLOY_VERCEL.md` — React frontend on Vercel (proxied `/api`)
- `docs/DEPLOY_RENDER.md` — Django API + PostgreSQL on Render
