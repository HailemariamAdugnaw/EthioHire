const nodemailer = require('nodemailer');
const Twilio = require('twilio');

const mailer = nodemailer.createTransport({ jsonTransport: true });

function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  return Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function sendEmail(to, subject, text) {
  if (!to) return;
  await mailer.sendMail({ from: 'noreply@ethiohire.local', to, subject, text });
}

async function sendSms(to, body) {
  const client = getTwilioClient();
  if (!client || !to || !process.env.TWILIO_FROM) return;
  await client.messages.create({ to, from: process.env.TWILIO_FROM, body });
}

module.exports = { sendEmail, sendSms };
