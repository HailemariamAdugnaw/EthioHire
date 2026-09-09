const z = require('zod');
const prisma = require('../config/db');
const { created, ok, fail } = require('../utils/response');
const { evaluatePreScreen } = require('../utils/prescreen');
const { enqueueReferenceSurvey, enqueueNotification } = require('../workers/queues');
const { logAudit } = require('../services/auditService');

const applySchema = z.object({
  jobId: z.string().uuid(),
  knockoutAnswers: z.record(z.string(), z.boolean()).optional(),
});

async function listOpenJobs(_req, res) {
  const jobs = await prisma.jobPosting.findMany({
    where: { isOpen: true },
    select: {
      id: true,
      title: true,
      description: true,
      minExperienceYears: true,
      minGpa: true,
      targetGradYearStart: true,
      targetGradYearEnd: true,
      allowedDegreeLevels: true,
      salaryMin: true,
      salaryMax: true,
      knockoutQuestions: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, jobs);
}

async function applyToJob(req, res) {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const candidate = await prisma.candidateProfile.findUnique({
    where: { userId: req.user.id },
    include: { user: true, references: true },
  });
  if (!candidate) return fail(res, 400, 'Create candidate profile first');

  const job = await prisma.jobPosting.findUnique({ where: { id: parsed.data.jobId } });
  if (!job || !job.isOpen) return fail(res, 404, 'Job not found');

  const preScreen = evaluatePreScreen(candidate, job, parsed.data.knockoutAnswers || {});
  const application = await prisma.jobApplication.upsert({
    where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } },
    update: {
      status: preScreen.passed ? 'PRE_SCREEN_PASSED' : 'PRE_SCREEN_REJECTED',
      preScreenPassed: preScreen.passed,
      matchScore: preScreen.score,
      preScreenReason: preScreen.reasons.join('; ') || null,
    },
    create: {
      jobId: job.id,
      candidateId: candidate.id,
      status: preScreen.passed ? 'PRE_SCREEN_PASSED' : 'PRE_SCREEN_REJECTED',
      preScreenPassed: preScreen.passed,
      matchScore: preScreen.score,
      preScreenReason: preScreen.reasons.join('; ') || null,
    },
  });

  await enqueueNotification({
    email: candidate.user.email,
    phone: candidate.phone,
    subject: `EthioHire Application Update: ${job.title}`,
    message: `Pre-screen result: ${preScreen.passed ? 'Passed' : 'Rejected'}. ${preScreen.reasons.join(', ') || 'No issues found.'}`,
  });

  await Promise.all(
    candidate.references.map((ref) => enqueueReferenceSurvey({ email: ref.email, candidateName: candidate.fullName })),
  );

  await logAudit({ userId: req.user.id, action: 'APPLY_TO_JOB', entityType: 'JobApplication', entityId: application.id });

  return created(res, { application, preScreen }, 'Application submitted');
}

async function listMyApplications(req, res) {
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return ok(res, []);

  const applications = await prisma.jobApplication.findMany({
    where: { candidateId: profile.id },
    include: {
      job: true,
      schedules: true,
      answers: { include: { question: true } },
      proctoringLogs: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return ok(res, applications);
}

module.exports = { listOpenJobs, applyToJob, listMyApplications };
