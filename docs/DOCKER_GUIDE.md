# EthioHire — Run with Docker (Step by Step)

This guide runs the full EthioHire stack locally with Docker Compose:

| Service     | Image / build                                  | Purpose                                                        |
|-------------|------------------------------------------------|----------------------------------------------------------------|
| `frontend`  | built from `frontend/Dockerfile` (Node 22 → nginx) | React SPA + reverse proxy for `/api` and `/signal`            |
| `backend`   | built from `Dockerfile` (Python 3.12 + gunicorn) | Django REST Framework API — auth, jobs, exams, interviews, admin |
| `db`        | `postgres:16-alpine`                           | PostgreSQL — users, jobs, applications, proctoring logs        |
| `signaling` | built from `mini-services/interview-signaling`  | WebRTC socket.io signaling for live interview rooms            |

> The frontend nginx container serves the built React app and proxies
> `/api/*` to Django and `/signal/*` to the signaling service, so the browser
> always talks to a single origin (cookies and relative paths keep working).

---

## Step 0 — Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS/Windows) or
  Docker Engine + Compose plugin (Linux): `docker --version && docker compose version`
- A Firebase project (optional — see `FIREBASE_SETUP.md`; without it the app runs in demo auth mode)

## Step 1 — Configure environment variables

1. From the project root, copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` — the defaults work out of the box for Docker:

   ```env
   DJANGO_SECRET_KEY=change-me-to-a-long-random-string
   AUTH_SECRET=change-me-to-a-different-long-random-string
   PGPASSWORD=ethiohire
   # Firebase (optional — see docs/FIREBASE_SETUP.md)
   FIREBASE_SERVICE_ACCOUNT_JSON=
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=
   ```

3. If you want the app on a different port, change `APP_PORT` (default `3000`).

## Step 2 — Build and start everything

```bash
docker compose up -d --build
```

What happens on first boot:

1. `db` starts and initializes the `ethiohire` database.
2. `backend` waits for the DB, runs `python manage.py migrate`, seeds the demo
   data (idempotent — it skips if the admin user already exists), then serves
   the API with gunicorn on :8000.
3. `frontend` builds the React app (Vite) and serves it with nginx on port 3000.
4. `signaling` starts the socket.io server used by live interview rooms.

Check status:

```bash
docker compose ps
docker compose logs -f backend
```

## Step 3 — Open the app

Open **http://localhost:3000** and sign in with a demo account:

| Account   | Email                        | Password    |
|-----------|------------------------------|-------------|
| Admin     | `admin@ethiohire.et`         | `Admin123!` |
| Recruiter | `hr@addistech.et`            | `Demo123!`  |
| Recruiter | `hr@riftvalleybank.et`       | `Demo123!`  |
| Candidate | `candidate@ethiohire.et`     | `Demo123!`  |

Sanity check the API from a terminal:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","app":"EthioHire","database":"up","authMode":"DEMO",...}
```

## Step 4 — Enable Firebase (optional)

1. Follow `docs/FIREBASE_SETUP.md` and copy the service-account JSON.
2. Put the minified JSON into `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env`
   plus the six `NEXT_PUBLIC_FIREBASE_*` values.
3. Restart: `docker compose up -d backend frontend`

The health endpoint will now report `"authMode":"FIREBASE"`.

## Step 5 — Common operations

```bash
# Reset the database (deletes all data)
docker compose down -v

# Rebuild after pulling new code
docker compose up -d --build

# Open a Django shell
docker compose exec backend python manage.py shell

# Seed more demo data (idempotent)
docker compose exec backend python manage.py seed
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `backend` loops on "db not ready" | `docker compose logs db` — wait for the healthcheck, then `docker compose restart backend` |
| Login works but every API call 401s | Make sure you are browsing through the frontend container (port 3000), not directly hitting :8000 — cookies are set by the API through the same origin |
| Interview room shows "offline" | Check `docker compose logs signaling`; the frontend must be built with `VITE_SIGNALING_URL=/signal` (the provided Dockerfile does this) |
| Port 3000 already in use | Set `APP_PORT=8080` (or any free port) in `.env` and restart |
