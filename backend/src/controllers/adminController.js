const prisma = require('../config/db');
const { ok } = require('../utils/response');

async function getAnalytics(_req, res) {
  const [totalUsers, totalJobs, totalApplications, hired] = await Promise.all([
    prisma.user.count(),
    prisma.jobPosting.count(),
    prisma.jobApplication.count(),
    prisma.jobApplication.count({ where: { status: 'HIRED' } }),
  ]);

  return ok(res, {
    totalUsers,
    totalJobs,
    totalApplications,
    hired,
    conversionRate: totalApplications ? (hired / totalApplications) * 100 : 0,
  });
}

async function setCompanyVerification(req, res) {
  const company = await prisma.companyProfile.update({
    where: { id: req.body.companyId },
    data: { verificationStatus: req.body.verificationStatus },
  });

  return ok(res, company, 'Company verification updated');
}

module.exports = { getAnalytics, setCompanyVerification };
