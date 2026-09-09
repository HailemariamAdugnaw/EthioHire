const z = require('zod');
const prisma = require('../config/db');
const { created, ok, fail } = require('../utils/response');
const { uploadFile } = require('../services/storageService');
const { logAudit } = require('../services/auditService');

const profileSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(8),
  graduationYear: z.coerce.number().int().min(1950),
  universityName: z.string().trim().min(2),
  degreeLevel: z.string().trim().min(2),
  gpa: z.coerce.number().min(0).max(4),
  expectedSalary: z.coerce.number().positive(),
});

const referenceSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  relationship: z.string().trim().min(2),
});

async function upsertProfile(req, res) {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const cvUrl = req.files?.cv?.[0] ? (await uploadFile(req.files.cv[0], 'cv')).url : undefined;
  const credentialsUrl = req.files?.credentials?.[0] ? (await uploadFile(req.files.credentials[0], 'credentials')).url : undefined;

  const profile = await prisma.candidateProfile.upsert({
    where: { userId: req.user.id },
    update: { ...parsed.data, ...(cvUrl ? { cvUrl } : {}), ...(credentialsUrl ? { credentialsUrl } : {}) },
    create: { userId: req.user.id, ...parsed.data, cvUrl, credentialsUrl },
  });

  await logAudit({ userId: req.user.id, action: 'UPSERT_PROFILE', entityType: 'CandidateProfile', entityId: profile.id });
  return created(res, profile, 'Candidate profile saved');
}

async function addReference(req, res) {
  const parsed = referenceSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);

  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return fail(res, 400, 'Create profile first');

  const reference = await prisma.referenceContact.create({
    data: { candidateId: profile.id, ...parsed.data },
  });

  await logAudit({ userId: req.user.id, action: 'ADD_REFERENCE', entityType: 'ReferenceContact', entityId: reference.id });
  return created(res, reference, 'Reference added');
}

async function getProfile(req, res) {
  const profile = await prisma.candidateProfile.findUnique({
    where: { userId: req.user.id },
    include: {
      references: true,
      applications: {
        orderBy: { createdAt: 'desc' },
        include: { job: true, schedules: true, answers: true, proctoringLogs: true },
      },
    },
  });
  return ok(res, profile);
}

module.exports = { upsertProfile, addReference, getProfile };
