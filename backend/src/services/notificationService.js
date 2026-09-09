const nodemailer = require('nodemailer');
const Twilio = require('twilio');
const env = require('../config/env');

function createMailer() {
  if (env.smtpHost && env.smtpUser && env.smtpPass) {
    return nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
  }

  return nodemailer.createTransport({ jsonTransport: true });
}

const mailer = createMailer();

function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  return Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function sendEmail(to, subject, text) {
  if (!to) return;
  await mailer.sendMail({ from: env.emailFrom, to, subject, text });
}

async function sendSms(to, body) {
  const client = getTwilioClient();
  if (!client || !to || !env.twilioFrom) return;
  await client.messages.create({ to, from: env.twilioFrom, body });
}

module.exports = { sendEmail, sendSms };
