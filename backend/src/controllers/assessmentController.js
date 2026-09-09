const prisma = require('../config/db');
const { created, ok, fail } = require('../utils/response');

async function addQuestion(req, res) {
  const question = await prisma.assessmentQuestion.create({
    data: {
      jobId: req.body.jobId,
      questionText: req.body.questionText,
      questionType: req.body.questionType,
      expectedAnswer: req.body.expectedAnswer,
      timeLimitSeconds: req.body.timeLimitSeconds,
    },
  });

  return created(res, question, 'Question added');
}

async function startAssessment(req, res) {
  const application = await prisma.jobApplication.findUnique({
    where: { id: req.body.applicationId },
    include: { job: { include: { questions: true } } },
  });

  if (!application || application.candidateId !== req.body.candidateId) return fail(res, 404, 'Application not found');
  if (!application.preScreenPassed) return fail(res, 403, 'Pre-screen failed');
  if (application.attemptCount >= 1) return fail(res, 409, 'Assessment already attempted for this job');

  const updated = await prisma.jobApplication.update({
    where: { id: application.id },
    data: { attemptCount: 1, status: 'ASSESSMENT_IN_PROGRESS' },
  });

  return ok(res, {
    application: updated,
    questions: application.job.questions,
    serverTime: new Date().toISOString(),
    instructions: 'Stay fullscreen and keep webcam active. Any suspicious activity is logged.',
  });
}

async function submitAnswer(req, res) {
  const answer = await prisma.assessmentAnswer.create({
    data: {
      applicationId: req.body.applicationId,
      questionId: req.body.questionId,
      answerText: req.body.answerText,
      score: req.body.score || 0,
    },
  });
  return created(res, answer, 'Answer submitted');
}

async function completeAssessment(req, res) {
  const answers = await prisma.assessmentAnswer.findMany({ where: { applicationId: req.body.applicationId } });
  const avg = answers.length ? answers.reduce((sum, item) => sum + item.score, 0) / answers.length : 0;
  const passed = avg >= (req.body.passMark || 60);

  const application = await prisma.jobApplication.update({
    where: { id: req.body.applicationId },
    data: { status: passed ? 'ASSESSMENT_PASSED' : 'ASSESSMENT_FAILED', matchScore: avg },
  });

  return ok(res, { application, averageScore: avg, passed });
}

async function logProctoringEvent(req, res) {
  const entry = await prisma.proctoringLog.create({
    data: {
      applicationId: req.body.applicationId,
      eventType: req.body.eventType,
      snapshotUrl: req.body.snapshotUrl,
      metadata: req.body.metadata || {},
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
