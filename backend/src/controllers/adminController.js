const z = require('zod');
const prisma = require('../config/db');
const { ok, fail } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const verificationSchema = z.object({
  companyId: z.string().uuid(),
  verificationStatus: z.enum(['PENDING', 'VERIFIED', 'SUSPENDED']),
});

async function getAnalytics(_req, res) {
  const [totalUsers, totalJobs, totalApplications, hired, queuedInterviews, proctoringFlags] = await Promise.all([
    prisma.user.count(),
    prisma.jobPosting.count(),
    prisma.jobApplication.count(),
    prisma.jobApplication.count({ where: { status: 'HIRED' } }),
    prisma.interviewSchedule.count({ where: { status: 'SCHEDULED' } }),
    prisma.proctoringLog.count(),
  ]);

  return ok(res, {
    totalUsers,
    totalJobs,
    totalApplications,
    hired,
    queuedInterviews,
    proctoringFlags,
    conversionRate: totalApplications ? (hired / totalApplications) * 100 : 0,
  });
}

async function listCompanies(_req, res) {
  const companies = await prisma.companyProfile.findMany({
    include: { jobs: true, user: { select: { id: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return ok(res, companies);
}

async function setCompanyVerification(req, res) {
  const parsed = verificationSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const company = await prisma.companyProfile.update({
    where: { id: parsed.data.companyId },
    data: { verificationStatus: parsed.data.verificationStatus },
  });

  await logAudit({
    userId: req.user.id,
    action: 'SET_COMPANY_VERIFICATION',
    entityType: 'CompanyProfile',
    entityId: company.id,
    payload: { status: parsed.data.verificationStatus },
  });

  return ok(res, company, 'Company verification updated');
}

module.exports = { getAnalytics, listCompanies, setCompanyVerification };
