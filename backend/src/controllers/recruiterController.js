const z = require('zod');
const prisma = require('../config/db');
const { created, ok, fail } = require('../utils/response');
const { logAudit } = require('../services/auditService');
const { asArray, parseJsonField } = require('../utils/validation');

const companySchema = z.object({
  companyName: z.string().trim().min(2),
  verificationStatus: z.string().trim().optional(),
});

const knockoutSchema = z.array(z.object({
  key: z.string().min(1),
  text: z.string().min(1),
  requiredAnswer: z.boolean(),
}));

const jobSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().min(10),
  minExperienceYears: z.coerce.number().int().min(0),
  minGpa: z.coerce.number().min(0).max(4),
  targetGradYearStart: z.coerce.number().int(),
  targetGradYearEnd: z.coerce.number().int(),
  allowedDegreeLevels: z.array(z.string().min(1)).min(1),
  salaryMin: z.coerce.number().positive(),
  salaryMax: z.coerce.number().positive(),
  knockoutQuestions: knockoutSchema,
});

async function upsertCompany(req, res) {
  const parsed = companySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const company = await prisma.companyProfile.upsert({
    where: { userId: req.user.id },
    update: { companyName: parsed.data.companyName, verificationStatus: parsed.data.verificationStatus || 'PENDING' },
    create: { userId: req.user.id, companyName: parsed.data.companyName },
  });

  await logAudit({ userId: req.user.id, action: 'UPSERT_COMPANY', entityType: 'CompanyProfile', entityId: company.id });
  return created(res, company, 'Company profile saved');
}

async function createJob(req, res) {
  const payload = {
    ...req.body,
    allowedDegreeLevels: asArray(req.body.allowedDegreeLevels),
    knockoutQuestions: parseJsonField(req.body.knockoutQuestions, req.body.knockoutQuestions || []),
  };

  const parsed = jobSchema.safeParse(payload);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
  if (parsed.data.salaryMax < parsed.data.salaryMin) return fail(res, 400, 'salaryMax must be greater than salaryMin');
  if (parsed.data.targetGradYearEnd < parsed.data.targetGradYearStart) {
    return fail(res, 400, 'targetGradYearEnd must be >= targetGradYearStart');
  }

  const company = await prisma.companyProfile.findUnique({ where: { userId: req.user.id } });
  if (!company) return fail(res, 400, 'Create company profile first');

  const job = await prisma.jobPosting.create({ data: { companyId: company.id, ...parsed.data } });
  await logAudit({ userId: req.user.id, action: 'CREATE_JOB', entityType: 'JobPosting', entityId: job.id });
  return created(res, job, 'Job posting created');
}

async function listJobs(req, res) {
  const company = await prisma.companyProfile.findUnique({ where: { userId: req.user.id } });
  if (!company) return fail(res, 400, 'Create company profile first');

  const jobs = await prisma.jobPosting.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: 'desc' },
    include: { questions: true, applications: true },
  });

  return ok(res, jobs);
}

async function listApplicants(req, res) {
  const company = await prisma.companyProfile.findUnique({ where: { userId: req.user.id } });
  if (!company) return fail(res, 400, 'Create company profile first');

  const jobs = await prisma.jobPosting.findMany({
    where: { companyId: company.id },
    include: {
      applications: {
        include: { candidate: true, proctoringLogs: true, schedules: true, answers: { include: { question: true } } },
      },
    },
  });

  return ok(res, jobs);
}

module.exports = { upsertCompany, createJob, listJobs, listApplicants };
