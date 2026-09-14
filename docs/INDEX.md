# EthioHire — Documentation Index

**EthioHire** is an automated recruitment, pre-screening, and interview platform built for the
Ethiopian job market — React frontend, Django REST Framework API, PostgreSQL database.
Pick the guide that matches what you want to do:

| Guide | What you'll accomplish |
|-------|------------------------|
| **Firebase Setup** (`firebase`) | Configure Firebase Authentication step by step — create the project, enable Email/Password + Google sign-in, wire up the Admin SDK, and activate Firebase mode in the app. |
| **Resend Setup** (`resend`) | Turn on the Reporting & Decisioning email layer — decision-point notifications, evaluation summaries with match scores and proctoring audit logs, plus the SMS adapter. |
| **LiveKit Setup** (`livekit`) | Enable live voice/video interview rooms over WebRTC — question-bank display, scoring templates, token auth, cloud or self-hosted. |
| **Run with Docker** (`docker`) | Launch the complete stack (React/nginx frontend + Django/gunicorn API + PostgreSQL + WebRTC signaling) with `docker compose up`, understand the services, and manage data/volumes. |
| **Deploy to Vercel** (`vercel`) | Ship the React frontend to Vercel and proxy `/api` to your DRF backend, keeping cookies and relative paths intact. |
| **Deploy to Render** (`render`) | Host the Django REST Framework API as a Web Service with managed PostgreSQL, migrate + seed on boot, and wire up Firebase. |

## Quick start (local, no Docker)

```bash
# 1. Backend — Python 3.12+, PostgreSQL 16
pip install -r backend/requirements.txt
cd backend && python manage.py migrate && python manage.py seed && python manage.py runserver 127.0.0.1:8000

# 2. Frontend — Node 18+ (proxies /api to :8000)
cd frontend && npm install && npm run dev   # http://localhost:3000
```

Or the one-command sandbox stack: `bun run dev` (starts PostgreSQL, Django,
signaling and Vite together — see `scripts/dev-stack.sh`).

## Demo accounts (seeded)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@ethiohire.et` | `Admin123!` |
| Recruiter | `hr@addistech.et` | `Demo123!` |
| Recruiter | `hr@riftvalleybank.et` | `Demo123!` |
| Candidate | `candidate@ethiohire.et` | `Demo123!` |

## Recommended reading order for a production launch

1. `firebase` — get real authentication working locally
2. `resend` — switch on decision-point email notifications (evaluation summaries, proctoring audit reports, invitations)
3. `livekit` — enable real WebRTC interview rooms with question display and scoring templates
4. `docker` — verify the full stack runs in containers
5. `render` — host the API + PostgreSQL
6. `vercel` — host the React frontend and proxy to the API
