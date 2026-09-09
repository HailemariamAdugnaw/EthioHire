const { Queue, Worker } = require('bullmq');
const redis = require('../config/redis');
const { sendEmail } = require('../services/notificationService');

const referenceQueue = new Queue('reference-check', { connection: redis });
const notificationQueue = new Queue('notifications', { connection: redis });

function startWorkers() {
  new Worker(
    'reference-check',
    async (job) => {
      await sendEmail(job.data.email, 'EthioHire Reference Survey', `Please complete reference survey for ${job.data.candidateName}`);
    },
    { connection: redis },
  );

  new Worker(
    'notifications',
    async (job) => {
      await sendEmail(job.data.email, job.data.subject, job.data.message);
    },
    { connection: redis },
  );
}

module.exports = { referenceQueue, notificationQueue, startWorkers };
