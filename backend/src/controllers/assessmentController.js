const z = require('zod');
const prisma = require('../config/db');
const { created, ok, fail } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const addQuestionSchema = z.object({
  jobId: z.string().uuid(),
  questionText: z.string().trim().min(5),
  questionType: z.enum(['MCQ', 'SHORT_TEXT', 'BOOLEAN']),
  expectedAnswer: z.string().optional(),
  timeLimitSeconds: z.coerce.number().int().min(30).max(600),
});

const startAssessmentSchema = z.object({ applicationId: z.string().uuid() });
const submitAnswerSchema = z.object({
  applicationId: z.string().uuid(),
  questionId: z.string().uuid(),
  answerText: z.string().trim().min(1),
});

const completeAssessmentSchema = z.object({
  applicationId: z.string().uuid(),
  passMark: z.coerce.number().min(0).max(100).optional(),
});

const proctorSchema = z.object({
  applicationId: z.string().uuid(),
  eventType: z.enum(['TAB_SWITCH', 'FACE_MISSING', 'COPY_PASTE', 'MULTI_FACE', 'EXIT_FULLSCREEN']),
  snapshotUrl: z.string().url().optional().or(z.literal('')),
  metadata: z.record(z.string(), z.any()).optional(),
});

async function addQuestion(req, res) {
  const parsed = addQuestionSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const company = await prisma.companyProfile.findUnique({ where: { userId: req.user.id } });
  if (!company) return fail(res, 400, 'Create company profile first');

  const job = await prisma.jobPosting.findFirst({ where: { id: parsed.data.jobId, companyId: company.id } });
  if (!job) return fail(res, 404, 'Job not found');

  const question = await prisma.assessmentQuestion.create({ data: parsed.data });
  await logAudit({ userId: req.user.id, action: 'ADD_ASSESSMENT_QUESTION', entityType: 'AssessmentQuestion', entityId: question.id });
  return created(res, question, 'Question added');
}

async function startAssessment(req, res) {
  const parsed = startAssessmentSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return fail(res, 404, 'Candidate profile not found');

  const application = await prisma.jobApplication.findFirst({
    where: { id: parsed.data.applicationId, candidateId: profile.id },
    include: { job: { include: { questions: true } } },
  });

  if (!application) return fail(res, 404, 'Application not found');
  if (!application.preScreenPassed) return fail(res, 403, 'Pre-screen failed');
  if (application.attemptCount >= 1) return fail(res, 409, 'Assessment already attempted for this job');

  const updated = await prisma.jobApplication.update({
    where: { id: application.id },
    data: { attemptCount: 1, status: 'ASSESSMENT_IN_PROGRESS' },
  });

  await logAudit({ userId: req.user.id, action: 'START_ASSESSMENT', entityType: 'JobApplication', entityId: application.id });

  return ok(res, {
    application: updated,
    questions: application.job.questions,
    serverTime: new Date().toISOString(),
    instructions: 'Stay fullscreen and keep webcam active. Any suspicious activity is logged.',
  });
}

async function submitAnswer(req, res) {
  const parsed = submitAnswerSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return fail(res, 404, 'Candidate profile not found');

  const application = await prisma.jobApplication.findFirst({
    where: { id: parsed.data.applicationId, candidateId: profile.id },
  });

  if (!application || application.status !== 'ASSESSMENT_IN_PROGRESS') {
    return fail(res, 403, 'Assessment not in progress');
  }

  const question = await prisma.assessmentQuestion.findUnique({ where: { id: parsed.data.questionId } });
  if (!question || question.jobId !== application.jobId) return fail(res, 404, 'Question not found');

  let score = 0;
  if (question.expectedAnswer) {
    score = question.expectedAnswer.trim().toLowerCase() === parsed.data.answerText.trim().toLowerCase() ? 100 : 0;
  }

  const answer = await prisma.assessmentAnswer.upsert({
    where: {
      applicationId_questionId: {
        applicationId: parsed.data.applicationId,
        questionId: parsed.data.questionId,
      },
    },
    update: { answerText: parsed.data.answerText, score, submittedAt: new Date() },
    create: { ...parsed.data, score },
  });

  return created(res, answer, 'Answer submitted');
}

async function completeAssessment(req, res) {
  const parsed = completeAssessmentSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return fail(res, 404, 'Candidate profile not found');

  const application = await prisma.jobApplication.findFirst({
    where: { id: parsed.data.applicationId, candidateId: profile.id },
  });
  if (!application || application.status !== 'ASSESSMENT_IN_PROGRESS') return fail(res, 403, 'Assessment not in progress');

  const answers = await prisma.assessmentAnswer.findMany({ where: { applicationId: parsed.data.applicationId } });
  const avg = answers.length ? answers.reduce((sum, item) => sum + item.score, 0) / answers.length : 0;
  const passMark = parsed.data.passMark ?? 60;
  const passed = avg >= passMark;

  const updated = await prisma.jobApplication.update({
    where: { id: parsed.data.applicationId },
    data: { status: passed ? 'ASSESSMENT_PASSED' : 'ASSESSMENT_FAILED', matchScore: avg },
  });

  await logAudit({ userId: req.user.id, action: 'COMPLETE_ASSESSMENT', entityType: 'JobApplication', entityId: updated.id, payload: { avg, passMark } });

  return ok(res, { application: updated, averageScore: avg, passed, passMark });
}

async function logProctoringEvent(req, res) {
  const parsed = proctorSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return fail(res, 404, 'Candidate profile not found');

  const application = await prisma.jobApplication.findFirst({
    where: { id: parsed.data.applicationId, candidateId: profile.id },
  });

  if (!application) return fail(res, 404, 'Application not found');

  const entry = await prisma.proctoringLog.create({
    data: {
      applicationId: parsed.data.applicationId,
      eventType: parsed.data.eventType,
      snapshotUrl: parsed.data.snapshotUrl || undefined,
      metadata: parsed.data.metadata || {},
    },
  });

  return created(res, entry, 'Proctoring event logged');
}

module.exports = {
  addQuestion,
  startAssessment,
  submitAnswer,
  completeAssessment,
  logProctoringEvent,
};
