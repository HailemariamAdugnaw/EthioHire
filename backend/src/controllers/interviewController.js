const { v4: uuid } = require('uuid');
const prisma = require('../config/db');
const { created, ok, fail } = require('../utils/response');

async function scheduleInterview(req, res) {
  const application = await prisma.jobApplication.findUnique({ where: { id: req.body.applicationId } });
  if (!application || application.status !== 'ASSESSMENT_PASSED') {
    return fail(res, 400, 'Candidate must pass assessment first');
  }

  const schedule = await prisma.interviewSchedule.create({
    data: {
      applicationId: req.body.applicationId,
      scheduledTime: new Date(req.body.scheduledTime),
      meetingLink: `${req.protocol}://${req.get('host')}/live/${uuid()}`,
      interviewerId: req.user.id,
    },
  });

  await prisma.jobApplication.update({
    where: { id: req.body.applicationId },
    data: { status: 'INTERVIEW_SCHEDULED' },
  });

  return created(res, schedule, 'Interview scheduled');
}

async function submitScorecard(req, res) {
  const updated = await prisma.interviewSchedule.update({
    where: { id: req.body.interviewId },
    data: {
      scorecard: {
        responses: req.body.responses,
        totalScore: req.body.totalScore,
        recommendation: req.body.recommendation,
      },
      status: 'COMPLETED',
    },
  });

  const nextStatus = req.body.recommendation === 'HIRE' ? 'HIRED' : 'REJECTED';
  await prisma.jobApplication.update({ where: { id: updated.applicationId }, data: { status: nextStatus } });

  return ok(res, updated, 'Interview scorecard submitted');
}

module.exports = { scheduleInterview, submitScorecard };
