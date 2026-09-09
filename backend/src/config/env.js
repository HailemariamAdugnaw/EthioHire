const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

module.exports = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  s3Bucket: process.env.S3_BUCKET || 'ethiohire-dev',
  s3Region: process.env.S3_REGION || 'us-east-1',
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || 'noreply@ethiohire.local',
  twilioFrom: process.env.TWILIO_FROM || '',
};
