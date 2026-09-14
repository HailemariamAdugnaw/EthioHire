# EthioHire — Resend Setup (Reporting & Decisioning Notifications)

**Resend** ([resend.com](https://resend.com)) is the transactional email engine behind
EthioHire's *Reporting & Decisioning* layer. Every decision point in the hiring funnel
automatically emits branded email notifications, and every attempt is recorded in a
delivery audit trail inside the platform.

> **Nothing breaks without Resend.** While `RESEND_API_KEY` is empty, the in-app
> notifications still fire and each email is logged as `SKIPPED` in the delivery log,
> so you can build and test the whole funnel first and wire Resend in whenever you like.

---

## What EthioHire sends through Resend

| Decision point (`decisionPoint`) | Recipient | Content |
|----------------------------------|-----------|---------|
| `APPLICATION_RECEIVED` | Candidate + Company | Pre-screen outcome, **match score /100**, next steps (or auto-reject reasons) |
| `EXAM_EVALUATED` | Company | **Evaluation summary report**: match score, exam score, pass/fail badge, violation count and the **full proctoring audit log table** |
| `EXAM_EVALUATED` | Candidate | Exam score vs pass mark — or "results withheld" notice in MANUAL release mode |
| `EXAM_RESULTS_RELEASED` | Candidate | Published result after the recruiter releases scores |
| `INTERVIEW_SCHEDULED` | Candidate + Company | Invitation with date, format, interviewer and the **join link** (LiveKit room when configured — see `LIVEKIT_SETUP.md`) |
| `INTERVIEW_COMPLETED` | Both parties | Completion notice |
| `INTERVIEW_EVALUATED` | Candidate | Structured interview evaluation with the overall score /100 |
| `APPLICATION_SHORTLISTED` / `APPLICATION_REJECTED` / `APPLICATION_HIRED` | Candidate | Status-change decision with reason, match + exam scores |
| `COMPANY_VERIFICATION` | Company | Account verified / suspended notice |

All emails share a branded template (EthioHire header, key-value summary tables,
status badges, call-to-action button deep-linking into the right portal page).

---

## Step 1 — Create a Resend account and API key

1. Go to [resend.com](https://resend.com) → **Sign up** (free tier: 100 emails/day,
   3,000/month — plenty for a hiring funnel demo).
2. Confirm your email address.
3. In the dashboard open **API Keys** → **Create API Key**.
4. Name: `ethiohire` — Permission: **Full access** (sending needs only *Sending access*
   if you prefer least-privilege) → **Create**.
5. Copy the key — it starts with `re_` and is shown **only once**.

## Step 2 — Choose your "From" identity

**Option A — Resend sandbox (testing only, zero setup):**

```env
EMAIL_FROM=EthioHire <onboarding@resend.dev>
```

Restrictions: you can only send **to your own Resend account's email address**.
Perfect for verifying the plumbing; useless for real candidates.

**Option B — Your own domain (production):**

1. Resend dashboard → **Domains** → **Add Domain** → enter e.g. `notify.yourdomain.com`.
2. Resend shows the DNS records to create at your registrar/DNS provider:
   - **DKIM** (two TXT records) — signing,
   - **SPF** (TXT record) and optionally **DMARC** — anti-spoofing,
   - a **MX** record for the return-path subdomain.
3. Create the records, then click **Verify** in the Resend dashboard
   (DNS propagation can take from minutes to a few hours).
4. When the domain shows **Verified**, use it:

```env
EMAIL_FROM=EthioHire <no-reply@notify.yourdomain.com>
```

> Any subdomain works (`notify.``, mail.`, `hire.`) — keep your root domain's
> existing email untouched; Resend only manages the subdomain you add.

## Step 3 — Configure EthioHire

Add to your project-root `.env` (or your host's environment dashboard):

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=EthioHire <no-reply@notify.yourdomain.com>
# Where email links point (your frontend URL):
PUBLIC_APP_URL=https://your-app.example.com
```

Restart the backend. Verify the integration state:

```bash
curl http://localhost:8000/api/health
# { ..., "integrations": { "email": "resend", "sms": "not-configured", "livekit": "..." } }
```

`"email": "resend"` = the key is loaded and emails will actually send.

## Step 4 — Trigger a real email and watch the audit trail

1. Sign in as a candidate and apply to any open job.
2. Open **Admin portal → Notifications** (`/#/admin/notifications`). You should see two
   `APPLICATION_RECEIVED` rows — one to the candidate, one to the company — with
   status **SENT** and a Resend provider id.
3. Check the candidate's inbox and the Resend dashboard → **Logs** (every send with
   the full payload, delivery status and open tracking).

Programmatic check:

```bash
# as an admin
curl -H "Authorization: Bearer <sessionToken>" \
     "http://localhost:8000/api/admin/notification-logs?take=20"
```

Every row: `decisionPoint`, `channel`, `recipient`, `subject`, `status`
(`SENT` / `FAILED` / `SKIPPED`), `providerId`, and the provider `error` when applicable.

---

## SMS status notifications (adapter)

**Resend is an email-only API** — it does not send SMS. EthioHire ships a generic
**SMS webhook adapter** so status notifications can also reach phones:

```env
SMS_HTTP_URL=https://your-gateway.example.com/sms
SMS_HTTP_TOKEN=your-gateway-api-token
```

The adapter POSTs `{"to": "+2519...", "text": "..."}` with an
`Authorization: Bearer <SMS_HTTP_TOKEN>` header. Point it at:

- **Twilio** — via a small function/proxy that maps the webhook to Twilio's REST API,
- **Africa's Talking** — popular in the Ethiopian market, same pattern,
- any SMS gateway that accepts JSON.

Every SMS attempt is logged in the same delivery audit trail (`channel: SMS`).
With `SMS_HTTP_URL` empty, SMS rows are logged as `SKIPPED`.

---

## How it works inside the codebase

| File | Purpose |
|------|---------|
| `backend/eh/notifications.py` | Resend client (`POST https://api.resend.com/emails`), SMS adapter, branded HTML templates, all `report_*` decision-point functions |
| `backend/eh/models.py` | `NotificationLog` model — the delivery audit trail |
| `backend/eh/common.py` | `notify()` helper now routes `EMAIL`/`SMS` channels through the module |
| `backend/eh/views/applications.py` | Exam evaluation reports, shortlist/reject/hire decisions, interview scheduling |
| `backend/eh/views/misc.py` | Interview invitations, evaluation notifications, `GET /api/admin/notification-logs` |
| `backend/eh/views/jobs.py` | `APPLICATION_RECEIVED` on apply |
| `frontend/src/components/ethiohire/admin/portal.tsx` | Admin "Notifications" view (providers + delivery log) |

Design guarantees:

- **Fail-safe** — a Resend outage or misconfiguration never breaks the API request
  that triggered the notification (everything is wrapped and logged).
- **One row per attempt** — the audit trail records sends, failures *and* skips.
- **No secrets in the client** — the API key only ever lives in the backend environment.

---

## Troubleshooting

| Symptom | Cause & fix |
|---------|-------------|
| Log rows show `SKIPPED` — "RESEND_API_KEY is not set" | Key missing in the backend environment — add it and restart |
| `Resend HTTP 401` in the error column | API key invalid or revoked — create a fresh one |
| `Resend HTTP 403` — "domain not verified" | `EMAIL_FROM` uses a domain that hasn't passed DNS verification (Step 2 Option B), or you're sending to someone other than your own address while still on `onboarding@resend.dev` |
| Emails land in spam | Complete SPF + DKIM + DMARC for the sending domain (Step 2), keep `From` on the same domain you verified |
| `Resend HTTP 429` | Daily/monthly limit hit — upgrade the Resend plan |
| Admin "Notifications" page shows providers as "not-configured" but `.env` has the key | Backend process started before `.env` was edited — restart the backend (`docker compose restart backend` or re-run `scripts/dev-stack.sh`) |
| No email but log says `SENT` | Check the recipient's spam folder, then Resend dashboard → **Logs** for the provider-side delivery status |

**Security notes**

- The API key is a secret: keep it out of Git, rotate it if it leaks
  (Resend dashboard → API Keys → … → Delete + recreate).
- Use a *Sending access* key (not full access) if you don't need domain management from the API.
- Candidate emails contain only decision information — no documents or scores of other applicants.
