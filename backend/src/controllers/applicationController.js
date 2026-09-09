const prisma = require('../config/db');
const { created, ok, fail } = require('../utils/response');
const { evaluatePreScreen } = require('../utils/prescreen');
const { referenceQueue, notificationQueue } = require('../workers/queues');

async function listOpenJobs(_req, res) {
  const jobs = await prisma.jobPosting.findMany({ where: { isOpen: true } });
  return ok(res, jobs);
}

async function applyToJob(req, res) {
  const candidate = await prisma.candidateProfile.findUnique({ where: { userId: req.user.id }, include: { user: true, references: true } });
  if (!candidate) return fail(res, 400, 'Create candidate profile first');

  const job = await prisma.jobPosting.findUnique({ where: { id: req.body.jobId } });
  if (!job) return fail(res, 404, 'Job not found');

  const preScreen = evaluatePreScreen(candidate, job, req.body.knockoutAnswers || {});
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

  await notificationQueue.add('application-status', {
    email: candidate.user.email,
    subject: `EthioHire Application Update: ${job.title}`,
    message: `Pre-screen result: ${preScreen.passed ? 'Passed' : 'Rejected'}. ${preScreen.reasons.join(', ')}`,
  });

  await Promise.all(
    candidate.references.map((ref) =>
      referenceQueue.add('reference-survey', { email: ref.email, candidateName: candidate.fullName }),
    ),
  );

  return created(res, { application, preScreen }, 'Application submitted');
}

module.exports = { listOpenJobs, applyToJob };
