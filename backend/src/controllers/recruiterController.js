const z = require('zod');
const prisma = require('../config/db');
const { created, ok, fail } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const jobSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(10),
  minExperienceYears: z.number().int().min(0),
  minGpa: z.number().min(0).max(4),
  targetGradYearStart: z.number().int(),
  targetGradYearEnd: z.number().int(),
  allowedDegreeLevels: z.array(z.string()).min(1),
  salaryMin: z.number().positive(),
  salaryMax: z.number().positive(),
  knockoutQuestions: z.array(z.object({ key: z.string(), text: z.string(), requiredAnswer: z.boolean() })),
});

async function upsertCompany(req, res) {
  const company = await prisma.companyProfile.upsert({
    where: { userId: req.user.id },
    update: { companyName: req.body.companyName, verificationStatus: req.body.verificationStatus || 'PENDING' },
    create: { userId: req.user.id, companyName: req.body.companyName },
  });
  await logAudit({ userId: req.user.id, action: 'UPSERT_COMPANY', entityType: 'CompanyProfile', entityId: company.id });
  return created(res, company, 'Company profile saved');
}

async function createJob(req, res) {
  const parsed = jobSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const company = await prisma.companyProfile.findUnique({ where: { userId: req.user.id } });
  if (!company) return fail(res, 400, 'Create company profile first');

  const job = await prisma.jobPosting.create({ data: { companyId: company.id, ...parsed.data } });
  await logAudit({ userId: req.user.id, action: 'CREATE_JOB', entityType: 'JobPosting', entityId: job.id });
  return created(res, job, 'Job posting created');
}

async function listApplicants(req, res) {
  const company = await prisma.companyProfile.findUnique({ where: { userId: req.user.id } });
  if (!company) return fail(res, 400, 'Create company profile first');

  const jobs = await prisma.jobPosting.findMany({
    where: { companyId: company.id },
    include: {
      applications: {
        include: { candidate: true, proctoringLogs: true, schedules: true, answers: true },
      },
    },
  });

  return ok(res, jobs);
}

module.exports = { upsertCompany, createJob, listApplicants };
