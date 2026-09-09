# EthioHire

**Tagline:** *Ethiopia's Smart Hiring Platform*

EthioHire is an automated recruitment, pre-screening, proctored assessment, and live interview platform.

## Monorepo structure

- `/frontend` - React + Tailwind candidate/recruiter/admin portals
- `/backend` - Node.js API, Socket.io signaling, BullMQ workers
- `/backend/prisma/schema.prisma` - PostgreSQL schema

## Core capabilities included

- Role-based authentication for `ADMIN`, `RECRUITER`, `CANDIDATE`
- ATS Stage 1 pre-screening (GPA, graduation year, degree level, salary, knockout checks)
- Candidate profile + CV/credential upload flow
- Reference contact intake + background survey queue dispatch
- Timed Stage 2 assessment workflows with one-attempt gating
- Proctoring log ingestion for anti-cheat events
- Stage 3 interview scheduling + scoring templates
- Admin analytics and company verification endpoints
- Socket.io signaling hooks for live interview rooms

## Backend setup

1. Copy `/home/runner/work/EthioHire/EthioHire/backend/.env.example` to `/home/runner/work/EthioHire/EthioHire/backend/.env`
2. Set a valid PostgreSQL `DATABASE_URL`
3. Ensure Redis is running for BullMQ queues
4. Run:

```bash
cd /home/runner/work/EthioHire/EthioHire
npm install
npm run prisma:generate -w backend
npm run dev -w backend
```

## Frontend setup

```bash
cd /home/runner/work/EthioHire/EthioHire
npm install
npm run dev -w frontend
```

Set `VITE_API_URL` if backend is not on `http://localhost:4000/api`.

## API overview

Base URL: `/api`

- `POST /auth/register`
- `POST /auth/login`
- `GET /jobs`
- `POST /applications`
- `POST /candidate/profile`
- `GET /candidate/profile`
- `POST /candidate/references`
- `POST /recruiter/company`
- `POST /recruiter/jobs`
- `GET /recruiter/applicants`
- `POST /recruiter/questions`
- `POST /recruiter/interviews`
- `POST /recruiter/interview-scorecard`
- `POST /assessment/start`
- `POST /assessment/answers`
- `POST /assessment/complete`
- `POST /assessment/proctoring-log`
- `GET /admin/analytics`
- `POST /admin/company-verification`

## Notes

- S3 storage is abstracted in `storageService` with a safe fake upload URL builder; wire to AWS SDK or MinIO client in production.
- Notification and reference check dispatch are queued with BullMQ workers.
- Add migrations and seed data before production deployment.
