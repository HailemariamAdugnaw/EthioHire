const z = require('zod');
const { v4: uuid } = require('uuid');
const prisma = require('../config/db');
const { created, ok, fail } = require('../utils/response');
const { logAudit } = require('../services/auditService');
const { enqueueNotification } = require('../workers/queues');

const scheduleSchema = z.object({
  applicationId: z.string().uuid(),
  scheduledTime: z.string().datetime(),
});

const scorecardSchema = z.object({
  interviewId: z.string().uuid(),
  responses: z.array(z.object({ question: z.string(), score: z.number(), notes: z.string().optional() })).default([]),
  totalScore: z.number().min(0).max(100),
  recommendation: z.enum(['HIRE', 'REJECT']),
});

async function scheduleInterview(req, res) {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const company = await prisma.companyProfile.findUnique({ where: { userId: req.user.id } });
  if (!company) return fail(res, 400, 'Create company profile first');

  const application = await prisma.jobApplication.findFirst({
    where: { id: parsed.data.applicationId, job: { companyId: company.id } },
    include: { candidate: { include: { user: true } }, job: true },
  });

  if (!application || application.status !== 'ASSESSMENT_PASSED') {
    return fail(res, 400, 'Candidate must pass assessment first');
  }

  const schedule = await prisma.interviewSchedule.create({
    data: {
      applicationId: parsed.data.applicationId,
      scheduledTime: new Date(parsed.data.scheduledTime),
      meetingLink: `${req.protocol}://${req.get('host')}/live/${uuid()}`,
      interviewerId: req.user.id,
    },
  });

  await prisma.jobApplication.update({
    where: { id: parsed.data.applicationId },
    data: { status: 'INTERVIEW_SCHEDULED' },
  });

  await enqueueNotification({
    email: application.candidate.user.email,
    phone: application.candidate.phone,
    subject: `Interview Scheduled: ${application.job.title}`,
    message: `Your interview is scheduled at ${parsed.data.scheduledTime}. Link: ${schedule.meetingLink}`,
  });

  await logAudit({ userId: req.user.id, action: 'SCHEDULE_INTERVIEW', entityType: 'InterviewSchedule', entityId: schedule.id });
  return created(res, schedule, 'Interview scheduled');
}

async function submitScorecard(req, res) {
  const parsed = scorecardSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const schedule = await prisma.interviewSchedule.findUnique({
    where: { id: parsed.data.interviewId },
    include: { application: { include: { job: true, candidate: { include: { user: true } } } } },
  });

  if (!schedule || schedule.interviewerId !== req.user.id) return fail(res, 404, 'Interview not found');

  const updated = await prisma.interviewSchedule.update({
    where: { id: parsed.data.interviewId },
    data: {
      scorecard: {
        responses: parsed.data.responses,
        totalScore: parsed.data.totalScore,
        recommendation: parsed.data.recommendation,
      },
      status: 'COMPLETED',
    },
  });

  const nextStatus = parsed.data.recommendation === 'HIRE' ? 'HIRED' : 'REJECTED';
  await prisma.jobApplication.update({ where: { id: updated.applicationId }, data: { status: nextStatus } });

  await enqueueNotification({
    email: schedule.application.candidate.user.email,
    phone: schedule.application.candidate.phone,
    subject: `Interview Decision: ${schedule.application.job.title}`,
    message: `Interview completed. Final status: ${nextStatus}`,
  });

  await logAudit({ userId: req.user.id, action: 'SUBMIT_SCORECARD', entityType: 'InterviewSchedule', entityId: updated.id });
  return ok(res, updated, 'Interview scorecard submitted');
}

module.exports = { scheduleInterview, submitScorecard };
