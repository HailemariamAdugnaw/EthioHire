const { Queue, Worker } = require('bullmq');
const redis = require('../config/redis');
const { sendEmail, sendSms } = require('../services/notificationService');

let queuesEnabled = true;
let referenceQueue;
let notificationQueue;

try {
  referenceQueue = new Queue('reference-check', { connection: redis });
  notificationQueue = new Queue('notifications', { connection: redis });
} catch (_error) {
  queuesEnabled = false;
}

async function queueOrRun(queue, name, data, fallback) {
  if (!queuesEnabled || !queue) {
    await fallback(data);
    return;
  }
  await queue.add(name, data);
}

async function enqueueReferenceSurvey(data) {
  await queueOrRun(referenceQueue, 'reference-survey', data, async (payload) => {
    await sendEmail(payload.email, 'EthioHire Reference Survey', `Please complete reference survey for ${payload.candidateName}`);
  });
}

async function enqueueNotification(data) {
  await queueOrRun(notificationQueue, 'application-status', data, async (payload) => {
    await Promise.all([
      sendEmail(payload.email, payload.subject, payload.message),
      sendSms(payload.phone, payload.message),
    ]);
  });
}

function startWorkers() {
  if (!queuesEnabled) return;

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
      await Promise.all([
        sendEmail(job.data.email, job.data.subject, job.data.message),
        sendSms(job.data.phone, job.data.message),
      ]);
    },
    { connection: redis },
  );
}

module.exports = {
  startWorkers,
  enqueueReferenceSurvey,
  enqueueNotification,
};
