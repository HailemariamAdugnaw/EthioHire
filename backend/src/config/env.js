const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

module.exports = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  s3Bucket: process.env.S3_BUCKET || 'ethiohire-dev',
  s3BaseUrl: process.env.S3_BASE_URL || 'http://localhost:9000',
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  twilioFrom: process.env.TWILIO_FROM || '',
};
