const express = require('express');
const multer = require('multer');
const { register, login } = require('../controllers/authController');
const { upsertProfile, getProfile, addReference } = require('../controllers/candidateController');
const { upsertCompany, createJob, listApplicants } = require('../controllers/recruiterController');
const { listOpenJobs, applyToJob } = require('../controllers/applicationController');
const {
  addQuestion,
  startAssessment,
  submitAnswer,
  completeAssessment,
  logProctoringEvent,
} = require('../controllers/assessmentController');
const { scheduleInterview, submitScorecard } = require('../controllers/interviewController');
const { getAnalytics, setCompanyVerification } = require('../controllers/adminController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware');
const { authLimiter, apiLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'EthioHire API' }));
router.post('/auth/register', authLimiter, register);
router.post('/auth/login', authLimiter, login);

router.get('/jobs', listOpenJobs);
router.post('/applications', apiLimiter, authMiddleware, allowRoles('CANDIDATE'), applyToJob);

router.post(
  '/candidate/profile',
  apiLimiter,
  authMiddleware,
  allowRoles('CANDIDATE'),
  upload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'credentials', maxCount: 1 },
  ]),
  upsertProfile,
);
router.get('/candidate/profile', apiLimiter, authMiddleware, allowRoles('CANDIDATE'), getProfile);
router.post('/candidate/references', apiLimiter, authMiddleware, allowRoles('CANDIDATE'), addReference);

router.post('/recruiter/company', apiLimiter, authMiddleware, allowRoles('RECRUITER'), upsertCompany);
router.post('/recruiter/jobs', apiLimiter, authMiddleware, allowRoles('RECRUITER'), createJob);
router.get('/recruiter/applicants', apiLimiter, authMiddleware, allowRoles('RECRUITER'), listApplicants);
router.post('/recruiter/questions', apiLimiter, authMiddleware, allowRoles('RECRUITER'), addQuestion);
router.post('/recruiter/interviews', apiLimiter, authMiddleware, allowRoles('RECRUITER'), scheduleInterview);
router.post('/recruiter/interview-scorecard', apiLimiter, authMiddleware, allowRoles('RECRUITER'), submitScorecard);

router.post('/assessment/start', apiLimiter, authMiddleware, allowRoles('CANDIDATE'), startAssessment);
router.post('/assessment/answers', apiLimiter, authMiddleware, allowRoles('CANDIDATE'), submitAnswer);
router.post('/assessment/complete', apiLimiter, authMiddleware, allowRoles('CANDIDATE'), completeAssessment);
router.post('/assessment/proctoring-log', apiLimiter, authMiddleware, allowRoles('CANDIDATE'), logProctoringEvent);

router.get('/admin/analytics', apiLimiter, authMiddleware, allowRoles('ADMIN'), getAnalytics);
router.post('/admin/company-verification', apiLimiter, authMiddleware, allowRoles('ADMIN'), setCompanyVerification);

module.exports = router;
