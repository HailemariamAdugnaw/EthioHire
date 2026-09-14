# EthioHire — Firebase Authentication Setup (Step by Step)

This guide walks you through configuring **Firebase Authentication** for the EthioHire platform.
When Firebase is configured, sign-in/sign-up is handled by Firebase (Email/Password + Google),
and every API request is verified server-side with the Firebase Admin SDK.

> **Demo mode:** if you skip this guide, EthioHire automatically falls back to its built-in
> demo auth (signed HTTP-only cookies), so the platform remains fully testable without a
> Firebase project. The app detects Firebase at runtime from environment variables.

---

## Overview — how Firebase auth works in EthioHire

```
Browser                          Django REST API                     Firebase
───────                          ──────────────────                  ────────
1. Sign in / sign up  ───────────────────────────────────────────►  Firebase Auth SDK
2. Receives ID token  ◄───────────────────────────────────────────  (firebase JWT)
3. Calls API with
   Authorization: Bearer <idToken> ──►  /api/auth/* verifies token
                                        with firebase-admin (Admin SDK)
                                     ──►  maps to User row in PostgreSQL
                                          (upsert + role binding)
```

Key files in this project:

| File | Purpose |
|------|---------|
| `backend/eh/firebase_admin.py` | Lazy-initializes the Admin SDK from `FIREBASE_SERVICE_ACCOUNT_JSON` |
| `backend/eh/ehauth.py` | `get_session_user()` — verifies Bearer tokens **or** demo cookies |
| `frontend/src/lib/auth-client.tsx` | Client SDK wrapper (`signIn`, `signUp`, `signInWithGoogle`) |
| `backend/eh/views/auth.py` | `/api/auth/config` tells the browser which auth mode is active |

---

## Step 1 — Create a Firebase project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com) and sign in with a Google account.
2. Click **"Create a project"** (or **"Add project"**).
3. Project name: enter `ethiohire` (or `ethiohire-prod`).
4. **Google Analytics**: you may disable it for this project (not required). Click **Continue**.
5. Wait for provisioning, then click **Continue** to open the project console.

## Step 2 — Enable Authentication providers

1. In the left sidebar, click **Build → Authentication**.
2. Click **Get started**.
3. Under *Sign-in method*, enable each provider you want:

   **a) Email/Password (required)**
   - Click **Email/Password** → toggle **Enable** → **Save**.

   **b) Google (recommended)**
   - Click **Google** → toggle **Enable**.
   - Set a support email (your own) → **Save**.

4. (Optional) Add more providers later (phone, GitHub, etc.) — EthioHire uses
   Email/Password and Google out of the box.

## Step 3 — Register the EthioHire web app and copy its config

1. Back on the project overview, click the **gear icon → Project settings**.
2. Under the **General** tab, scroll to **Your apps** and click the **web icon (`</>`)**.
3. App nickname: `EthioHire Web` → click **Register app** (skip hosting).
4. Firebase shows a `firebaseConfig` object. Copy these **6 values**:

```js
const firebaseConfig = {
  apiKey: "AIzaSy…",            // NEXT_PUBLIC_FIREBASE_API_KEY
  authDomain: "ethiohire.firebaseapp.com",   // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  projectId: "ethiohire",       // NEXT_PUBLIC_FIREBASE_PROJECT_ID
  storageBucket: "ethiohire.appspot.com",    // NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "123456789012",          // NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  appId: "1:123456789012:web:abc123",         // NEXT_PUBLIC_FIREBASE_APP_ID
};
```

## Step 4 — Generate the Admin SDK service account (server-side verification)

1. In **Project settings → Service accounts**.
2. Click **"Generate new private key"** → confirm → a JSON file downloads
   (e.g. `ethiohire-firebase-adminsdk-xxxxx.json`).
3. Keep this file **secret** — never commit it to Git.

You have two options to provide it to the app:

**Option A (recommended for Vercel/Render/Docker):** minify the JSON into a single line and
set it as the `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable:

```bash
# collapse the JSON to one line (macOS/Linux)
node -e "console.log(JSON.stringify(require('./ethiohire-firebase-adminsdk.json')))"
```

**Option B (local dev):** save the file as `firebase-service-account.json` in the project root
and add it to `.gitignore`. (Option A is still required for hosted deployments.)

## Step 5 — Configure environment variables

Put these in a **`.env` file at the project root** (copy from `.env.example`). The file is
loaded automatically by `backend/config/settings.py` — no `export` needed, no rebuild —
or set them in your host's dashboard (Docker Compose reads `.env` too).
Real environment variables always win over `.env` values.

```env
# ---------- PostgreSQL ----------
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=ethiohire
PGUSER=postgre
PGPASSWORD=your-password
# Docker Compose uses PGHOST=db automatically.

# ---------- Firebase (client) ----------
# authDomain / storageBucket must be BARE HOSTS — do NOT prefix https://
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy…
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ethiohire.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ethiohire
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=ethiohire.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abc123

# ---------- Firebase (server) ----------
# The full service-account JSON as ONE line (Step 4, Option A).
# Keep the \n escapes inside private_key exactly as downloaded.
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"ethiohire",…}

# ---------- Session signing (used in demo mode; set a random string) ----------
AUTH_SECRET=change-me-to-a-long-random-string
```

> - The Django backend reads these at runtime and exposes the public client
>   config via `/api/auth/config`, so **no rebuild tricks are needed** — just
>   restart the backend after editing the file. These values are never read by
>   the frontend build (Vite); the browser fetches them from the API.
> - `VITE_FIREBASE_*` aliases are accepted for every `NEXT_PUBLIC_FIREBASE_*` key.
> - If `authDomain` / `storageBucket` are pasted with an `https://` prefix, the
>   backend strips the scheme automatically before serving them to the browser.
> - If `FIREBASE_SERVICE_ACCOUNT_JSON` is present but the Admin SDK fails to
>   initialize (malformed key/JSON), `/api/auth/config` **degrades to DEMO mode**
>   with a `reason` field instead of advertising a FIREBASE mode that can never
>   verify a token — check the backend log for the exact cause.

## Step 6 — Restart and verify

1. Restart the dev server (or Docker container).
2. Open the app → you should be redirected to sign-in.
3. The alert at the bottom of the sign-in card should now read
   **"Firebase Authentication active"** instead of "Demo authentication mode".
4. Register a new account (choose Candidate or Recruiter). EthioHire:
   - creates the user in Firebase Auth,
   - calls `/api/auth/firebase-sync` with the ID token,
   - creates the matching row in the `users` table with the chosen role,
   - issues a session that all API routes verify via `Authorization: Bearer`.

## Step 7 — Authorized domains (important for Google sign-in & hosting)

1. Firebase console → **Authentication → Settings → Authorized domains**.
2. Add every domain where the app runs:
   - `localhost` (already present) — for local development,
   - `your-app.vercel.app` (and preview URLs) — see `DEPLOY_VERCEL.md`,
   - `your-app.onrender.com` — see `DEPLOY_RENDER.md`,
   - your custom domain, if any.
3. Without this step, `signInWithPopup` fails with `auth/unauthorized-domain`.

---

## How role binding works

| Action | Result |
|--------|--------|
| Register as Candidate | `users.role = CANDIDATE` + empty `candidate_profiles` row |
| Register as Recruiter | `users.role = RECRUITER` + empty `company_profiles` row |
| Google sign-in (first time) | Defaults to `CANDIDATE` role, auto-synced |
| Existing demo-mode user signs in with same email | Firebase UID is attached to the existing row (roles preserved) |

Admins must be promoted directly in the database:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'you@company.com';
```

---

## Troubleshooting

| Symptom | Cause & fix |
|---------|-------------|
| App still shows "Demo mode" | `FIREBASE_SERVICE_ACCOUNT_JSON` missing/invalid — check server logs for `[EthioHire] Failed to initialize Firebase Admin`; `/api/auth/config` returns a `reason` field |
| `Invalid PEM formatted message` in server logs | The `private_key` lost its `\n` escapes. Re-paste the JSON as ONE line keeping the `\n` sequences exactly as downloaded (double-escaped `\\n` is also tolerated and normalized) |
| `auth/configuration-not-found` | Authentication not enabled in Step 2 |
| `auth/unauthorized-domain` | Add your domain in Step 7 |
| `auth/invalid-api-key` | `NEXT_PUBLIC_FIREBASE_API_KEY` wrong or missing |
| Google popup opens a broken/blank URL | `authDomain` was set with an `https://` prefix — remove the scheme (the backend sanitizes it automatically, but keep the `.env` clean) |
| 401 from API routes after Firebase login | The ID token reached the server but Admin verification failed — verify the service-account JSON belongs to the **same project** |
| First-time Google/email user stuck at sign-in | Fixed: `/api/auth/firebase-sync` provisions unknown Firebase identities directly from the verified Bearer token (previously a 401 deadlock) |
| `auth/operation-not-allowed` | The provider isn't enabled in the Firebase console |
| Register/sign-in crashes with `Cannot read properties of undefined (reading 'name')` | Fixed: the client now reads the `user` field of the `/api/auth/firebase-sync` response and surfaces backend errors as readable toasts (older builds destructured a non-existent `data` field) |
| Console spams `Cross-Origin-Opener-Policy policy would block the window.closed call` during Google sign-in | The page was missing the COOP header. Fixed — the app now sends `Cross-Origin-Opener-Policy: same-origin-allow-popups` from Vite dev, nginx and Django. If you host behind your OWN reverse proxy, add this header to HTML responses. The client also falls back to the full-page-redirect Google flow when a popup is blocked |

**Security notes**

- `NEXT_PUBLIC_*` values are public by design — Firebase web keys are safe to expose.
- The service account JSON is the server-side secret; never ship it to the browser or Git.
- ID tokens expire after 1 hour; the client refreshes them automatically on each request.
