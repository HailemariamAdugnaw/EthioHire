# EthioHire — Deploy to Vercel (Step by Step)

EthioHire splits into two deployable pieces:

- **Frontend** — React SPA (Vite build) → **Vercel**
- **Backend API** — Django REST Framework + PostgreSQL → **Render** (see
  `DEPLOY_RENDER.md`) or any Python host

Vercel's rewrites proxy `/api/*` from the frontend domain to your backend,
so the app keeps using same-origin relative paths and cookies. **No frontend
code changes are needed.**

---

## Step 0 — Prerequisites

- A [Vercel](https://vercel.com) account (free Hobby plan is enough)
- A [GitHub](https://github.com) repo containing this project
- The backend deployed first (Render guide) — note its public URL, e.g.
  `https://ethiohire-api.onrender.com`

## Step 1 — Push the repository

```bash
git init
git add .
git commit -m "EthioHire — React + DRF + PostgreSQL"
git branch -M main
git remote add origin https://github.com/<you>/ethiohire.git
git push -u origin main
```

## Step 2 — Create the frontend project on Vercel

1. Go to **vercel.com → Add New → Project** and import your repo.
2. Configure the project:

   | Setting                | Value                 |
   |------------------------|-----------------------|
   | **Root Directory**     | `frontend`            |
   | **Framework Preset**   | Vite                  |
   | **Build Command**      | `npm run build`       |
   | **Output Directory**   | `dist`                |
   | **Install Command**    | `npm install`         |

3. Under **Environment Variables** add (optional — only if you deploy the
   interview signaling service separately):

   | Name                 | Value                                |
   |----------------------|--------------------------------------|
   | `VITE_SIGNALING_URL` | `https://your-signaling-host:3031`   |

## Step 3 — Proxy `/api` to your backend

Create **`frontend/vercel.json`** (commit it to the repo):

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://ethiohire-api.onrender.com/api/:path*"
    }
  ]
}
```

Replace the host with your real Render backend URL. Redeploy after adding
this file — Vercel rewrites make every `/api/...` request hit Django from the
browser's same origin, which is what the session cookie logic expects.

## Step 4 — Backend CORS

On Render, set the backend env var:

```env
DJANGO_ALLOWED_HOSTS=ethiohire-api.onrender.com
```

`django-cors-headers` is already configured to allow all origins with
credentials — same-origin cookies travel through the Vercel rewrite, so no
extra CORS work is required. If you prefer stricter settings, replace
`CORS_ALLOW_ALL_ORIGINS` in `backend/config/settings.py` with an explicit
allowlist including your Vercel domain (`https://your-app.vercel.app`).

## Step 5 — Verify

1. Open `https://your-app.vercel.app` — the landing page renders.
2. Sign in with `admin@ethiohire.et / Admin123!` (seeded data) — you should
   land in the Admin portal and the analytics charts should fill in.
3. Check `https://your-app.vercel.app/api/health` — it should return
   `{"status":"ok","database":"up",...}` served through the rewrite.

## Step 6 — Firebase auth (optional)

Follow `FIREBASE_SETUP.md`:

- Add `https://your-app.vercel.app` to Firebase **Authorized domains**.
- Set `FIREBASE_SERVICE_ACCOUNT_JSON` + `NEXT_PUBLIC_FIREBASE_*` on the
  **Render backend** (the backend exposes the public config to the client via
  `/api/auth/config` — no Firebase env vars are needed on Vercel).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `/api/health` 404 through Vercel | The rewrite file must be named `vercel.json` **inside `frontend/`** (the Vercel root directory) and the project redeployed |
| 502 on API calls | Backend URL typo in the rewrite, or the Render free-tier service is asleep — open the backend URL directly once |
| Cookies not persisted | Ensure you always reach the app through the Vercel domain (the rewrite keeps everything same-origin); clearing site data and retrying also re-issues the session |
