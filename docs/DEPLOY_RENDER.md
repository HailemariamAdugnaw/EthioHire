# EthioHire — Deploy to Render (Step by Step)

This guide deploys the **Django REST Framework backend** (with a managed
PostgreSQL database) to [Render](https://render.com), which is where the
frontend's `/api` calls land (see `DEPLOY_VERCEL.md` for the frontend half).

---

## Step 0 — Prerequisites

- A [Render](https://render.com) account
- The project pushed to GitHub/GitLab
- Estimated cost: PostgreSQL free tier + Web Service free tier work for demos

## Step 1 — Create the PostgreSQL database

1. Render Dashboard → **New + → PostgreSQL**.
2. Name: `ethiohire-db`, region closest to your users, plan: **Free** (demo).
3. After it provisions, open the **Info** tab and copy the
   **External Database URL** (starts with `postgres://…`). You will paste it
   as an environment variable in Step 2.

## Step 2 — Create the Django Web Service

1. Render Dashboard → **New + → Web Service** → connect your repo.
2. Configure:

   | Setting             | Value |
   |---------------------|-------|
   | **Name**            | `ethiohire-api` |
   | **Root Directory**  | *(leave empty — build files live at repo root)* |
   | **Runtime**         | Python 3 |
   | **Build Command**   | `pip install -r backend/requirements.txt gunicorn` |
   | **Start Command**   | `cd backend && python manage.py migrate --noinput && python manage.py seed && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 3 --timeout 120` |

3. Under **Advanced → Add Environment Variable**, add:

   ```env
   DJANGO_SECRET_KEY=<long-random-string>
   AUTH_SECRET=<another-long-random-string>
   DJANGO_DEBUG=0
   DJANGO_ALLOWED_HOSTS=ethiohire-api.onrender.com
   PGHOST=<host from the External Database URL>
   PGPORT=5432
   PGDATABASE=<dbname>
   PGUSER=<user>
   PGPASSWORD=<password>
   ```

   > Tip: the External Database URL is
   > `postgres://USER:PASSWORD@HOST/DBNAME` — split it across the five
   > `PG*` variables above.

4. Click **Create Web Service**. The first deploy runs migrations and seeds
   the demo data automatically (the seed step is idempotent).

## Step 3 — Verify the API

Open `https://ethiohire-api.onrender.com/api/health`:

```json
{"status":"ok","app":"EthioHire","database":"up","authMode":"DEMO","timestamp":"..."}
```

Sign in from a terminal to double-check:

```bash
curl -X POST https://ethiohire-api.onrender.com/api/auth/demo-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ethiohire.et","password":"Admin123!"}'
```

## Step 4 — Connect the frontend

- **Vercel (recommended):** follow `DEPLOY_VERCEL.md` — its rewrite proxies
  `/api/*` to `https://ethiohire-api.onrender.com`, keeping cookies same-origin.
- **Render Static Site (alternative):** create a Static Site with
  Root Directory `frontend`, build `npm install && npm run build`, publish
  `dist`, and add the same `/api/*` rewrite rule in `vercel.json`-style
  Render rewrite headers.

## Step 5 — Firebase auth (optional)

1. Complete `FIREBASE_SETUP.md` and copy the minified service-account JSON.
2. On the Render Web Service → Environment, add:

   ```env
   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...minified...}
   NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-app
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
   NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef
   ```

3. Save — Render redeploys automatically. `/api/health` now reports
   `"authMode":"FIREBASE"`.
4. Add `https://ethiohire-api.onrender.com` and your frontend domain to the
   Firebase **Authorized domains** list.

## Step 6 — Background workers & cron (optional)

- Free Render services sleep after 15 minutes of inactivity; the first
  request then takes ~30s to wake. Upgrade the plan or add a
  [cron-job.org](https://cron-job.org) ping every 10 minutes for demos.
- Database backups: Render PostgreSQL → **Backups** tab (paid plans).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Deploy fails at `pip install` | Build command must include `gunicorn` (see Step 2) |
| `database "ethiohire" does not exist` | The Render PostgreSQL database name comes from the External URL — set `PGDATABASE` to that exact name |
| 502 / service asleep | Free tier sleeps — upgrade or add a keep-alive ping |
| CORS errors in the browser console | Keep using the frontend `/api` rewrite (same-origin); if calling the API cross-origin directly, allowlist the origin in `backend/config/settings.py` |
